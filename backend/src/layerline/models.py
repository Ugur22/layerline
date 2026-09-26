import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Every table carries organisation_id so the data-access layer can scope each query (ADR 0003).


class Base(DeclarativeBase):
    pass


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _org() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), index=True)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class Organisation(Base):
    __tablename__ = "organisations"

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = _created()


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = _pk()
    organisation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organisations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = _created()


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = _pk()
    organisation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organisations.id"), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = _created()


class ImportJob(Base):
    __tablename__ = "import_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'processing', 'succeeded', 'failed')",
            name="import_jobs_status_valid",
        ),
    )

    id: Mapped[uuid.UUID] = _pk()
    organisation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organisations.id"), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    # Server-generated path; the client's filename is kept only for display.
    stored_path: Mapped[str] = mapped_column(Text)
    original_filename: Mapped[str] = mapped_column(String(255))
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    errors_truncated: Mapped[bool] = mapped_column(default=False)
    feature_count: Mapped[int | None] = mapped_column(Integer, default=None)
    created_at: Mapped[datetime] = _created()
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class MapLayer(Base):
    __tablename__ = "map_layers"

    id: Mapped[uuid.UUID] = _pk()
    organisation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organisations.id"), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id"), index=True)
    import_job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_jobs.id"), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    geometry_type: Mapped[str] = mapped_column(String(30))
    feature_count: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created()


class SpatialFeature(Base):
    __tablename__ = "spatial_features"

    id: Mapped[uuid.UUID] = _pk()
    organisation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organisations.id"), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id"), index=True)
    import_job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("import_jobs.id"), index=True)
    geom: Mapped[Any] = mapped_column(Geometry(geometry_type="GEOMETRY", srid=4326))
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    # 0-based place in the uploaded file (GeoJSON `features` order, CSV data rows top to bottom).
    # The default only covers rows stored before this column existed: every insert path must set it,
    # or those features fall back to arbitrary order without any error.
    position: Mapped[int] = mapped_column(Integer, server_default="0")
