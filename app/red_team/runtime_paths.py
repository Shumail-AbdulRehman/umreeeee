"""Locate the runtime in the combined repo and a standalone API checkout."""

from pathlib import Path


def runtime_root(backend_root: Path) -> Path:
    if backend_root.name == "backend" and not (backend_root / "package.json").is_file():
        return backend_root.parent
    return backend_root


BACKEND_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOT = runtime_root(BACKEND_ROOT)
PROMPTFOO_BINARY = RUNTIME_ROOT / "node_modules" / ".bin" / "promptfoo"
BRIDGE_PROVIDER = BACKEND_ROOT / "promptfoo_bridge" / "provider.py"
