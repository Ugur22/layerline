import uuid
from pathlib import Path

from layerline.config import get_settings


class LocalStorage:
    """Raw-upload storage. Callers only see opaque keys, so an S3-compatible backend can replace
    this later (ADR 0002)."""

    def __init__(self, root: Path) -> None:
        self._root = root

    def _resolve(self, key: str) -> Path:
        path = (self._root / key).resolve()
        if not path.is_relative_to(self._root.resolve()):
            raise ValueError("storage key escapes the storage root")
        return path

    def save(self, data: bytes) -> str:
        # The key is server-generated; the client's filename never reaches the filesystem.
        key = f"{uuid.uuid4()}.upload"
        self._root.mkdir(parents=True, exist_ok=True)
        self._resolve(key).write_bytes(data)
        return key

    def read(self, key: str) -> bytes:
        return self._resolve(key).read_bytes()

    def delete(self, key: str) -> None:
        self._resolve(key).unlink(missing_ok=True)


def get_storage() -> LocalStorage:
    return LocalStorage(get_settings().storage_dir)
