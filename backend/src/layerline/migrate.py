"""One-shot startup step: Alembic migrations, Procrastinate schema, and dev seed data."""

import asyncio

import psycopg
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from layerline.config import get_settings
from layerline.dev_seed import DEV_DATASET_ID, seed
from layerline.jobs import app


async def _apply_procrastinate_schema() -> None:
    with psycopg.connect(get_settings().database_url) as conn:
        exists = conn.execute("SELECT to_regclass('procrastinate_jobs')").fetchone()
    if exists and exists[0] is not None:
        return
    async with app.open_async():
        await app.schema_manager.apply_schema_async()


def main() -> None:
    settings = get_settings()
    command.upgrade(Config("alembic.ini"), "head")
    asyncio.run(_apply_procrastinate_schema())
    if settings.environment == "development":
        with Session(create_engine(settings.sqlalchemy_url)) as session:
            seed(session, settings.dev_organisation_id)
        print(f"dev dataset id: {DEV_DATASET_ID}")


if __name__ == "__main__":
    main()
