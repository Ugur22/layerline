import subprocess
import sys
import uuid
from collections.abc import Iterator

import psycopg
import pytest
from psycopg import sql

from tests.conftest import ADMIN_URL

MIGRATION_DB = "layerline_migration_test"
MIGRATION_URL = ADMIN_URL.rsplit("/", 1)[0] + f"/{MIGRATION_DB}"


def alembic(*args: str) -> None:
    # A separate process reads the database URL from its own environment, so this never touches
    # the database the other tests share.
    subprocess.run(  # noqa: S603 - fixed arguments from this file, no untrusted input
        [sys.executable, "-m", "alembic", *args],
        check=True,
        env={"LAYERLINE_DATABASE_URL": MIGRATION_URL, "PATH": ""},
    )


@pytest.fixture
def migration_db() -> Iterator[None]:
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute(
            sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(MIGRATION_DB))
        )
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(MIGRATION_DB)))
    with psycopg.connect(MIGRATION_URL, autocommit=True) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    yield
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute(
            sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(MIGRATION_DB))
        )


def test_features_stored_before_positions_existed_survive_the_upgrade(migration_db: None) -> None:
    alembic("upgrade", "0001")
    org, project, dataset, job = (uuid.uuid4() for _ in range(4))
    with psycopg.connect(MIGRATION_URL, autocommit=True) as conn:
        conn.execute("INSERT INTO organisations (id, name) VALUES (%s, 'o')", (org,))
        conn.execute(
            "INSERT INTO projects (id, organisation_id, name) VALUES (%s, %s, 'p')", (project, org)
        )
        conn.execute(
            "INSERT INTO datasets (id, organisation_id, project_id, name) VALUES (%s, %s, %s, 'd')",
            (dataset, org, project),
        )
        conn.execute(
            "INSERT INTO import_jobs (id, organisation_id, dataset_id, status, stored_path,"
            " original_filename, errors, errors_truncated)"
            " VALUES (%s, %s, %s, 'succeeded', 'x', 'old.geojson', '[]', false)",
            (job, org, dataset),
        )
        for lon in (4, 5, 6):
            conn.execute(
                "INSERT INTO spatial_features (id, organisation_id, dataset_id, import_job_id,"
                " geom, properties) VALUES (%s, %s, %s, %s,"
                " ST_GeomFromText(%s, 4326), '{}')",
                (uuid.uuid4(), org, dataset, job, f"POINT({lon} 52)"),
            )

        alembic("upgrade", "head")

        assert conn.execute("SELECT position FROM spatial_features").fetchall() == [(0,)] * 3


def test_downgrade_removes_the_position_column(migration_db: None) -> None:
    alembic("upgrade", "head")
    alembic("downgrade", "0001")

    with psycopg.connect(MIGRATION_URL, autocommit=True) as conn:
        columns = conn.execute(
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_name = 'spatial_features'"
        ).fetchall()
    assert ("position",) not in columns
