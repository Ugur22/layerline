"""Response shapes. They mirror docs/api-contracts.md and drive the generated OpenAPI schema."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

ImportStatus = Literal["queued", "processing", "succeeded", "failed"]


class Health(BaseModel):
    status: Literal["ok"]


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[Any]


class ErrorResponse(BaseModel):
    error: ErrorBody


class ImportIssueOut(BaseModel):
    code: str
    message: str
    location: dict[str, int] | None


class ImportJobOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    status: ImportStatus
    created_at: datetime
    finished_at: datetime | None
    feature_count: int | None
    map_layer_id: uuid.UUID | None
    errors: list[ImportIssueOut]
    errors_truncated: bool


class ImportJobResponse(BaseModel):
    import_job: ImportJobOut


class MapLayerOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    name: str
    geometry_type: str
    feature_count: int
    bbox: list[float] | None


class PointGeometry(BaseModel):
    type: Literal["Point"]
    coordinates: list[float]


class FeatureOut(BaseModel):
    type: Literal["Feature"]
    id: uuid.UUID
    geometry: PointGeometry
    properties: dict[str, Any]


class FeatureCollectionOut(BaseModel):
    type: Literal["FeatureCollection"]
    features: list[FeatureOut]


class MapLayerResponse(BaseModel):
    map_layer: MapLayerOut
    features: FeatureCollectionOut
