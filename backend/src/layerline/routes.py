import base64
import json
import re
import uuid
from datetime import datetime
from decimal import Decimal
from operator import ge, gt, le, lt
from pathlib import PurePath
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy import Numeric, case, delete, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from layerline.config import get_settings
from layerline.context import RequestContext, get_context
from layerline.db import get_session
from layerline.errors import ApiError
from layerline.jobs import enqueue_import
from layerline.models import Dataset, ImportJob, MapLayer, SpatialFeature
from layerline.schemas import (
    ClearImportsResponse,
    ErrorResponse,
    Health,
    ImportJobListResponse,
    ImportJobOut,
    ImportJobResponse,
    MapLayerResponse,
)
from layerline.storage import LocalStorage, get_storage

router = APIRouter(prefix="/api/v1")

Ctx = Annotated[RequestContext, Depends(get_context)]
Session = Annotated[AsyncSession, Depends(get_session)]
Storage = Annotated[LocalStorage, Depends(get_storage)]

MAX_FILENAME_LENGTH = 255


def _display_name(filename: str) -> str:
    """Truncate for storage without losing the extension: it selects the parser at import time."""
    if len(filename) <= MAX_FILENAME_LENGTH:
        return filename
    suffix = PurePath(filename).suffix
    return filename[: MAX_FILENAME_LENGTH - len(suffix)] + suffix


ALLOWED_SUFFIXES = {".geojson", ".json", ".csv"}


def _not_found(what: str) -> ApiError:
    # Cross-organisation access looks identical to a missing entity (ADR 0003).
    return ApiError(404, "not_found", f"{what} not found.")


def _job_out(job: ImportJob, map_layer_id: uuid.UUID | None) -> ImportJobOut:
    return ImportJobOut.model_validate(
        {
            "id": job.id,
            "dataset_id": job.dataset_id,
            "original_filename": job.original_filename,
            "status": job.status,
            "created_at": job.created_at,
            "finished_at": job.finished_at,
            "feature_count": job.feature_count,
            "map_layer_id": map_layer_id,
            "errors": job.errors,
            "errors_truncated": job.errors_truncated,
        }
    )


MAX_PROPERTY_KEYS = 50
# Filterable property names must fit the `property` query parameter, or the UI would offer a
# filter the API then rejects.
MAX_PROPERTY_NAME = 100
MAX_FILTER_VALUE = 500

Comparator = Literal["=", ">", ">=", "<", "<="]
# [0-9], not \d: \d matches any Unicode decimal digit, which would let this pattern accept text
# Postgres's CAST(... AS NUMERIC) rejects, splitting the two "numeric" checks apart. Anchored so a
# partial match ("12abc") isn't mistaken for a number; no exponents/inf/nan since a stored property
# is free-form text.
NUMERIC_VALUE = re.compile(r"^-?[0-9]+(\.[0-9]+)?$")
_COMPARATORS = {">": gt, ">=": ge, "<": lt, "<=": le}


def _encode_cursor(job: ImportJob) -> str:
    raw = f"{job.created_at.isoformat()}|{job.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        created_at, job_id = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(created_at), uuid.UUID(job_id)
    except ValueError:
        raise ApiError(400, "validation_failed", "Invalid cursor.") from None


ERRORS: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse, "description": "Invalid request"},
    401: {"model": ErrorResponse, "description": "Authentication required"},
    404: {"model": ErrorResponse, "description": "Not found (or not in your organisation)"},
}


@router.get("/health")
async def health() -> Health:
    return Health(status="ok")


@router.post(
    "/datasets/{dataset_id}/imports",
    status_code=202,
    responses={**ERRORS, 413: {"model": ErrorResponse, "description": "File too large"}},
)
async def upload_import(
    dataset_id: uuid.UUID, file: UploadFile, ctx: Ctx, session: Session, storage: Storage
) -> ImportJobResponse:
    dataset = (
        await session.execute(
            select(Dataset.id).where(
                Dataset.id == dataset_id, Dataset.organisation_id == ctx.organisation_id
            )
        )
    ).scalar_one_or_none()
    if dataset is None:
        raise _not_found("Dataset")

    filename = file.filename or ""
    if PurePath(filename).suffix.lower() not in ALLOWED_SUFFIXES:
        raise ApiError(
            400, "unsupported_file_type", "Only .geojson, .json or .csv files are accepted."
        )

    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise ApiError(413, "file_too_large", f"File exceeds the {limit} byte limit.")

    key = storage.save(data)
    job = ImportJob(
        organisation_id=ctx.organisation_id,
        dataset_id=dataset_id,
        stored_path=key,
        original_filename=_display_name(filename),
    )
    session.add(job)
    await session.commit()
    # If this call fails, recover_imports re-enqueues the still-queued job.
    await enqueue_import(job.id)
    return ImportJobResponse(import_job=_job_out(job, None))


@router.get("/datasets/{dataset_id}/imports", responses=ERRORS)
async def list_imports(
    dataset_id: uuid.UUID,
    ctx: Ctx,
    session: Session,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
) -> ImportJobListResponse:
    dataset = (
        await session.execute(
            select(Dataset.id).where(
                Dataset.id == dataset_id, Dataset.organisation_id == ctx.organisation_id
            )
        )
    ).scalar_one_or_none()
    if dataset is None:
        raise _not_found("Dataset")

    query = (
        select(ImportJob, MapLayer.id)
        .outerjoin(MapLayer, MapLayer.import_job_id == ImportJob.id)
        .where(ImportJob.dataset_id == dataset_id, ImportJob.organisation_id == ctx.organisation_id)
        .order_by(ImportJob.created_at.desc(), ImportJob.id.desc())
        .limit(limit + 1)
    )
    if cursor is not None:
        created_at, job_id = _decode_cursor(cursor)
        query = query.where(tuple_(ImportJob.created_at, ImportJob.id) < tuple_(created_at, job_id))
    rows = (await session.execute(query)).all()

    page = rows[:limit]
    return ImportJobListResponse(
        import_jobs=[_job_out(job, layer_id) for job, layer_id in page],
        # A next page exists only if the extra probe row came back.
        next_cursor=_encode_cursor(page[-1][0]) if len(rows) > limit else None,
    )


@router.delete("/datasets/{dataset_id}/imports", responses=ERRORS)
async def clear_imports(
    dataset_id: uuid.UUID, ctx: Ctx, session: Session, storage: Storage
) -> ClearImportsResponse:
    dataset = (
        await session.execute(
            select(Dataset.id).where(
                Dataset.id == dataset_id, Dataset.organisation_id == ctx.organisation_id
            )
        )
    ).scalar_one_or_none()
    if dataset is None:
        raise _not_found("Dataset")

    # Unfinished imports stay: a worker may still be writing features for them (ADR 0011). The row
    # lock keeps a concurrent clear from racing this one.
    finished = (
        await session.execute(
            select(ImportJob.id, ImportJob.stored_path)
            .where(
                ImportJob.dataset_id == dataset_id,
                ImportJob.organisation_id == ctx.organisation_id,
                ImportJob.status.in_(("succeeded", "failed")),
            )
            .with_for_update()
        )
    ).all()
    job_ids = [row[0] for row in finished]
    if job_ids:
        await session.execute(
            delete(SpatialFeature).where(SpatialFeature.import_job_id.in_(job_ids))
        )
        await session.execute(delete(MapLayer).where(MapLayer.import_job_id.in_(job_ids)))
        await session.execute(delete(ImportJob).where(ImportJob.id.in_(job_ids)))
        await session.commit()

    # After the commit, best effort: a leftover file is harmless, a row whose file is gone is not.
    for _, stored_path in finished:
        storage.delete(stored_path)
    return ClearImportsResponse(deleted=len(job_ids))


@router.get("/imports/{import_job_id}", responses=ERRORS)
async def get_import(import_job_id: uuid.UUID, ctx: Ctx, session: Session) -> ImportJobResponse:
    row = (
        await session.execute(
            select(ImportJob, MapLayer.id)
            .outerjoin(MapLayer, MapLayer.import_job_id == ImportJob.id)
            .where(ImportJob.id == import_job_id, ImportJob.organisation_id == ctx.organisation_id)
        )
    ).one_or_none()
    if row is None:
        raise _not_found("Import job")
    return ImportJobResponse(import_job=_job_out(row[0], row[1]))


@router.get("/map-layers/{map_layer_id}", responses=ERRORS)
async def get_map_layer(
    map_layer_id: uuid.UUID,
    ctx: Ctx,
    session: Session,
    property_name: Annotated[
        str | None, Query(alias="property", max_length=MAX_PROPERTY_NAME)
    ] = None,
    value: Annotated[str | None, Query(max_length=MAX_FILTER_VALUE)] = None,
    comparator: Annotated[Comparator, Query()] = "=",
) -> MapLayerResponse:
    if (property_name is None) != (value is None):
        raise ApiError(400, "validation_failed", "`property` and `value` must be given together.")
    if comparator != "=" and value is None:
        raise ApiError(
            400, "validation_failed", "`comparator` other than `=` requires `property` and `value`."
        )
    if comparator != "=" and value is not None and not NUMERIC_VALUE.fullmatch(value):
        raise ApiError(400, "validation_failed", "`value` must be numeric for this comparator.")
    layer = (
        await session.execute(
            select(MapLayer).where(
                MapLayer.id == map_layer_id, MapLayer.organisation_id == ctx.organisation_id
            )
        )
    ).scalar_one_or_none()
    if layer is None:
        raise _not_found("Map layer")

    scope = (
        SpatialFeature.import_job_id == layer.import_job_id,
        SpatialFeature.organisation_id == ctx.organisation_id,
    )
    extent = func.ST_Extent(SpatialFeature.geom)
    bbox = (
        await session.execute(
            select(
                func.ST_XMin(extent),
                func.ST_YMin(extent),
                func.ST_XMax(extent),
                func.ST_YMax(extent),
            ).where(*scope)
        )
    ).one()
    features_query = (
        select(
            SpatialFeature.id,
            func.ST_AsGeoJSON(SpatialFeature.geom).label("geometry"),
            SpatialFeature.properties,
        )
        .where(*scope)
        # File order; the id only settles ties among features stored before positions existed.
        .order_by(SpatialFeature.position, SpatialFeature.id)
    )
    if property_name is not None and value is not None:
        # Bound parameters on both sides: the key is data, never part of the SQL text.
        prop_text = SpatialFeature.properties[property_name].astext
        if comparator == "=":
            features_query = features_query.where(prop_text == value)
        else:
            # CASE, not a separate AND'ed regex guard: Postgres does not guarantee evaluation
            # order between AND'ed conditions, so a plan change could run the cast before the
            # guard and 500 on a non-numeric value. CASE always checks its condition first.
            # A feature's value only enters the comparison if it is itself numeric; anything else
            # (free-form text, a different unit, missing) makes it NULL, which the comparison
            # below turns into "excluded", not an error.
            safe_numeric = case(
                (prop_text.op("~")(NUMERIC_VALUE.pattern), prop_text.cast(Numeric)), else_=None
            )
            features_query = features_query.where(
                _COMPARATORS[comparator](safe_numeric, Decimal(value))
            )
    rows = (await session.execute(features_query)).all()
    all_keys = (
        select(func.jsonb_object_keys(SpatialFeature.properties).label("key"))
        .where(*scope)
        .subquery()
    )
    property_keys: list[str] = list(
        (
            await session.execute(
                select(all_keys.c.key)
                .where(func.length(all_keys.c.key) <= MAX_PROPERTY_NAME)
                .distinct()
                .order_by(all_keys.c.key)
                .limit(MAX_PROPERTY_KEYS)
            )
        )
        .scalars()
        .all()
    )

    return MapLayerResponse.model_validate(
        {
            "map_layer": {
                "id": layer.id,
                "dataset_id": layer.dataset_id,
                "name": layer.name,
                "geometry_type": layer.geometry_type,
                "feature_count": layer.feature_count,
                "bbox": [float(v) for v in bbox] if bbox[0] is not None else None,
                "property_keys": property_keys,
            },
            "features": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "id": r.id,
                        "geometry": json.loads(r.geometry),
                        "properties": r.properties,
                    }
                    for r in rows
                ],
            },
        }
    )
