import pytest

from layerline.csv_import import parse_csv


def csv_bytes(*lines: str) -> bytes:
    return "\n".join(lines).encode()


def codes(raw: bytes) -> list[str]:
    return [e.code for e in parse_csv(raw, max_errors=50).errors]


def test_parses_points_and_keeps_other_columns_as_text_properties() -> None:
    raw = csv_bytes("name,lat,lon,depth_m", "Station 1,52.37,4.9,12", "Station 2,52.4,4.95,8")

    result = parse_csv(raw, max_errors=50)

    assert result.ok
    assert [(f.lon, f.lat) for f in result.features] == [(4.9, 52.37), (4.95, 52.4)]
    assert result.features[0].properties == {"name": "Station 1", "depth_m": "12"}


@pytest.mark.parametrize(
    "header",
    ["lat,lon", "Latitude,Longitude", " LAT , LNG ", "lon,lat", "LATITUDE,lon"],
)
def test_coordinate_column_names_are_flexible(header: str) -> None:
    lat_first = header.lower().lstrip().startswith("lat")
    row = "52.37,4.9" if lat_first else "4.9,52.37"

    result = parse_csv(csv_bytes(header, row), max_errors=50)

    assert result.ok
    assert (result.features[0].lon, result.features[0].lat) == (4.9, 52.37)


def test_accepts_a_byte_order_mark_and_ignores_blank_rows_and_empty_cells() -> None:
    raw = b"\xef\xbb\xbf" + csv_bytes(
        "lat,lon,note", "52.37,4.9,", "", " , , ", "52.4,4.95, hello "
    )

    result = parse_csv(raw, max_errors=50)

    assert result.ok
    assert [f.properties for f in result.features] == [{}, {"note": "hello"}]


def test_columns_with_an_empty_header_are_ignored() -> None:
    result = parse_csv(csv_bytes("lat,lon,,name", "52.37,4.9,junk,A"), max_errors=50)

    assert result.ok
    assert result.features[0].properties == {"name": "A"}


def test_quoted_cells_may_contain_commas_and_newlines() -> None:
    raw = b'lat,lon,note\n52.37,4.9,"a, b\nc"\n52.4,4.95,x\n'

    result = parse_csv(raw, max_errors=50)

    assert result.ok
    assert result.features[0].properties == {"note": "a, b\nc"}
    assert len(result.features) == 2


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (b"", ["empty_collection"]),
        (csv_bytes("lat,lon"), ["empty_collection"]),
        (b"\xff\xfe\x00", ["invalid_csv"]),
        (csv_bytes("lat;lon", "52,4;4,9"), ["invalid_csv"]),
        (csv_bytes("lat\tlon", "52.4\t4.9"), ["invalid_csv"]),
        (csv_bytes("name,lon", "A,4.9"), ["missing_column"]),
        (csv_bytes("name,value", "A,1"), ["missing_column", "missing_column"]),
        (csv_bytes("lat,latitude,lon", "1,2,3"), ["invalid_csv"]),
        (csv_bytes("lat,lon,name,name", "1,2,a,b"), ["invalid_csv"]),
        (csv_bytes("lat,lon", "52.4"), ["invalid_row"]),
        (csv_bytes("lat,lon", "52.4,4.9,extra"), ["invalid_row"]),
        (csv_bytes("lat,lon", "52,37;4,9"), ["invalid_row"]),
        (csv_bytes("lat,lon", "abc,4.9"), ["invalid_geometry"]),
        (csv_bytes("lat,lon", "52.4,"), ["invalid_geometry"]),
        (csv_bytes("lat,lon", "nan,4.9"), ["invalid_geometry"]),
        (csv_bytes("lat,lon", "inf,4.9"), ["invalid_geometry"]),
        (csv_bytes("lat,lon", "1_0,4.9"), ["invalid_geometry"]),
        (csv_bytes("lat,lon", "52,37,4.9"), ["invalid_row"]),
        (csv_bytes("lat,lon", "91,4.9"), ["invalid_geometry"]),
        (csv_bytes("lat,lon", "52.4,181"), ["invalid_geometry"]),
    ],
)
def test_rejects_invalid_files(raw: bytes, expected: list[str]) -> None:
    assert codes(raw) == expected


def test_semicolon_files_get_an_actionable_message() -> None:
    result = parse_csv(csv_bytes("lat;lon", "52,4;4,9"), max_errors=50)

    assert "comma" in result.errors[0].message.lower()
    assert result.errors[0].location is None


def test_row_errors_use_spreadsheet_row_numbers_and_store_nothing() -> None:
    # Header is row 1, a blank line still occupies row 3, so the bad value is on row 4.
    raw = csv_bytes("lat,lon", "52.4,4.9", "", "999,4.9", "52.5,5.0")

    result = parse_csv(raw, max_errors=50)

    assert result.features == []
    assert [(e.code, e.location) for e in result.errors] == [("invalid_geometry", {"row": 4})]


def test_reports_one_error_per_bad_row_and_caps_the_list() -> None:
    raw = csv_bytes("lat,lon", *["999,999"] * 5)

    result = parse_csv(raw, max_errors=2)

    assert len(result.errors) == 2
    assert result.errors_truncated is True


def test_too_many_columns_is_rejected_before_reading_rows() -> None:
    header = ",".join(["lat", "lon", *[f"c{i}" for i in range(99)]])

    assert codes(csv_bytes(header, "1,2")) == ["invalid_csv"]
    assert codes(csv_bytes(",".join(["lat", "lon", *[f"c{i}" for i in range(98)]]), "1,2")) == [
        "invalid_row"
    ]


def test_oversized_cell_is_a_csv_error_not_a_crash() -> None:
    raw = ("lat,lon,note\n1,2," + "x" * 200_000 + "\n").encode()

    assert codes(raw) == ["invalid_csv"]
