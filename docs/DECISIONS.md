# Project Decisions

This file records product and architecture decisions that unblock implementation phases.

## Phase 0 - v1 Scope Decisions

Date: 2026-05-13

### AI Provider Set

v1 includes OpenAI, Anthropic, Google Gemini, DeepSeek, Kimi, GLM, Qwen, Llama, OpenRouter, and Ollama.

Rationale: the platform should let players bring the AI ecosystem they already use. OpenRouter broadens model access through one compatible route, while Ollama and Llama keep a local/self-hosted path available for users who do not want to send prompts or keys to a hosted provider.

### Hosting Target

v1 targets localhost-only static development and preview builds.

Rationale: the design is BYOK and zero-backend, so local hosting is enough for the first playable milestone. Cloudflare Pages or GitHub Pages deployment can be added later without changing the core architecture.

### Passphrase-Encrypted Key Storage

Passphrase encryption is deferred to v1.1. v1 stores keys in `localStorage` under `byok.keys.v1` and must show the security notice from `docs/DESIGN.md`.

Rationale: the v1 security baseline is strict CSP, no third-party scripts, no analytics, and clear disclosure. Encryption at rest is useful polish, but it is not required to make the localhost-first MVP playable.

## Phase 10 - Local Bot Direction

Date: 2026-05-25

### Splendor Non-LLM Bot

Splendor should support a local, non-LLM bot path as a post-MVP enhancement. The first version should be a deterministic heuristic bot that consumes the existing `legalMoves()` output and returns a valid `SplendorMove`; stronger difficulties can add opponent-denial scoring, shallow lookahead, rollouts, or MCTS.

Rationale: Splendor is mostly open-information, numerically scored, and tactically compact. A local bot can play credibly without provider keys, keeps turn latency and cost near zero, and gives the project a useful contrast with LLM-heavy games such as Secret Hitler.
