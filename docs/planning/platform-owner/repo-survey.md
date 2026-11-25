# Averiq platform-owner dashboard repository survey

Reviewed on 2026-11-24 against the working tree in `FYP_Part_1`, with `HEAD` at `11d6ff8`. The tree already contained changes in the Promptfoo migration and other files. The source review uses the working tree as observed.

## Recent commits

```text
11d6ff8 Red team promptfoo: spec 08 bridge provider
26ac31e Red team promptfoo: spec 04 config and environment builder
e4dc52d Red team promptfoo: spec 02 catalog metadata, spec 06 report aggregation
21586fd Red team promptfoo: specs 13-15 report summary, compliance tabs, results and detail
5cfdb45 Red team promptfoo: spec 03 framework compliance, spec 12 list and run progress
c537d6e Red team promptfoo: spec 01 pinned promptfoo runtime, runtime checker, deployment notes
695d972 Red team promptfoo: spec 05 results parser, spec 07 client service and labels
84d0456 Plan: promptfoo red team uses Cloud API-key login; spec review fixes
fab00f0 Snapshot before promptfoo red-team migration
2d25058 first commit
```

## Relevant working tree

- `Frontend/src/App.jsx`, `config/`, and `pages/` own the hash-routed React workspace, session state, navigation and screens. `services/`, `components/`, and `features/` contain HTTP clients, shared UI and feature code. `Frontend/tests/` contains Node tests and Playwright browser tests.
- `backend/app/api/` owns FastAPI routes and dependencies. `core/`, `services/`, `repositories/`, `models/`, `schemas/`, and `db/` contain authorization, workflows, data shapes and Mongo persistence. `validators/`, `queue/`, `workers/`, and `red_team/` handle execution. `backend/tests/` contains pytest unit, integration and benchmark suites.
- Root `package.json` pins Promptfoo 0.126.0 and declares Node 24. `Frontend/package.json` declares React 19, Vite 8, Tailwind CSS 4, Radix primitives, Recharts, Vitest and Playwright. `backend/requirements.txt` pins FastAPI 0.116.1 and PyMongo 4.13.2, and includes RabbitMQ client Pika. The root Python requirements file points to the backend manifest.
- `AGENTS.md`, `.ai/plan-project/`, `PRODUCT.md`, `DESIGN.md`, `docs/`, `design/`, `specs/`, `specs-red-team/`, and `specs-promptfoo/` already exist. The first-pass dashboard materials use a feature-specific planning directory and research file.

The [source walkthrough](../../research/platform-owner.md) records the customer, administrator and platform flows. The [feature proposal](brief.md) records the initial scope recommendation.
