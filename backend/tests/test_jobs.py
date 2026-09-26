import json
import uuid
from pathlib import Path

import pytest

from layerline import jobs
from layerline.db import get_sessionmaker
from layerline.dev_seed import DEV_DATASET_ID
from layerline.importer import run_import
from layerline.jobs import app as jobs_app
from layerline.storage import LocalStorage, get_storage
from tests.conftest import run_sql

GOOD = json.dumps(
    {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [1, 2]},
                "properties": {},
            }
        ],
    }
).encode()


def new_job(storage_dir: Path, *, status: str = "queued", age_minutes: int = 0) -> uuid.UUID:
    job_id = uuid.uuid4()
    key = LocalStorage(storage_dir).save(GOOD)
    run_sql(
        "INSERT INTO import_jobs (id, organisation_id, dataset_id, status, stored_path, "
        "original_filename, errors, errors_truncated, created_at, started_at) "
        "SELECT %s, organisation_id, id, %s, %s, 'a.geojson', '[]'::jsonb, false, "
        "now() - make_interval(mins => %s), now() - make_interval(mins => %s) "
        "FROM datasets WHERE id = %s",
        (job_id, status, key, age_minutes, age_minutes, DEV_DATASET_ID),
    )
    return job_id


async def defer_and_get_status(job_id: uuid.UUID) -> str:
    await jobs.enqueue_import(job_id)
    await jobs_app.run_worker_async(wait=False)
    return str(run_sql("SELECT status FROM import_jobs WHERE id = %s", (job_id,))[0][0])


def make_due() -> None:
    run_sql(
        "UPDATE procrastinate_jobs SET scheduled_at = now() "
        "WHERE status = 'todo' AND task_name = 'process_import'"
    )


class FlakyStorage(LocalStorage):
    def __init__(self, inner: LocalStorage, failures: int) -> None:
        self._inner = inner
        self.failures = failures

    def read(self, key: str) -> bytes:
        if self.failures > 0:
            self.failures -= 1
            raise OSError("simulated storage outage")
        return self._inner.read(key)


async def test_transient_failure_retries_then_succeeds(
    storage_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    flaky = FlakyStorage(get_storage(), failures=1)
    monkeypatch.setattr(jobs, "get_storage", lambda: flaky)
    job_id = new_job(storage_dir)

    assert await defer_and_get_status(job_id) == "processing"
    row = run_sql(
        "SELECT status, attempts FROM procrastinate_jobs WHERE task_name = 'process_import'"
    )
    assert row == [("todo", 1)]  # rescheduled, not failed

    make_due()
    await jobs_app.run_worker_async(wait=False)

    assert run_sql("SELECT status FROM import_jobs WHERE id = %s", (job_id,)) == [("succeeded",)]
    assert run_sql("SELECT count(*) FROM spatial_features") == [(1,)]


async def test_retries_are_bounded_and_end_in_failed_job(
    storage_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(jobs, "get_storage", lambda: FlakyStorage(get_storage(), failures=99))
    job_id = new_job(storage_dir)
    await jobs.enqueue_import(job_id)

    for _ in range(jobs.MAX_RETRIES + 1):
        await jobs_app.run_worker_async(wait=False)
        make_due()

    assert run_sql("SELECT status FROM procrastinate_jobs WHERE task_name = 'process_import'") == [
        ("failed",)
    ]
    assert run_sql("SELECT status, errors->0->>'code' FROM import_jobs") == [
        ("failed", "processing_error")
    ]
    assert run_sql("SELECT count(*) FROM spatial_features") == [(0,)]


async def test_reprocessing_a_finished_job_changes_nothing(storage_dir: Path) -> None:
    job_id = new_job(storage_dir)
    sessions = get_sessionmaker()

    await run_import(sessions, get_storage(), job_id)
    await run_import(sessions, get_storage(), job_id)

    assert run_sql("SELECT count(*) FROM spatial_features") == [(1,)]
    assert run_sql("SELECT count(*) FROM map_layers") == [(1,)]


async def test_recovery_fails_expired_jobs_and_reenqueues_lost_ones(storage_dir: Path) -> None:
    expired = new_job(storage_dir, status="processing", age_minutes=60)
    lost = new_job(storage_dir, status="queued", age_minutes=10)
    fresh = new_job(storage_dir, status="queued", age_minutes=0)

    await jobs.recover_imports(0)

    assert run_sql("SELECT errors->0->>'code' FROM import_jobs WHERE id = %s", (expired,)) == [
        ("timed_out",)
    ]
    queued = {
        row[0]
        for row in run_sql(
            "SELECT args->>'job_id' FROM procrastinate_jobs WHERE task_name = 'process_import'"
        )
    }
    assert queued == {str(lost)}
    assert str(fresh) not in queued

    await jobs.recover_imports(0)  # running again must not duplicate the queued job
    assert run_sql(
        "SELECT count(*) FROM procrastinate_jobs WHERE task_name = 'process_import'"
    ) == [(1,)]


async def test_recovery_is_registered_as_a_periodic_task() -> None:
    tasks = jobs_app.periodic_registry.periodic_tasks

    assert ("recover_imports", "") in tasks
    assert tasks[("recover_imports", "")].cron == "*/5 * * * *"
