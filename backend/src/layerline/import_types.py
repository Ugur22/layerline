"""Result types shared by every upload parser."""

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
