"""Extract framework metadata from the installed promptfoo package without loading its JS."""

import argparse
import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE = REPO_ROOT / "node_modules" / "promptfoo"
OUTPUT = REPO_ROOT / "backend" / "app" / "red_team" / "promptfoo_frameworks.json"
VERSION = "0.126.0"

# The chunk names and literal syntax are specific to the pinned npm artifact.
TABLES = "dist/src/tables-DdCbyxUP.js"
REPORT = "dist/src/app/assets/index-Cvjh7gqz.js"
FRAMEWORKS = (
    ("owasp", "owasp:llm", "OWASP LLM Top 10 2025", "OWASP_LLM_TOP_10_MAPPING"),
    ("nist", "nist:ai:measure", "NIST AI RMF", "NIST_AI_RMF_MAPPING"),
    ("atlas", "mitre:atlas", "MITRE ATLAS", "MITRE_ATLAS_MAPPING"),
    ("eu", "eu:ai-act", "EU AI Act", "EU_AI_ACT_MAPPING"),
)
EU_GROUPS = {"art5": "Art. 5", "annex3": "Annex III"}


def _read_object(source, symbol, references=None):
    match = re.search(rf"^const {symbol} = (\{{\n.*?^\}});", source, re.MULTILINE | re.DOTALL)
    if match is None:
        raise ValueError(f"Missing metadata object {symbol}")
    literal = re.sub(r"(?m)^(\s*)(plugins|strategies):", r'\1"\2":', match[1])
    for name, value in (references or {}).items():
        literal = re.sub(rf": {name}(?=,|\n)", lambda _: ": " + json.dumps(value), literal)
    return json.loads(literal)


def _owasp_titles(source):
    # zH is the array indexed by control number in the report CSV exporter.
    match = re.search(r"\bzH=(\[(?:`[^`]+`,?)+\])", source)
    if match is None:
        raise ValueError("Missing OWASP LLM control titles")
    return re.findall(r"`([^`]+)`", match[1])


def _controls(mapping, prefix, owasp_titles):
    for upstream_id, entry in mapping.items():
        if not upstream_id.startswith(prefix + ":"):
            raise ValueError(f"Unexpected control id {upstream_id} in {prefix}")
        suffix = upstream_id.removeprefix(prefix + ":")
        if prefix == "owasp:llm":
            key, title = f"llm{suffix}", owasp_titles[int(suffix) - 1]
        elif prefix == "nist:ai:measure":
            key, title = f"measure-{suffix}", f"Measure {suffix}"
        else:
            group, _, slug = suffix.rpartition(":")
            key = suffix.replace(":", "-")
            title = " ".join(word.upper() if word in {"ai", "id", "hr"} else word.title()
                             for word in slug.split("-"))
            if group:
                title = f"{EU_GROUPS[group]} · {title}"
        yield {"key": key, "id": upstream_id, "name": title, "plugins": entry["plugins"]}


def extract(package=PACKAGE):
    manifest = json.loads((package / "package.json").read_text(encoding="utf-8"))
    if (manifest.get("name"), manifest.get("version")) != ("promptfoo", VERSION):
        raise ValueError(f"Expected installed promptfoo {VERSION}")

    tables = (package / TABLES).read_text(encoding="utf-8")
    owasp_titles = _owasp_titles((package / REPORT).read_text(encoding="utf-8"))
    staging = "MITRE_ATLAS_AI_ATTACK_STAGING_MAPPING"
    atlas_references = {staging: _read_object(tables, staging)}
    return {
        "source": f"promptfoo {VERSION}",
        "license": (package / "LICENSE").read_text(encoding="utf-8").strip(),
        "frameworks": [
            {
                "id": app_id,
                "promptfoo_id": prefix,
                "name": name,
                "controls": list(_controls(
                    _read_object(tables, symbol, atlas_references if app_id == "atlas" else None),
                    prefix,
                    owasp_titles,
                )),
            }
            for app_id, prefix, name, symbol in FRAMEWORKS
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare with the committed JSON.")
    args = parser.parse_args()
    try:
        generated = (json.dumps(extract(), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        if args.check:
            if OUTPUT.read_bytes() != generated:
                parser.exit(1, f"{OUTPUT.name} differs from the installed package mapping\n")
            print(f"{OUTPUT.name} matches promptfoo {VERSION} byte-for-byte")
        else:
            OUTPUT.write_bytes(generated)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Could not extract framework metadata: {exc}\n")


if __name__ == "__main__":
    main()
