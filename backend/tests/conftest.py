import os
import tempfile
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import psycopg
import pytest
import pytest_asyncio
from psycopg import sql

ADMIN_URL = os.environ.get(
    "LAYERLINE_TEST_ADMIN_URL", "postgresql://layerline:layerline@127.0.0.1:5433/layerline"
)
TEST_DB = "layerline_test"
TEST_URL = ADMIN_URL.rsplit("/", 1)[0] + f"/{TEST_DB}"

# Must be set before any layerline module is imported: settings and the queue app read them at
# import time. Tests never touch the development database.
os.environ["LAYERLINE_DATABASE_URL"] = TEST_URL
os.environ["LAYERLINE_ENVIRONMENT"] = "development"
os.environ["LAYERLINE_STORAGE_DIR"] = tempfile.mkdtemp(prefix="layerline-test-")


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute(
            sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(TEST_DB))
        )
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(TEST_DB)))
    with psycopg.connect(TEST_URL, autocommit=True) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    from layerline.migrate import main

    main()
    yield


@pytest.fixture(autouse=True)
def clean_tables(database: None) -> None:
    with psycopg.connect(TEST_URL, autocommit=True) as conn:
        conn.execute(
            "TRUNCATE spatial_features, map_layers, import_jobs, procrastinate_jobs CASCADE"
        )


@pytest_asyncio.fixture(scope="session", autouse=True)
async def queue(database: None) -> AsyncIterator[None]:
    from layerline.jobs import app

    async with app.open_async():
        yield


def run_sql(query: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
    with psycopg.connect(TEST_URL, autocommit=True) as conn:
        cur = conn.execute(query, params)
        return cur.fetchall() if cur.description else []


@pytest.fixture
def storage_dir() -> Path:
    return Path(os.environ["LAYERLINE_STORAGE_DIR"])
