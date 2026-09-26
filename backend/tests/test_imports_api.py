import json
from collections.abc import AsyncIterator
from typing import Any

import httpx2
import pytest
import pytest_asyncio

from layerline.config import get_settings
from layerline.dev_seed import DEV_DATASET_ID
from layerline.jobs import app as jobs_app
from layerline.main import app
from tests.conftest import run_sql

OTHER_ORG = {"X-Dev-Organisation-Id": "11111111-1111-4111-8111-111111111111"}
UPLOAD = f"/api/v1/datasets/{DEV_DATASET_ID}/imports"


def geojson(*coords: list[float]) -> bytes:
    features = [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": c}, "properties": {"i": i}}
        for i, c in enumerate(coords)
    ]
    return json.dumps({"type": "FeatureCollection", "features": features}).encode()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def upload(client: httpx2.AsyncClient, data: bytes, name: str = "a.geojson") -> str:
    response = await client.post(UPLOAD, files={"file": (name, data)})
    assert response.status_code == 202, response.text
    body = response.json()["import_job"]
    assert body["status"] == "queued"
    return str(body["id"])


async def process_queue() -> None:
    await jobs_app.run_worker_async(wait=False)


async def status(client: httpx2.AsyncClient, job_id: str) -> dict[str, Any]:
    response = await client.get(f"/api/v1/imports/{job_id}")
    assert response.status_code == 200
    job: dict[str, Any] = response.json()["import_job"]
    return job


async def test_valid_upload_becomes_a_map_layer(client: httpx2.AsyncClient) -> None:
    job_id = await upload(client, geojson([4.9, 52.37], [4.95, 52.4]))

    await process_queue()

    job = await status(client, job_id)
    assert job["status"] == "succeeded"
    assert job["feature_count"] == 2
    layer = (await client.get(f"/api/v1/map-layers/{job['map_layer_id']}")).json()
    assert layer["map_layer"]["feature_count"] == 2
    assert layer["map_layer"]["bbox"] == [4.9, 52.37, 4.95, 52.4]
    assert len(layer["features"]["features"]) == 2


async def test_invalid_file_fails_with_errors_and_no_features(client: httpx2.AsyncClient) -> None:
    job_id = await upload(client, geojson([1, 2], [999, 2]))

    await process_queue()

    job = await status(client, job_id)
    assert job["status"] == "failed"
    assert job["map_layer_id"] is None
    assert [e["code"] for e in job["errors"]] == ["invalid_geometry"]
    assert job["errors"][0]["location"] == {"feature_index": 1}
    assert run_sql("SELECT count(*) FROM spatial_features") == [(0,)]


async def test_other_organisation_gets_404_everywhere(client: httpx2.AsyncClient) -> None:
    job_id = await upload(client, geojson([1, 2]))
    await process_queue()
    layer_id = (await status(client, job_id))["map_layer_id"]

    assert (await client.get(f"/api/v1/imports/{job_id}", headers=OTHER_ORG)).status_code == 404
    assert (
        await client.get(f"/api/v1/map-layers/{layer_id}", headers=OTHER_ORG)
    ).status_code == 404
    response = await client.post(UPLOAD, files={"file": ("a.geojson", b"{}")}, headers=OTHER_ORG)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_rejects_unsupported_type_and_oversize(
    client: httpx2.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    response = await client.post(UPLOAD, files={"file": ("a.txt", b"x")})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_file_type"

    monkeypatch.setattr(get_settings(), "max_upload_bytes", 10)
    response = await client.post(UPLOAD, files={"file": ("a.geojson", b"x" * 11)})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"
    assert run_sql("SELECT count(*) FROM import_jobs") == [(0,)]


async def test_malformed_id_is_a_validation_error(client: httpx2.AsyncClient) -> None:
    response = await client.get("/api/v1/imports/not-a-uuid")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_failed"


async def test_placeholder_identity_is_refused_outside_development(
    client: httpx2.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "environment", "production")

    response = await client.get("/api/v1/imports/00000000-0000-4000-8000-000000000009")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
