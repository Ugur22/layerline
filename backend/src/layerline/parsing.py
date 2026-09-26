from pathlib import PurePath

from layerline.csv_import import parse_csv
from layerline.geojson_import import parse_feature_collection
from layerline.import_types import ParseResult


def parse_upload(filename: str, raw: bytes, *, max_errors: int) -> ParseResult:
    """Choose the parser from the extension. Upload already restricted it to a known set, so the
    GeoJSON branch is the default for `.geojson` and `.json`."""
    if PurePath(filename).suffix.lower() == ".csv":
        return parse_csv(raw, max_errors=max_errors)
    return parse_feature_collection(raw, max_errors=max_errors)
