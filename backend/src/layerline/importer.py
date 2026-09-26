"""Import job processing. Kept free of Procrastinate so it can be tested directly."""

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import PurePath

from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import DataError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from layerline.config import get_settings
from layerline.import_types import ImportIssue
from layerline.models import ImportJob, MapLayer, SpatialFeature
from layerline.parsing import parse_upload
from layerline.storage import LocalStorage


async def _fail(
    session: AsyncSession,
    job_id: uuid.UUID,
    errors: list[ImportIssue],
    *,
    truncated: bool = False,
) -> None:
    await session.execute(
        update(ImportJob)
        .where(ImportJob.id == job_id, ImportJob.status.in_(("queued", "processing")))
        .values(
            status="failed",
            errors=[e.as_dict() for e in errors],
            errors_truncated=truncated,
            finished_at=datetime.now(UTC),
        )
    )
    await session.commit()


async def mark_failed(
    sessions: async_sessionmaker[AsyncSession], job_id: uuid.UUID, code: str, message: str
) -> None:
    async with sessions() as session:
        await _fail(session, job_id, [ImportIssue(code, message)])


async def run_import(
    sessions: async_sessionmaker[AsyncSession], storage: LocalStorage, job_id: uuid.UUID
) -> None:
    """Process one import job. Idempotent: a terminal job is left alone, and a retried job never
    leaves partial features because features and the terminal status commit together."""
    settings = get_settings()

    async with sessions() as session:
        claimed = (
            await session.execute(
                update(ImportJob)
                .where(ImportJob.id == job_id, ImportJob.status.in_(("queued", "processing")))
                .values(status="processing", started_at=datetime.now(UTC))
                .returning(ImportJob)
            )
        ).scalar_one_or_none()
        await session.commit()
    if claimed is None:
        return

    try:
        raw = storage.read(claimed.stored_path)
    except FileNotFoundError:
        # Permanent: retrying cannot bring the file back.
        await mark_failed(sessions, job_id, "stored_file_missing", "The uploaded file is missing.")
        return

    result = parse_upload(claimed.original_filename, raw, max_errors=settings.max_reported_errors)
    async with sessions() as session:
        if not result.ok:
            await _fail(session, job_id, result.errors, truncated=result.errors_truncated)
            return

        try:
            await session.execute(
                delete(SpatialFeature).where(SpatialFeature.import_job_id == job_id)
            )
            await session.execute(
                insert(SpatialFeature),
                [
                    {
                        "id": uuid.uuid4(),
                        "organisation_id": claimed.organisation_id,
                        "dataset_id": claimed.dataset_id,
                        "import_job_id": job_id,
                        "geom": feature.ewkt,
                        "properties": feature.properties,
                    }
                    for feature in result.features
                ],
            )
            await session.execute(delete(MapLayer).where(MapLayer.import_job_id == job_id))
            session.add(
                MapLayer(
                    organisation_id=claimed.organisation_id,
                    dataset_id=claimed.dataset_id,
                    import_job_id=job_id,
                    name=PurePath(claimed.original_filename).stem[:200] or "layer",
                    geometry_type="Point",
                    feature_count=len(result.features),
                )
            )
            await session.execute(
                update(ImportJob)
                .where(ImportJob.id == job_id)
                .values(
                    status="succeeded",
                    feature_count=len(result.features),
                    errors=[],
                    finished_at=datetime.now(UTC),
                )
            )
            await session.commit()
        except DataError:
            # The database refused the content (e.g. a NUL character, which jsonb cannot hold).
            # Retrying cannot help, and leaving the job alone would strand it in "processing".
            await session.rollback()
            await _fail(
                session,
                job_id,
                [
                    ImportIssue(
                        "invalid_data",
                        "The file contains data that cannot be stored, such as control characters.",
                    )
                ],
            )


async def expire_stuck_jobs(sessions: async_sessionmaker[AsyncSession]) -> int:
    """Fail jobs whose processing lease ran out, so clients never poll forever."""
    cutoff = datetime.now(UTC) - timedelta(minutes=get_settings().processing_lease_minutes)
    async with sessions() as session:
        stuck = (
            (
                await session.execute(
                    select(ImportJob.id).where(
                        ImportJob.status == "processing", ImportJob.started_at < cutoff
                    )
                )
            )
            .scalars()
            .all()
        )
        for job_id in stuck:
            await _fail(
                session, job_id, [ImportIssue("timed_out", "Processing did not finish in time.")]
            )
    return len(stuck)
