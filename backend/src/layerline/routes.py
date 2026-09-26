import json
import uuid
from pathlib import PurePath
from typing import Annotated, Any

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from layerline.config import get_settings
from layerline.context import RequestContext, get_context
from layerline.db import get_session
from layerline.errors import ApiError
from layerline.jobs import enqueue_import
from layerline.models import Dataset, ImportJob, MapLayer, SpatialFeature
from layerline.storage import LocalStorage, get_storage

router = APIRouter(prefix="/api/v1")

Ctx = Annotated[RequestContext, Depends(get_context)]
Session = Annotated[AsyncSession, Depends(get_session)]
Storage = Annotated[LocalStorage, Depends(get_storage)]

ALLOWED_SUFFIXES = {".geojson", ".json"}


def _not_found(what: str) -> ApiError:
    # Cross-organisation access looks identical to a missing entity (ADR 0003).
    return ApiError(404, "not_found", f"{what} not found.")


def _job_payload(job: ImportJob, map_layer_id: uuid.UUID | None) -> dict[str, Any]:
    return {
        "id": str(job.id),
        "dataset_id": str(job.dataset_id),
        "status": job.status,
        "created_at": job.created_at.isoformat(),
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "feature_count": job.feature_count,
        "map_layer_id": str(map_layer_id) if map_layer_id else None,
        "errors": job.errors,
        "errors_truncated": job.errors_truncated,
    }


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/datasets/{dataset_id}/imports", status_code=202)
async def upload_import(
    dataset_id: uuid.UUID, file: UploadFile, ctx: Ctx, session: Session, storage: Storage
) -> dict[str, Any]:
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
        raise ApiError(400, "unsupported_file_type", "Only .geojson or .json files are accepted.")

    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise ApiError(413, "file_too_large", f"File exceeds the {limit} byte limit.")

    key = storage.save(data)
    job = ImportJob(
        organisation_id=ctx.organisation_id,
        dataset_id=dataset_id,
        stored_path=key,
        original_filename=filename[:255],
    )
    session.add(job)
    await session.commit()
    # If this call fails, recover_imports re-enqueues the still-queued job.
    await enqueue_import(job.id)
    return {"import_job": _job_payload(job, None)}


@router.get("/imports/{import_job_id}")
async def get_import(import_job_id: uuid.UUID, ctx: Ctx, session: Session) -> dict[str, Any]:
    row = (
        await session.execute(
            select(ImportJob, MapLayer.id)
            .outerjoin(MapLayer, MapLayer.import_job_id == ImportJob.id)
            .where(ImportJob.id == import_job_id, ImportJob.organisation_id == ctx.organisation_id)
        )
    ).one_or_none()
    if row is None:
        raise _not_found("Import job")
    return {"import_job": _job_payload(row[0], row[1])}


@router.get("/map-layers/{map_layer_id}")
async def get_map_layer(map_layer_id: uuid.UUID, ctx: Ctx, session: Session) -> dict[str, Any]:
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
    rows = (
        await session.execute(
            select(
                SpatialFeature.id,
                func.ST_AsGeoJSON(SpatialFeature.geom).label("geometry"),
                SpatialFeature.properties,
            )
            .where(*scope)
            .order_by(SpatialFeature.id)
        )
    ).all()

    return {
        "map_layer": {
            "id": str(layer.id),
            "dataset_id": str(layer.dataset_id),
            "name": layer.name,
            "geometry_type": layer.geometry_type,
            "feature_count": layer.feature_count,
            "bbox": [float(v) for v in bbox] if bbox[0] is not None else None,
        },
        "features": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": str(r.id),
                    "geometry": json.loads(r.geometry),
                    "properties": r.properties,
                }
                for r in rows
            ],
        },
    }
