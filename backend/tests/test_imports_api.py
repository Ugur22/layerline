import json
from collections.abc import AsyncIterator
from pathlib import Path
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


async def test_openapi_describes_real_responses(client: httpx2.AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()

    upload = schema["paths"]["/api/v1/datasets/{dataset_id}/imports"]["post"]["responses"]
    assert set(upload) == {"202", "400", "401", "404", "413"}
    listing = schema["paths"]["/api/v1/datasets/{dataset_id}/imports"]["get"]["responses"]
    assert set(listing) == {"200", "400", "401", "404"}
    assert "HTTPValidationError" not in schema["components"]["schemas"]
    job = schema["components"]["schemas"]["ImportJobOut"]
    assert job["properties"]["status"]["enum"] == ["queued", "processing", "succeeded", "failed"]


def geojson_with_properties(*items: tuple[list[float], dict[str, Any] | None]) -> bytes:
    features = [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": c}, "properties": p}
        for c, p in items
    ]
    return json.dumps({"type": "FeatureCollection", "features": features}).encode()


async def imported_layer_id(client: httpx2.AsyncClient, data: bytes) -> str:
    job_id = await upload(client, data)
    await process_queue()
    layer_id = (await status(client, job_id))["map_layer_id"]
    assert layer_id is not None
    return str(layer_id)


async def test_list_imports_is_newest_first_and_paginated(client: httpx2.AsyncClient) -> None:
    for name in ("first.geojson", "second.geojson", "third.geojson"):
        await upload(client, geojson([1, 2]), name)

    page1 = (await client.get(f"{UPLOAD}?limit=2")).json()
    assert [j["original_filename"] for j in page1["import_jobs"]] == [
        "third.geojson",
        "second.geojson",
    ]
    assert page1["next_cursor"] is not None

    page2 = (await client.get(f"{UPLOAD}?limit=2&cursor={page1['next_cursor']}")).json()
    assert [j["original_filename"] for j in page2["import_jobs"]] == ["first.geojson"]
    assert page2["next_cursor"] is None


async def test_list_imports_exposes_layer_ids_only_for_succeeded_jobs(
    client: httpx2.AsyncClient,
) -> None:
    await upload(client, geojson([1, 2]), "queued.geojson")
    await process_queue()
    await upload(client, geojson([1, 2]), "waiting.geojson")

    jobs = (await client.get(UPLOAD)).json()["import_jobs"]

    by_name = {j["original_filename"]: j for j in jobs}
    assert by_name["queued.geojson"]["status"] == "succeeded"
    assert by_name["queued.geojson"]["map_layer_id"] is not None
    assert by_name["waiting.geojson"]["status"] == "queued"
    assert by_name["waiting.geojson"]["map_layer_id"] is None


async def test_list_imports_rejects_bad_input_and_other_organisations(
    client: httpx2.AsyncClient,
) -> None:
    await upload(client, geojson([1, 2]))

    for query in ("?limit=0", "?limit=101", "?cursor=not-a-cursor"):
        response = await client.get(f"{UPLOAD}{query}")
        assert response.status_code == 400, query
        assert response.json()["error"]["code"] == "validation_failed"

    assert (await client.get(UPLOAD, headers=OTHER_ORG)).status_code == 404
    missing = "/api/v1/datasets/00000000-0000-4000-8000-0000000000ff/imports"
    assert (await client.get(missing)).status_code == 404


async def test_layer_filter_matches_exact_property_values(client: httpx2.AsyncClient) -> None:
    layer_id = await imported_layer_id(
        client,
        geojson_with_properties(
            ([1, 1], {"name": "A", "depth": 5}),
            ([2, 2], {"name": "B", "depth": 5}),
            ([3, 3], {"name": "A"}),
        ),
    )

    def matched(body: dict[str, Any]) -> list[str]:
        return sorted(f["properties"]["name"] for f in body["features"]["features"])

    by_name = (await client.get(f"/api/v1/map-layers/{layer_id}?property=name&value=A")).json()
    assert matched(by_name) == ["A", "A"]
    # The layer's own facts describe the whole layer, so the view does not move while filtering.
    assert by_name["map_layer"]["feature_count"] == 3
    assert by_name["map_layer"]["bbox"] == [1.0, 1.0, 3.0, 3.0]
    assert by_name["map_layer"]["property_keys"] == ["depth", "name"]

    by_number = (await client.get(f"/api/v1/map-layers/{layer_id}?property=depth&value=5")).json()
    assert matched(by_number) == ["A", "B"]

    none = (await client.get(f"/api/v1/map-layers/{layer_id}?property=name&value=Z")).json()
    assert none["features"]["features"] == []
    assert none["map_layer"]["feature_count"] == 3


async def test_layer_filter_validates_input_and_treats_keys_as_data(
    client: httpx2.AsyncClient,
) -> None:
    layer_id = await imported_layer_id(client, geojson_with_properties(([1, 1], {"name": "A"})))

    for query in ("?property=name", "?value=A", f"?property={'k' * 101}&value=A"):
        response = await client.get(f"/api/v1/map-layers/{layer_id}{query}")
        assert response.status_code == 400, query
        assert response.json()["error"]["code"] == "validation_failed"

    hostile = "name' OR '1'='1"
    response = await client.get(
        f"/api/v1/map-layers/{layer_id}", params={"property": hostile, "value": "A"}
    )
    assert response.status_code == 200
    assert response.json()["features"]["features"] == []


async def test_property_keys_list_what_the_filter_can_use(client: httpx2.AsyncClient) -> None:
    long_key = "k" * 101
    layer_id = await imported_layer_id(
        client, geojson_with_properties(([1, 1], {"b": 1, "a": 2, long_key: 3}))
    )

    body = (await client.get(f"/api/v1/map-layers/{layer_id}")).json()

    # Sorted, and without keys too long for the `property` parameter.
    assert body["map_layer"]["property_keys"] == ["a", "b"]


async def test_layer_with_null_properties_has_no_property_keys(
    client: httpx2.AsyncClient,
) -> None:
    layer_id = await imported_layer_id(client, geojson_with_properties(([1, 1], None)))

    body = (await client.get(f"/api/v1/map-layers/{layer_id}")).json()

    assert body["map_layer"]["property_keys"] == []
    assert len(body["features"]["features"]) == 1


async def test_csv_upload_becomes_a_filterable_map_layer(client: httpx2.AsyncClient) -> None:
    csv_data = b"name,lat,lon,type\nStation 1,52.37,4.9,buoy\nStation 2,52.4,4.95,mooring\n"
    job_id = await upload(client, csv_data, "Survey.CSV")

    await process_queue()

    job = await status(client, job_id)
    assert job["status"] == "succeeded"
    assert job["feature_count"] == 2
    layer_url = f"/api/v1/map-layers/{job['map_layer_id']}"
    layer = (await client.get(layer_url)).json()
    assert layer["map_layer"]["name"] == "Survey"
    assert layer["map_layer"]["bbox"] == [4.9, 52.37, 4.95, 52.4]
    assert layer["map_layer"]["property_keys"] == ["name", "type"]
    filtered = (await client.get(f"{layer_url}?property=type&value=buoy")).json()
    assert [f["properties"]["name"] for f in filtered["features"]["features"]] == ["Station 1"]


async def test_invalid_csv_fails_with_spreadsheet_row_numbers(client: httpx2.AsyncClient) -> None:
    job_id = await upload(client, b"lat,lon\n52.4,4.9\n999,4.9\n52.5\n", "bad.csv")

    await process_queue()

    job = await status(client, job_id)
    assert job["status"] == "failed"
    assert [(e["code"], e["location"]) for e in job["errors"]] == [
        ("invalid_geometry", {"row": 3}),
        ("invalid_row", {"row": 4}),
    ]
    assert job["map_layer_id"] is None
    assert run_sql("SELECT count(*) FROM spatial_features") == [(0,)]


async def test_semicolon_csv_is_a_file_level_error(client: httpx2.AsyncClient) -> None:
    job_id = await upload(client, b"lat;lon\n52,4;4,9\n", "eu.csv")

    await process_queue()

    job = await status(client, job_id)
    assert job["status"] == "failed"
    assert job["errors"][0]["code"] == "invalid_csv"
    assert job["errors"][0]["location"] is None
    assert "comma" in job["errors"][0]["message"].lower()


async def test_long_csv_filename_is_still_parsed_as_csv(client: httpx2.AsyncClient) -> None:
    name = "s" * 300 + ".csv"
    job_id = await upload(client, b"lat,lon\n52.4,4.9\n", name)

    await process_queue()

    job = await status(client, job_id)
    assert job["status"] == "succeeded", job["errors"]
    assert job["original_filename"].endswith(".csv")
    assert len(job["original_filename"]) <= 255


async def test_data_the_database_cannot_store_fails_the_job_instead_of_hanging(
    client: httpx2.AsyncClient,
) -> None:
    # PostgreSQL jsonb cannot hold NUL characters; the CSV parser lets them through.
    job_id = await upload(client, b"lat,lon,note\n52.4,4.9,bad\x00value\n", "nul.csv")

    await process_queue()

    job = await status(client, job_id)
    assert job["status"] == "failed"
    assert job["errors"][0]["code"] == "invalid_data"
    assert run_sql("SELECT count(*) FROM spatial_features") == [(0,)]


async def test_clearing_imports_removes_finished_ones_with_their_layers_and_files(
    client: httpx2.AsyncClient, storage_dir: Path
) -> None:
    good = await upload(client, geojson([4.9, 52.37], [4.95, 52.4]))
    bad = await upload(client, geojson([1, 2], [999, 2]))
    await process_queue()
    paths = [row[0] for row in run_sql("SELECT stored_path FROM import_jobs")]
    assert len(paths) == 2
    assert all((storage_dir / path).exists() for path in paths)
    layer_id = (await status(client, good))["map_layer_id"]

    response = await client.delete(UPLOAD)

    assert response.status_code == 200
    assert response.json() == {"deleted": 2}
    for table in ("import_jobs", "map_layers", "spatial_features"):
        assert run_sql(f"SELECT count(*) FROM {table}") == [(0,)]  # noqa: S608
    assert not any((storage_dir / path).exists() for path in paths)
    listing = (await client.get(UPLOAD)).json()
    assert listing["import_jobs"] == []
    assert (await client.get(f"/api/v1/imports/{bad}")).status_code == 404
    assert (await client.get(f"/api/v1/map-layers/{layer_id}")).status_code == 404


async def test_clearing_imports_keeps_the_ones_still_running(client: httpx2.AsyncClient) -> None:
    finished = await upload(client, geojson([4.9, 52.37]))
    await process_queue()
    queued = await upload(client, geojson([4.9, 52.37]))
    processing = await upload(client, geojson([4.9, 52.37]))
    run_sql("UPDATE import_jobs SET status = 'processing' WHERE id = %s", (processing,))

    response = await client.delete(UPLOAD)

    assert response.json() == {"deleted": 1}
    assert (await client.get(f"/api/v1/imports/{finished}")).status_code == 404
    assert (await status(client, queued))["status"] == "queued"
    assert (await status(client, processing))["status"] == "processing"


async def test_clearing_nothing_is_not_an_error(client: httpx2.AsyncClient) -> None:
    first = await client.delete(UPLOAD)
    second = await client.delete(UPLOAD)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"deleted": 0}


async def test_clearing_imports_of_another_organisation_is_not_found_and_deletes_nothing(
    client: httpx2.AsyncClient,
) -> None:
    job_id = await upload(client, geojson([4.9, 52.37]))
    await process_queue()

    response = await client.delete(UPLOAD, headers=OTHER_ORG)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert (await status(client, job_id))["status"] == "succeeded"


async def test_clearing_an_unknown_dataset_is_not_found(client: httpx2.AsyncClient) -> None:
    response = await client.delete("/api/v1/datasets/00000000-0000-4000-8000-0000000000ff/imports")

    assert response.status_code == 404


async def test_a_missing_raw_file_does_not_stop_the_clear(
    client: httpx2.AsyncClient, storage_dir: Path
) -> None:
    await upload(client, geojson([4.9, 52.37]))
    await process_queue()
    path = run_sql("SELECT stored_path FROM import_jobs")[0][0]
    (storage_dir / path).unlink()

    response = await client.delete(UPLOAD)

    assert response.json() == {"deleted": 1}
