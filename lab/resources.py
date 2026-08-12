"""Resolve canonical runtime resources in a checkout or an installed wheel."""
from __future__ import annotations

from importlib.resources import files
from pathlib import Path


def resource_path(relative: str) -> Path:
    """Prefer canonical checkout paths, then fall back to packaged release resources."""
    source = Path(relative)
    if source.exists():
        return source
    packaged = files("lab").joinpath("resources", relative)
    # Wheels install packages as real directories under site-packages in the supported
    # deployment path, so Path(str(...)) is valid and keeps stdlib-only consumers simple.
    path = Path(str(packaged))
    if not path.exists():
        raise FileNotFoundError(f"Lab resource not found: {relative}")
    return path
