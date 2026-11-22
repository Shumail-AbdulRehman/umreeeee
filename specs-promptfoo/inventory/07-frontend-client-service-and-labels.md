# Spec 07 reuse inventory

| Path | Surface | Use |
| --- | --- | --- |
| [`Frontend/src/services/redTeam/redTeamService.js`](../../Frontend/src/services/redTeam/redTeamService.js) | `RedTeamTestConfig`, `RedTeamTest`, `RedTeamMode`, `RedTeamGrader`, `RedTeamCounts`, `RedTeamProgress`, `RedTeamStatus`, `RedTeamPhase` | JSDoc types for drafts, tests and run progress. |
| [`Frontend/src/services/redTeam/redTeamService.js`](../../Frontend/src/services/redTeam/redTeamService.js) | `RedTeamCapabilities`, `PromptfooRuntime` | Capability DTO with separate detected version, runtime availability, Cloud key presence and queue/worker signals. |
| [`Frontend/src/services/redTeam/redTeamService.js`](../../Frontend/src/services/redTeam/redTeamService.js) | `RedTeamPage`, `RedTeamAttack`, `RedTeamDecision`, `RedTeamVerdict`, `RedTeamVerdictSource`, `RedTeamSeverity`, `RedTeamReport` | JSDoc types for paginated reads, result evidence and paired reports. |
| [`Frontend/src/features/red-team/labels.js`](../../Frontend/src/features/red-team/labels.js) | `phaseLabel`, `decisionLabel` | Shared `{label, tone}` lookups with neutral fallbacks for run phases and target decisions. |
| [`Frontend/src/features/red-team/labels.js`](../../Frontend/src/features/red-team/labels.js) | `statusLabel`, `verdictLabel`, `evidenceSourceLabel` | Existing exports now cover generation and explicit promptfoo verdict sources. |
