#!/usr/bin/env python3
"""Generate isolated Compose credentials without reading backend/.env."""
import argparse
import base64
import os
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = Path(__file__).with_name(".env.example")
REQUIRED = ("SECRET_KEY", "INTEGRATION_ENCRYPTION_KEY", "CONTENT_ENCRYPTION_KEY", "RABBITMQ_PASSWORD")


def read_values(path):
    values = {}
    for line in Path(path).read_text().splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def validate(path):
    values = read_values(path)
    missing = [key for key in REQUIRED if not values.get(key)]
    if missing:
        raise ValueError("Missing required settings: " + ", ".join(missing))
    if len(values["SECRET_KEY"]) < 32:
        raise ValueError("SECRET_KEY must contain at least 32 characters.")
    for key in REQUIRED[1:3]:
        try:
            if len(base64.b64decode(values[key], altchars=b"-_", validate=True)) != 32:
                raise ValueError
        except (ValueError, TypeError) as error:
            raise ValueError(key + " must be a Fernet key.") from error
    if values["INTEGRATION_ENCRYPTION_KEY"] == values["CONTENT_ENCRYPTION_KEY"]:
        raise ValueError("The two encryption keys must be different.")
    password = values["RABBITMQ_PASSWORD"]
    if len(password) < 24 or not password.isascii() or not password.isalnum():
        raise ValueError("RABBITMQ_PASSWORD must be at least 24 URL-safe letters/digits.")
    return values


def create(path):
    path = Path(path)
    generated = {
        "SECRET_KEY": secrets.token_urlsafe(48),
        "INTEGRATION_ENCRYPTION_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
        "CONTENT_ENCRYPTION_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
        "RABBITMQ_PASSWORD": secrets.token_hex(32),
    }
    lines = []
    for line in TEMPLATE.read_text().splitlines():
        key = line.split("=", 1)[0] if "=" in line and not line.lstrip().startswith("#") else None
        lines.append(key + "=" + generated[key] if key in generated else line)
    content = "\n".join(lines) + "\n"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        handle.write(content)
    validate(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".env")
    parser.add_argument("--check", action="store_true", help="Validate without printing or changing secrets.")
    args = parser.parse_args()
    try:
        if args.check:
            validate(args.output)
            print("Compose credentials are valid; no secret values were printed.")
        else:
            create(args.output)
            print("Created private Compose environment:", args.output)
            print("Start with: docker compose up --build -d")
    except FileExistsError:
        print("Environment already exists and was left unchanged. Use --check to validate it.", file=sys.stderr)
        return 1
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
