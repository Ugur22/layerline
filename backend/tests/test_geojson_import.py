import json

import pytest

from layerline.geojson_import import parse_feature_collection


def collection(*features: object) -> bytes:
    return json.dumps({"type": "FeatureCollection", "features": list(features)}).encode()


def point(lon: object, lat: object, properties: object = None) -> dict[str, object]:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": properties,
    }


def codes(raw: bytes) -> list[str]:
    return [e.code for e in parse_feature_collection(raw, max_errors=50).errors]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (b"not json", ["invalid_json"]),
        (b"\xff\xfe", ["invalid_json"]),
        (b'{"type": "Feature"}', ["not_a_feature_collection"]),
        (b'{"type": "FeatureCollection", "features": {}}', ["not_a_feature_collection"]),
        (collection(), ["empty_collection"]),
        (collection(point(181, 0)), ["invalid_geometry"]),
        (collection(point(0, -90.5)), ["invalid_geometry"]),
        (collection(point("1", 2)), ["invalid_geometry"]),
        (collection(point(True, 2)), ["invalid_geometry"]),
        (collection(point(1, 2, "text")), ["invalid_properties"]),
        (collection({"type": "Feature", "geometry": None}), ["unsupported_geometry"]),
        (
            collection({"type": "Feature", "geometry": {"type": "LineString"}, "properties": {}}),
            ["unsupported_geometry"],
        ),
        (collection("nope"), ["invalid_feature"]),
        (collection(point(1, 2, {}), point(999, 2)), ["invalid_geometry"]),
    ],
)
def test_rejects_invalid_input(raw: bytes, expected: list[str]) -> None:
    assert codes(raw) == expected


def test_mixed_valid_and_invalid_returns_no_features() -> None:
    result = parse_feature_collection(collection(point(1, 2), point(999, 2)), max_errors=50)

    assert result.features == []
    assert result.errors[0].location == {"feature_index": 1}


def test_accepts_valid_points_and_drops_altitude() -> None:
    raw = collection(
        point(4.9, 52.37, {"name": "a"}),
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [1, 2, 30]}},
    )

    result = parse_feature_collection(raw, max_errors=50)

    assert result.ok
    assert [f.ewkt for f in result.features] == [
        "SRID=4326;POINT(4.9 52.37)",
        "SRID=4326;POINT(1.0 2.0)",
    ]
    assert result.features[0].properties == {"name": "a"}


def test_error_list_is_capped_and_flagged() -> None:
    raw = collection(*[point(999, 0) for _ in range(5)])

    result = parse_feature_collection(raw, max_errors=2)

    assert len(result.errors) == 2
    assert result.errors_truncated is True
