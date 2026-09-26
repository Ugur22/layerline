import logging
import uuid
from datetime import UTC, datetime, timedelta

import procrastinate
from procrastinate import exceptions as pexc
from sqlalchemy import select
from sqlalchemy.exc import InterfaceError, OperationalError

from layerline.config import get_settings
from layerline.db import get_sessionmaker
from layerline.importer import expire_stuck_jobs, mark_failed, run_import
from layerline.models import ImportJob
from layerline.storage import get_storage

logger = logging.getLogger(__name__)
settings = get_settings()

app = procrastinate.App(
    connector=procrastinate.PsycopgConnector(conninfo=settings.database_url),
    import_paths=["layerline.jobs"],
)

# Only infrastructure faults retry. An invalid file is a permanent failure handled in run_import.
TRANSIENT_ERRORS = (OSError, OperationalError, InterfaceError)
MAX_RETRIES = settings.max_import_retries


@app.task(
    name="process_import",
    pass_context=True,
    retry=procrastinate.RetryStrategy(
        max_attempts=MAX_RETRIES, exponential_wait=2, retry_exceptions=set(TRANSIENT_ERRORS)
    ),
)
async def process_import(context: procrastinate.JobContext, job_id: str) -> None:
    sessions = get_sessionmaker()
    try:
        await run_import(sessions, get_storage(), uuid.UUID(job_id))
    except TRANSIENT_ERRORS:
        # Procrastinate stops retrying after the last run, so the job row must be failed here
        # or clients would poll a job that will never finish.
        if context.job.attempts >= MAX_RETRIES:
            await mark_failed(
                sessions,
                uuid.UUID(job_id),
                "processing_error",
                "Processing failed repeatedly due to a temporary fault.",
            )
        raise


async def enqueue_import(job_id: uuid.UUID) -> None:
    try:
        await process_import.configure(queueing_lock=str(job_id)).defer_async(job_id=str(job_id))
    except pexc.AlreadyEnqueued:
        pass


@app.periodic(cron="*/5 * * * *")
@app.task(name="recover_imports", queueing_lock="recover_imports")
async def recover_imports(timestamp: int) -> None:
    """Fail expired jobs and re-enqueue ones whose enqueue was lost (e.g. API crashed between
    committing the job row and deferring the task)."""
    sessions = get_sessionmaker()
    expired = await expire_stuck_jobs(sessions)
    cutoff = datetime.now(UTC) - timedelta(minutes=2)
    async with sessions() as session:
        orphaned = (
            (
                await session.execute(
                    select(ImportJob.id).where(
                        ImportJob.status == "queued", ImportJob.created_at < cutoff
                    )
                )
            )
            .scalars()
            .all()
        )
    for job_id in orphaned:
        await enqueue_import(job_id)
    logger.info("recover_imports: expired=%d re-enqueued=%d", expired, len(orphaned))
