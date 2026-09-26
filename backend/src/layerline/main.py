from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

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
