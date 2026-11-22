# Companion skills — provenance

plan-project's design pipeline (`references/design-pipeline.md`) runs three
skills in order: **gpt-taste** → `design/v1`, **animate** → `design/v2`,
**impeccable** → `design/v3`. They are bundled here so that installing
plan-project installs all four. Each is an unmodified copy of its upstream, at
the commit below, under its own licence (in its folder).

| Skill | Upstream | Path | Commit | Licence |
| --- | --- | --- | --- | --- |
| gpt-taste | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | `skills/gpt-tasteskill` | `f624f37a8c650b9cc550253104925efe4c8de246` | MIT |
| animate | [emilkowalski/skill](https://github.com/emilkowalski/skill) | `skills/animate` | `2d228630ba1446365f614a108cb8252f1feda202` | MIT |
| impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `plugin/skills/impeccable` | `2f46b7a8b059af00d20dd13b64dbe165e7c6a742` | Apache-2.0 |

Vendored 2026-10-19 by `scripts/vendor-companions.sh`. Refresh with that
script; never edit a companion by hand. impeccable's `scripts/bin/` platform
binary is not part of its git repo — its launcher downloads it on first run.
