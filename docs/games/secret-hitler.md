# Secret Hitler AI Decision Pipeline Notes

> Implementation note for the Secret Hitler AI player flow. This is not a rules
> reference; it records the current AI state contract, guardrails, and the path
> toward a possible LangGraph-style workflow later.

## Overview

Secret Hitler currently uses a plain TypeScript AI decision pipeline rather than
LangChain or LangGraph. Each AI turn builds a player-specific JSON payload,
sends it through the provider-agnostic `src/lib/ai` abstraction, parses the JSON
response, validates it, and either retries or applies a legal fallback.

This is still the right default because most recent fixes have been about state
quality, prompt contracts, and deterministic validation rather than complex
multi-node orchestration.

## Current AI State Given To Players

The serialized payload gives each AI player only information that player is
allowed to know:

- Assigned player id/name, current phase, turn, president, nominee, election
  tracker, policy counts, draw/discard counts, and visible player statuses.
- The player's private role, party, objective, action guidance, and any private
  hand/result for the current phase.
- Per-player private memory: public claims, private notes, and player reads.
- Neutral public chat summaries grouped by turn number.
- Public legislative history recording enacted policy, turn, source, president,
  chancellor, and policy totals after enactment.
- Recent public chat messages.
- Deterministic legal moves with labels and move ids.

The neutral table summary is advisory public-chat interpretation only. It must
not be treated as truth or private knowledge.

## AI Turn Flow

The live Secret Hitler UI owns a custom flow because the game has social
deduction-specific behavior that does not fit the generic loop yet:

1. Build legal moves for the current AI player.
2. Serialize the current player view with `serializeSecretHitlerForAI`.
3. Call the selected model profile through `getProvider(...).complete(...)`.
4. Parse the JSON with `parseSecretHitlerAIResponse`.
5. Validate the move and public speech guardrails.
6. Retry up to three times with a corrective prompt when parsing, strategic
   validation, or public speech validation fails.
7. If repeated strategic contradictions persist, use a safe local fallback when
   one exists.
8. If public table talk remains unsafe, apply the move but suppress the public
   message.
9. Apply the move, update memory from `memoryPatch`, and continue AI automation
   until a human action or reveal pause is required.

Question replies use a separate shorter table-chat flow. They still receive the
player-specific serialized context, private memory, neutral table summary, and
recent public chat.

## Guardrails And Retry Behavior

Current guardrails are deliberately lightweight and local:

- Hidden-objective guidance tells Liberal, Fascist, and Hitler players what
  their real win condition is.
- Voting guidance prevents early-game hidden-role uncertainty from becoming
  automatic `nein` votes.
- Strategic move assessment catches obvious self-defeating policy choices, such
  as a Fascist Chancellor enacting the fifth Liberal policy when a Fascist
  policy is available.
- Strategic fallback can choose the obvious safer policy move after repeated bad
  model choices.
- Public speech assessment catches table talk that leaks private policy hands,
  exact discard/enact choices, hidden-team identity, or hidden-team intent.
- Unsafe public speech is retried first; if it persists, the move is kept and
  the table-talk message is suppressed.

The guardrails are not intended to be a full strategy engine. They only block
high-confidence mistakes that violate hidden information or an immediate win
condition.

## Known Failure Modes Already Addressed

- AI players leaking information between seats: each call now receives only that
  player's legal view and private memory.
- AI forgetting prior stances: each player has a private memory record that can
  be patched by later calls.
- Public persuasion not affecting memory: human chat can create public influence
  patches that update AI memories.
- Table chat context loss: neutral summaries are grouped by turn and appended as
  public advisory context.
- Models inferring policy history from noisy chat: legislative history is now a
  factual public ledger.
- Fascist/Hitler players accidentally helping Liberals win: private objectives,
  action guidance, strategic validation, and policy fallbacks reduce obvious
  self-sabotage.
- AI overcorrecting into universal no votes: early voting guidance encourages
  plausible governments before strong evidence or late Fascist-policy risk.
- Models revealing private policy decisions in public speech: speech validation
  retries or suppresses unsafe `tableTalk`.

## Future Pipeline Refactor

Before adding LangGraph, extract the current Secret Hitler AI flow into a plain
TypeScript decision pipeline with named stages. Suggested stage names:

- `buildPlayerContext`
- `requestMoveCandidate`
- `parseMoveCandidate`
- `assessStrategicMove`
- `assessPublicSpeech`
- `requestRevision`
- `chooseFallback`
- `applyMemoryPatch`

This keeps the code provider-agnostic and easy to test while making the
orchestration explicit enough to migrate later if needed.

## LangGraph Readiness Criteria

LangGraph becomes worth considering when the AI turn needs independent,
stateful nodes rather than one model call plus validators. Good triggers:

- Per-player interpretation of public chat separate from the neutral analyst.
- A persistent belief-update step that can retry or fail independently.
- Separate strategy, speech, and move-choice model calls.
- Validator-specific revision loops where only the failed stage is regenerated.
- Durable graph state for memory, beliefs, evidence, and planned cover stories.
- Debug tooling that benefits from seeing node-by-node decisions.

Until those needs are real, the default should remain the plain TypeScript
pipeline with small, testable state builders and validators.
