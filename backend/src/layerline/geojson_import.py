"""Pure validation of an uploaded GeoJSON FeatureCollection; no I/O so it is cheap to test."""

import json
import math
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ImportIssue:
    code: str
    message: str
    location: dict[str, int] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "location": self.location}


@dataclass(frozen=True)
class ParsedFeature:
    lon: float
    lat: float
    properties: dict[str, Any]

    @property
    def ewkt(self) -> str:
        # Values are validated finite floats, so this string cannot carry injected SQL or WKT.
        return f"SRID=4326;POINT({self.lon!r} {self.lat!r})"


@dataclass
class ParseResult:
    features: list[ParsedFeature] = field(default_factory=list)
    errors: list[ImportIssue] = field(default_factory=list)
    errors_truncated: bool = False

    @property
    def ok(self) -> bool:
        return not self.errors


def _is_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def _point(geometry: Any) -> tuple[float, float] | ImportIssue:
    if not isinstance(geometry, dict) or geometry.get("type") != "Point":
        return ImportIssue("unsupported_geometry", "Only Point geometries are supported.")
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or len(coords) not in (2, 3):
        return ImportIssue("invalid_geometry", "Point coordinates must be [lon, lat].")
    if not all(_is_number(c) for c in coords):
        return ImportIssue("invalid_geometry", "Point coordinates must be finite numbers.")
    lon, lat = float(coords[0]), float(coords[1])
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return ImportIssue("invalid_geometry", "Coordinates are outside WGS84 range.")
    # Altitude, if present, is dropped: stored geometries are 2D.
    return lon, lat


def parse_feature_collection(raw: bytes, *, max_errors: int) -> ParseResult:
    result = ParseResult()

    def add(issue: ImportIssue) -> None:
        if len(result.errors) < max_errors:
            result.errors.append(issue)
        else:
            result.errors_truncated = True

    try:
        document = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        add(ImportIssue("invalid_json", "File is not valid UTF-8 JSON."))
        return result

    if not isinstance(document, dict) or document.get("type") != "FeatureCollection":
        add(ImportIssue("not_a_feature_collection", "Top-level type must be FeatureCollection."))
        return result
    features = document.get("features")
    if not isinstance(features, list):
        add(ImportIssue("not_a_feature_collection", "`features` must be an array."))
        return result
    if not features:
        add(ImportIssue("empty_collection", "The collection contains no features."))
        return result

    for index, feature in enumerate(features):
        location = {"feature_index": index}
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            add(ImportIssue("invalid_feature", "Item is not a GeoJSON Feature.", location))
            continue
        properties = feature.get("properties")
        if properties is not None and not isinstance(properties, dict):
            add(ImportIssue("invalid_properties", "`properties` must be an object.", location))
            continue
        point = _point(feature.get("geometry"))
        if isinstance(point, ImportIssue):
            add(ImportIssue(point.code, point.message, location))
            continue
        if result.ok:
            result.features.append(ParsedFeature(point[0], point[1], properties or {}))

    if not result.ok:
        result.features.clear()
    return result
