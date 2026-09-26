from functools import lru_cache
from pathlib import Path
from uuid import UUID

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LAYERLINE_")

    # Defaults to production so the placeholder identity (ADR 0003) is off unless opted in.
    environment: str = "production"
    database_url: str
    storage_dir: Path = Path("/data/uploads")
    # Provisional: the real limit is an open question in docs/product.md.
    max_upload_bytes: int = 10 * 1024 * 1024
    # Cap stored per job so one bad file cannot bloat the import_jobs row.
    max_reported_errors: int = 50
    # Retries after the first run, matching Procrastinate's `max_attempts`; total runs = 1 + this.
    max_import_retries: int = 3
    processing_lease_minutes: int = 15
    dev_organisation_id: UUID = UUID("00000000-0000-4000-8000-000000000001")
    dev_actor_id: UUID = UUID("00000000-0000-4000-8000-0000000000a1")

    @property
    def sqlalchemy_url(self) -> str:
        return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # database_url comes from the environment
