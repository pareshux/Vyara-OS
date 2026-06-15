# ADR-006 — AI as Platform (Central Engine, Not Per-Module Features)

**Status:** Accepted  
**Date:** 2026-06-15

## Context

AI capabilities will appear in many places: BOQ extraction from documents, field voice-note to structured activity, collections dunning voice calls, quote summarisation, lead scoring, board reports. The naive approach is each module calling its AI provider directly.

This creates: duplicated provider config, no centralized cost control, inconsistent logging, per-module prompt versioning, and no non-AI fallback discipline.

## Decision

`modules/shared/ai/` is the single AI engine. Every module calls it via the public API. No module may import an AI SDK directly.

The AI engine provides:
- **Skills** (classify, extract, draft, summarise, score, predict) — each with a non-AI fallback
- **Prompt registry** — versioned prompts stored in DB, swappable without deploy
- **Provider routing** — Claude Haiku for cheap/fast tasks (classification, extraction); Claude Sonnet for complex reasoning (report generation, negotiation advice); Sarvam for STT/TTS (voice in Indian languages)
- **Action gating** — `draft_only` vs `autonomous` modes per skill; human-in-loop mandatory where money or customer reputation is at stake
- **Audit logging** — every AI action logged with input/output/model/latency/cost to `ai_action_log`
- **Evaluation hooks** — golden sets per skill, accuracy tracking

## Consequences

**Good:** One place to rotate API keys, control spend, track accuracy, add new providers. Non-AI fallbacks prevent AI outages from breaking core workflows.

**Accepted trade-off:** Some module-specific context must be passed to the central engine; generic interfaces may feel slightly over-engineered for the first skill. The payoff is the second and third skill being near-zero effort.

**v1 AI scope (committed):** Field voice-note → structured activity (Sarvam STT + Claude extraction). Everything else is Phase 2+.
