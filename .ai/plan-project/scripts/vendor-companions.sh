#!/usr/bin/env bash
#
# vendor-companions.sh — refresh the three design skills bundled in companions/.
#
#   scripts/vendor-companions.sh              # latest upstream main
#   scripts/vendor-companions.sh --check      # report upstream drift, change nothing
#
# plan-project's design pipeline runs gpt-taste → animate → impeccable. They are
# bundled so one install brings all four skills. Each is copied verbatim from its
# upstream repo at a pinned commit, with its licence, and recorded in
# companions/PROVENANCE.md. Never edit a companion by hand — re-run this.
#
# impeccable's scripts/bin/ (a ~16 MB platform binary) is not in its git repo;
# its launcher downloads the binary on first run, so nothing is lost here.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HERE/companions"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

# name | repo | path inside repo | licence files (space separated)
COMPANIONS=(
  "gpt-taste|Leonxlnx/taste-skill|skills/gpt-tasteskill|LICENSE"
  "animate|emilkowalski/skill|skills/animate|LICENSE"
  "impeccable|pbakaus/impeccable|plugin/skills/impeccable|LICENSE NOTICE.md"
)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rows=()
for entry in "${COMPANIONS[@]}"; do
  IFS='|' read -r name repo sub lic <<<"$entry"
  git clone -q --depth 1 "https://github.com/$repo.git" "$TMP/$name"
  sha="$(git -C "$TMP/$name" rev-parse HEAD)"
  [[ -f "$TMP/$name/$sub/SKILL.md" ]] || { echo "x $name: no SKILL.md at $repo/$sub" >&2; exit 1; }

  if ((CHECK)); then
    pinned="$(grep -oE "^\| $name \|[^|]+\|[^|]+\| \`[0-9a-f]+\`" "$DEST/PROVENANCE.md" 2>/dev/null \
              | grep -oE '[0-9a-f]{40}' || true)"
    [[ "$pinned" == "$sha" ]] && echo "  $name  current ($sha)" \
                              || echo "  $name  upstream moved: ${pinned:-none} -> $sha"
    continue
  fi

  rm -rf "${DEST:?}/$name"
  mkdir -p "$DEST/$name"
  cp -a "$TMP/$name/$sub/." "$DEST/$name/"
  rm -rf "$DEST/$name/scripts/bin"
  for f in $lic; do cp "$TMP/$name/$f" "$DEST/$name/$f"; done
  spdx="$(gh api "repos/$repo" --jq '.license.spdx_id' 2>/dev/null || echo "see LICENSE")"
  rows+=("| $name | [$repo](https://github.com/$repo) | \`$sub\` | \`$sha\` | $spdx |")
  echo "  $name  $sha"
done

((CHECK)) && exit 0

{
  cat <<'EOF'
# Companion skills — provenance

plan-project's design pipeline (`references/design-pipeline.md`) runs three
skills in order: **gpt-taste** → `design/v1`, **animate** → `design/v2`,
**impeccable** → `design/v3`. They are bundled here so that installing
plan-project installs all four. Each is an unmodified copy of its upstream, at
the commit below, under its own licence (in its folder).

| Skill | Upstream | Path | Commit | Licence |
| --- | --- | --- | --- | --- |
EOF
  printf '%s\n' "${rows[@]}"
  cat <<EOF

Vendored $(date +%F) by \`scripts/vendor-companions.sh\`. Refresh with that
script; never edit a companion by hand. impeccable's \`scripts/bin/\` platform
binary is not part of its git repo — its launcher downloads it on first run.
EOF
} >"$DEST/PROVENANCE.md"

echo "wrote $DEST/PROVENANCE.md"
