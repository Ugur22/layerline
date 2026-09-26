# 0002. Import job execution and raw file storage

- Status: accepted
- Date: 2026-09-26

## Context
Uploads must return quickly (`202`) while a worker validates and writes features (`docs/api-contracts.md`). Requirements stated by the maintainer:
- **Retries** for failed processing.
- **Scheduling** of recurring tasks.
- Work **continues in the background** with no browser or frontend open.

The first slice has small files and one developer. Job semantics must stay idempotent per job id and a failed import must leave no visible features.

## Decision
- **Execution:** Procrastinate, a Python task queue backed by PostgreSQL. Tasks are enqueued by the API and run by a separate worker process, so processing is independent of the frontend and of the request that created it. No Redis or broker.
- **Retries:** configured per task with a bounded attempt count and backoff. Tasks are idempotent; a retry never duplicates features. Permanent errors (invalid file) fail the job immediately; only transient errors (database, storage) retry.
- **Scheduling:** Procrastinate periodic tasks. Initial uses are maintenance only: recovering stuck jobs and cleaning up raw files. Scheduled or recurring imports are not decided (**Open**; no such requirement is stated yet).
- **Status truth:** the import job row in Layerline's own schema stays the source of user-facing status (`queued`, `processing`, `succeeded`, `failed`); the queue's internal tables are not exposed through the API.
- **Transactionality:** feature writes and the terminal status change share one transaction.
- **Storage:** raw uploads go to a local volume behind a small storage interface (`save`, `open`, `delete`), so an S3-compatible backend can replace it.

## Alternatives considered
- Celery + Redis (+ beat) — most mature and widely recognised; retries and scheduling are built in. Costs two extra services (broker, beat) and a second store to keep consistent with the database. Reasonable fallback if Procrastinate falls short.
- ARQ (Redis) — lightweight with cron and retries, still needs Redis; smaller ecosystem.
- Hand-rolled Postgres queue (`FOR UPDATE SKIP LOCKED`) — no dependency, but retries, backoff and scheduling would have to be built and maintained.
- FastAPI `BackgroundTasks` — no retries or scheduling, and jobs die with the API process.
- S3-compatible storage (MinIO in dev) from day one — realistic, but extra infrastructure before need is shown.

## Consequences
- Local setup stays Postgres plus one worker container (and a scheduler process if not combined with the worker).
- Procrastinate is a smaller project than Celery; its fit is unverified. The scaffold task begins with a spike proving enqueue → retry → periodic task → terminal status end to end. If it fails, this ADR is superseded by one choosing Celery + Redis.
- Throughput is bounded by Postgres; acceptable until measured otherwise.
- Stuck-job detection (lease timeout) and retry limits are specified at implementation time and documented in `docs/quality.md` tests.
- Retention of raw files after processing stays open.
