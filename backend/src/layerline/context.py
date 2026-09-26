import uuid
from dataclasses import dataclass

from fastapi import Header

from layerline.config import get_settings
from layerline.errors import ApiError


@dataclass(frozen=True)
class RequestContext:
    organisation_id: uuid.UUID
    actor_id: uuid.UUID


def get_context(x_dev_organisation_id: str | None = Header(default=None)) -> RequestContext:
    """Placeholder identity (ADR 0003). It is not a security boundary, so it is refused outside
    development. Real authentication replaces this single dependency."""
    settings = get_settings()
    if settings.environment != "development":
        raise ApiError(401, "unauthorized", "Authentication is required.")
    organisation_id = settings.dev_organisation_id
    if x_dev_organisation_id is not None:
        try:
            organisation_id = uuid.UUID(x_dev_organisation_id)
        except ValueError:
            raise ApiError(401, "unauthorized", "Invalid organisation header.") from None
    return RequestContext(organisation_id=organisation_id, actor_id=settings.dev_actor_id)
