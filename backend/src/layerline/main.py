from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from layerline.errors import install_error_handlers
from layerline.jobs import app as jobs_app
from layerline.routes import router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    async with jobs_app.open_async():
        yield


app = FastAPI(title="Layerline API", lifespan=lifespan)
install_error_handlers(app)
app.include_router(router)


def _openapi() -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    # Validation failures are returned as 400 with our error shape (errors.py), never FastAPI's
    # default 422, so the default entries would misdescribe the API.
    for path in schema["paths"].values():
        for operation in path.values():
            operation["responses"].pop("422", None)
    for name in ("HTTPValidationError", "ValidationError"):
        schema["components"]["schemas"].pop(name, None)
    app.openapi_schema = schema
    return schema


app.openapi = _openapi  # type: ignore[method-assign]
