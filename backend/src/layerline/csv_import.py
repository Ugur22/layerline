"""Pure validation of an uploaded CSV of points; no I/O so it is cheap to test."""

import csv
import io
import math
import re

from layerline.import_types import ImportIssue, ParsedFeature, ParseResult

MAX_COLUMNS = 100
LAT_NAMES = frozenset({"lat", "latitude"})
LON_NAMES = frozenset({"lon", "lng", "longitude"})
# Deliberately stricter than float(): no "nan", "inf", or digit-group underscores.
_NUMBER = re.compile(r"[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?")


def _coordinate(text: str, label: str, limit: float) -> float | ImportIssue:
    text = text.strip()
    if not _NUMBER.fullmatch(text):
        return ImportIssue("invalid_geometry", f"{label} is missing or not a number.")
    value = float(text)
    if not math.isfinite(value) or abs(value) > limit:
        return ImportIssue("invalid_geometry", "Coordinates are outside WGS84 range.")
    return value


def _is_blank(row: list[str]) -> bool:
    return all(cell.strip() == "" for cell in row)


def parse_csv(raw: bytes, *, max_errors: int) -> ParseResult:
    result = ParseResult()

    def add(issue: ImportIssue) -> None:
        if len(result.errors) < max_errors:
            result.errors.append(issue)
        else:
            result.errors_truncated = True

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        add(ImportIssue("invalid_csv", "File is not valid UTF-8. Export as 'CSV UTF-8'."))
        return result

    try:
        # Records are counted from 1 including blank ones, so they match spreadsheet row numbers
        # (a quoted cell spanning several lines is still one row).
        records = enumerate(csv.reader(io.StringIO(text)), start=1)
        header_row = next(((n, r) for n, r in records if not _is_blank(r)), None)
        if header_row is None:
            add(ImportIssue("empty_collection", "The file contains no rows."))
            return result

        header = [cell.strip() for cell in header_row[1]]
        if len(header) == 1 and (";" in header[0] or "\t" in header[0]):
            add(
                ImportIssue(
                    "invalid_csv",
                    "The file is not comma-separated. Export as 'CSV UTF-8 (comma delimited)'.",
                )
            )
            return result
        if len(header) > MAX_COLUMNS:
            add(ImportIssue("invalid_csv", f"The file has more than {MAX_COLUMNS} columns."))
            return result

        names = [name.casefold() for name in header]
        lat_columns = [i for i, name in enumerate(names) if name in LAT_NAMES]
        lon_columns = [i for i, name in enumerate(names) if name in LON_NAMES]
        for label, columns, options in (
            ("latitude", lat_columns, "lat or latitude"),
            ("longitude", lon_columns, "lon, lng or longitude"),
        ):
            if not columns:
                add(ImportIssue("missing_column", f"Missing {label} column ({options})."))
            elif len(columns) > 1:
                add(ImportIssue("invalid_csv", f"Several {label} columns; keep exactly one."))
        property_names = [
            name for i, name in enumerate(header) if name and i not in (*lat_columns, *lon_columns)
        ]
        duplicates = {name for name in property_names if property_names.count(name) > 1}
        for name in sorted(duplicates):
            add(ImportIssue("invalid_csv", f"Duplicate column name '{name}'."))
        if not result.ok:
            return result

        lat_index, lon_index = lat_columns[0], lon_columns[0]
        property_columns = [
            (i, name) for i, name in enumerate(header) if name and i not in (lat_index, lon_index)
        ]

        for row_number, row in records:
            if _is_blank(row):
                continue
            location = {"row": row_number}
            if len(row) != len(header):
                add(
                    ImportIssue(
                        "invalid_row",
                        f"Expected {len(header)} columns, found {len(row)}.",
                        location,
                    )
                )
                continue
            lat = _coordinate(row[lat_index], "Latitude", 90)
            lon = _coordinate(row[lon_index], "Longitude", 180)
            # One error per row: report the first coordinate problem only.
            if isinstance(lat, ImportIssue):
                add(ImportIssue(lat.code, lat.message, location))
                continue
            if isinstance(lon, ImportIssue):
                add(ImportIssue(lon.code, lon.message, location))
                continue
            if result.ok:
                properties = {
                    name: row[i].strip() for i, name in property_columns if row[i].strip() != ""
                }
                result.features.append(ParsedFeature(lon, lat, properties))
    except csv.Error as error:
        # e.g. a cell over the parser's field-size limit; never let a hostile file raise.
        result.features.clear()
        add(ImportIssue("invalid_csv", f"The file could not be read as CSV: {error}"))
        return result

    if result.ok and not result.features:
        add(ImportIssue("empty_collection", "The file contains no data rows."))
    if not result.ok:
        result.features.clear()
    return result
