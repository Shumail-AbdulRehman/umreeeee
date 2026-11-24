"""Port the scheduler's literal framework metadata without executing its source."""

import argparse
import ast
import hashlib
import json
from pathlib import Path


OUTPUT = Path(__file__).resolve().parents[1] / "app" / "red_team" / "scheduler_frameworks.json"
# Record the original port date so the same source always reproduces the artifact.
PORTED_DATE = "2026-11-23"


def _read_frameworks(source):
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
        else:
            continue
        if any(isinstance(target, ast.Name) and target.id == "FRAMEWORKS" for target in targets):
            try:
                return ast.literal_eval(node.value)
            except (ValueError, TypeError, SyntaxError):
                raise ValueError("FRAMEWORKS must be a literal") from None
    raise ValueError("FRAMEWORKS assignment is missing")


def port_frameworks(path):
    """Return the permitted framework fields and source provenance."""
    source = path.read_bytes()
    frameworks = _read_frameworks(source)
    return {
        "source": {
            "file": "utils/constants.py",
            "sha256": hashlib.sha256(source).hexdigest(),
            "ported_date": PORTED_DATE,
        },
        "license_note": "owner's scheduler, reused with permission",
        "frameworks": [
            {
                "id": framework_id,
                "name": framework["name"],
                "description": framework["desc"],
                "controls": [
                    {
                        "id": control_id,
                        "name": control["name"],
                        "plugins": [
                            {"id": plugin_id, "name": plugin["name"], "severity": plugin["severity"]}
                            for plugin_id, plugin in control["plugins"].items()
                        ],
                    }
                    for control_id, control in framework["controls"].items()
                ],
            }
            for framework_id, framework in frameworks.items()
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Scheduler utils/constants.py")
    args = parser.parse_args()
    try:
        data = port_frameworks(args.source)
    except ValueError as exc:
        parser.error(str(exc))
    except (AttributeError, KeyError, SyntaxError, TypeError):
        parser.error("Invalid scheduler framework metadata")
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
