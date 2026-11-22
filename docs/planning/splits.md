# Split decisions

The user approved direct implementation after v3. One parser/presentation unit, one policy-disclosure unit, one history/focus unit and one composer/control unit fan out from the component harness. Only integration owns PromptStudioPage, workspace.css and PageTitle, avoiding hot-file collisions. One browser unit covers all flows and one final verification unit checks the whole result.

Rejected: one oversized “redesign studio” spec; a serial one-unit-per-visual-section chain; an unnecessary backend/state-library migration; and duplicating the existing API or overlay foundations.
