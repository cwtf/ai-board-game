# TODO — AI Board Game Platform

Sequenced for incremental code generation. Each phase ends with something playable or testable. Codex (or any code agent) should treat each numbered item as one PR's worth of work.

**Doc references**:
- Architecture & shared infra: [DESIGN.md](DESIGN.md)
- Splendor mechanics: [docs/games/splendor.md](docs/games/splendor.md)
- Exploding Kittens mechanics: [docs/games/exploding-kittens.md](docs/games/exploding-kittens.md)

Codex should read DESIGN.md before any phase, and the relevant per-game doc before Phases 5–8.

Legend: `[scaffold]` = boilerplate, `[engine]` = game logic, `[ui]` = UI work, `[ai]` = AI adapter or provider, `[infra]` = build/CI/hosting, `[test]` = tests.

---

## Phase 0 — Decisions to confirm

- [x] Provider set in v1: OpenAI, Anthropic, Google, DeepSeek, Kimi, GLM, Qwen, Llama, OpenRouter, and Ollama. See [DECISIONS.md](DECISIONS.md).
- [x] Hosting target: localhost-only for v1. See [DECISIONS.md](DECISIONS.md).
- [x] Passphrase-encrypted key mode: v1.1. v1 uses plain `localStorage` plus the security notice. See [DECISIONS.md](DECISIONS.md).

## Phase 1 — Project scaffolding

1. [x] [scaffold] `npm create astro@latest` with TypeScript strict, Tailwind, Svelte. Configured `output: 'static'`.
2. [x] [scaffold] Added ESLint + Prettier with Astro/Svelte/TS configs. Kept npm/package-lock because no package-manager switch was needed.
3. [x] [scaffold] Added `tsconfig.json` paths: `@/lib/*`, `@/components/*`, `@/games/*`.
4. [x] [infra] `.github/workflows/ci.yml`: install, audit, lint, typecheck, unit test, and build on PR and main.
5. [x] [infra] `.github/dependabot.yml` (weekly, npm).
6. [x] [infra] Deployment workflow skipped because Phase 0 chose localhost-only hosting for v1.
7. [x] [scaffold] `README.md` (1-paragraph what-it-is, quickstart, BYOK setup, screenshot placeholder). Verified `DESIGN.md`, `TODO.md`, `docs/games/*.md` are present.

## Phase 2 — Core shell and BYOK plumbing

> Spec: DESIGN.md §2.4 (AI provider interface), §2.6 (BYOK).

8. [x] [ui] Shell: `src/components/shell/Header.svelte` (title, settings link, provider status pill).
9. [x] [scaffold] `src/lib/storage/keys.ts`: typed get/set/clear for `byok.keys.v1`. SSR-safe.
10. [x] [ui] `src/pages/settings.astro` + island: per-provider masked input, save/clear, "test connection". Default provider + model picker.
11. [x] [ui] Security notice on settings page (verbatim text from DESIGN §2.6).
12. [x] [scaffold] `src/lib/ai/types.ts`: define `AIProvider`, `ChatMessage`, `CompleteParams`, `CompleteResult`, `TokenUsage`, `ProviderId`.
13. [x] [ai] `src/lib/ai/providers/openai.ts`: `complete()` against `/v1/chat/completions` with JSON response format. Surface usage. Map errors.
14. [x] [ai] `src/lib/ai/providers/anthropic.ts`: `/v1/messages` with `anthropic-dangerous-direct-browser-access: true`. JSON output via prompt + schema reminder. **Verified current API headers before implementing.**
15. [x] [ai] `src/lib/ai/providers/google.ts`: `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `x-goog-api-key`. JSON mode via `responseMimeType: 'application/json'`.
16. [x] [ai] `src/lib/ai/providers/deepseek.ts`: DeepSeek chat completion adapter. **Verified current endpoint and JSON-output support before implementing.**
17. [x] [ai] `src/lib/ai/providers/kimi.ts`: Kimi/Moonshot chat completion adapter. **Verified current endpoint and JSON-output support before implementing.**
18. [x] [ai] `src/lib/ai/providers/glm.ts`: GLM/Zhipu chat completion adapter. **Verified current endpoint and JSON-output support before implementing.**
19. [x] [ai] `src/lib/ai/providers/qwen.ts`: Qwen/DashScope chat completion adapter. **Verified current endpoint and JSON-output support before implementing.**
20. [x] [ai] `src/lib/ai/providers/llama.ts`: Llama adapter for a user-configured local or hosted Llama-compatible endpoint. 
21. [x] [ai] `src/lib/ai/providers/openrouter.ts`: OpenRouter chat completion adapter. **Verified current endpoint, app headers, and JSON-output support before implementing.**
22. [x] [ai] `src/lib/ai/providers/ollama.ts`: POST `${ollamaUrl}/api/chat` with `format: 'json'`. No API key.
23. [x] [ai] `src/lib/ai/index.ts`: provider registry, `getProvider(id)`, `listProviders()`.
24. [x] [test] Vitest for each provider with `fetch` mocked: success, JSON parse, error mapping, abort.
25. [x] [ui] "Test connection" calls selected provider with `Reply with {"ok":true}`. Show latency and green/red dot.

## Phase 3 — Landing page

> Spec: DESIGN.md §3.

26. [scaffold] `src/lib/games/registry.ts`: exports `GameMeta[]`. Seeded with Splendor and Exploding Kittens entries pointing at `docs/games/*.md`.
27. [ui] `src/pages/index.astro`: hero strip, provider status pill, game grid driven from registry.
28. [ui] Game card component: title, description, player count, hidden-info badge, "Play" button, "View rules" link → `docPath`. Disabled "Play" when no key configured.

## Phase 4 — Shared game framework

> Spec: DESIGN.md §2.4 (GameAdapter), §2.5 (AI move flow).

29. [scaffold] `src/lib/games/shared/types.ts`: `GameAdapter<State, Move>`, `MoveRecord`, helpers.
30. [scaffold] `src/lib/games/shared/rng.ts`: seedable mulberry32. `createRng(seed: string)`.
31. [scaffold] `src/lib/games/shared/shuffle.ts`: Fisher-Yates with injected RNG.
32. [scaffold] `src/lib/games/shared/loop.ts`: generic turn loop. Handles AI invocation, retry (max 3), random-legal fallback, logging. Exposes a store/observable.
33. [test] Determinism: same seed → same shuffle. Loop unit tests with a mock adapter (mock provider returns scripted moves).

## Phase 5 — Splendor engine

> **Read [docs/games/splendor.md](docs/games/splendor.md) before starting.**

34. [engine] `src/lib/games/splendor/data/cards.ts`: 90 cards (40/30/20) per the rulebook list.
35. [engine] `src/lib/games/splendor/data/nobles.ts`: 10 nobles.
36. [engine] `src/lib/games/splendor/state.ts`: types per docs/games/splendor.md §5, `init()` factory.
37. [engine] `src/lib/games/splendor/rules.ts`: `legalMoves`, `applyMove`, `currentPlayer`, `isTerminal`, `winner`. Pure functions.
38. [test] Per docs/games/splendor.md §8 edge cases:
    - Token conservation.
    - Can't buy what you can't afford (including with gold).
    - 2-of-a-kind requires ≥4 in supply.
    - Reserve limit of 3.
    - Final-round trigger.
    - Token discard down to 10.
    - Noble auto-claim at most one per turn.
39. [ai] `src/lib/games/splendor/ai-adapter.ts`: `systemPrompt`, `serializeForAI` (compact JSON + enumerated legal moves with IDs from §6), `parseAIMove` (validates moveId + sub-decisions).
40. [test] Adapter round-trip: every legal move serialises to a unique ID, parses back to the same move.

## Phase 6 — Splendor UI

41. [ui] `src/pages/splendor.astro` mounts a Svelte/React island.
42. [ui] Board layout: tier rows (4 face-up + deck count), token supply, nobles row.
43. [ui] Player panels: tokens, bonuses, reserved cards, prestige.
44. [ui] Move composer: click-to-take tokens, click-to-buy, click-to-reserve. Legal-move highlighting.
45. [ui] Token discard modal when over the limit; gold-allocation modal when buying with mixed payment.
46. [ui] End-of-game modal: scores, winner.
47. [ui] Wire AI move flow via `loop.ts`. "Thinking…" indicator with provider/model + abort button.
48. [ui] TokenUsageBadge: per-turn and session totals.
49. [test] Playwright e2e: human-vs-AI quick game with a mocked provider returning scripted moves; assert end state.

## Phase 7 — Exploding Kittens engine

> **Read [docs/games/exploding-kittens.md](docs/games/exploding-kittens.md) before starting. Note: Nope is deferred to v1.1.**

50. [engine] `src/lib/games/exploding-kittens/data/deck.ts`: deck composition by player count per §2 and §3.
51. [engine] `src/lib/games/exploding-kittens/state.ts`: types per §6, `init()` factory (setup steps from §3).
52. [engine] `src/lib/games/exploding-kittens/rules.ts`: `legalMoves`, `applyMove`, `currentPlayer`, `isTerminal`, `winner`. **No Nope in legal moves.**
53. [test] Per §11 edge cases:
    - Defuse reinsertion at valid positions; clamp out-of-range to bottom.
    - Elimination on Exploding draw without Defuse; turn passes.
    - Attack stacking (verify rule interpretation).
    - See the Future records top-3 into `knownTopN`; cleared by Shuffle.
    - Favor (random give for AI).
    - Cat-pair steal: random card from target; target with empty hand → move not legal.
    - 3-of-a-kind named-card request.
    - 5-different combo.
54. [ai] `src/lib/games/exploding-kittens/ai-adapter.ts`: per-player state filtering per §6 (no opponent hand contents leaked), `systemPrompt`, `serializeForAI`, `parseAIMove` (including defuse-position and favor-give sub-decisions).
55. [test] Information-hiding test: serialised state for player P never contains another player's hand contents. Run a fuzz-style scan across many states.

## Phase 8 — Exploding Kittens UI

56. [ui] `src/pages/exploding-kittens.astro` mounts a Svelte/React island.
57. [ui] Table view: deck size, discard top, each player's hand size, current turn, pending-turns badge.
58. [ui] Your-hand strip: cards click to play; illegal cards greyed.
59. [ui] Draw button; defuse-and-reinsert modal with a deck-position slider; preview of position-N.
60. [ui] Favor target picker; cat-pair steal target picker; 3-of-a-kind name-a-card picker; 5-different builder.
61. [ui] Elimination banner; end-of-game modal.
62. [ui] AI thinking indicator + abort.
63. [test] Playwright e2e with mocked provider: scripted game to elimination; assert winner.

## Phase 9 — Polish

64. [ui] Onboarding tooltip on first visit: BYOK explained in three sentences.
65. [ui] Per-game "How to play" modal (rules summary, link to full doc).
66. [ui] Keyboard shortcuts: `?` opens help, `Esc` closes modals.
67. [ui] Dark/light theme toggle with system default.
68. [infra] CSP meta tag in the layout (or per Astro convention). Include only verified v1 provider endpoint origins.
69. [infra] Lighthouse run in CI (informational, not blocking).
70. [ui] Accessibility: focus rings, ARIA on modals, contrast check, alt text.
71. [ui] Error boundary around the game island with a "Copy state for bug report" button.

## Phase 10 — Stretch (post-MVP)

- [ ] Nope sub-phase for Exploding Kittens (synchronous polling window — see docs/games/exploding-kittens.md §9).
- [ ] Passphrase-encrypted key storage (Web Crypto AES-GCM).
- [ ] Seed sharing via URL hash for reproducible games.
- [ ] Move log replay UI.
- [ ] Mobile-optimised layouts.
- [ ] Difficulty presets (model + temperature + retry count).
- [ ] Smarter Favor response from AI targets (currently random in v1).
- [ ] Add a third game to validate the abstraction (Love Letter, Coup, Hanabi). Each = one new doc under `docs/games/` + one new adapter.
- [ ] Optional thin proxy worker template for users who'd rather keep the key server-side.

---

## Definition of done for v1

- Landing page lists Splendor and Exploding Kittens, each with a link to its design doc.
- Settings page lets the user enter and test credentials or local endpoint settings for every v1 provider.
- Each game playable end-to-end against AI, human as one seat, AI in the others.
- AI moves always succeed (retry + random fallback verified by e2e test).
- No keys are sent to any host other than the selected provider (verified by network inspection during e2e).
- Information-hiding test for Exploding Kittens passes.
- CI green; CSP in place; security notice visible on settings page.

