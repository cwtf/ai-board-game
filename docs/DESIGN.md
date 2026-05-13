# AI Board Game Platform — Design Doc

A static-site repository of browser-playable board games where the player supplies their own AI provider API key (BYOK) and plays against AI opponents. Each game is an independent module sharing a common shell, AI provider abstraction, and UI primitives.

This document covers **shared infrastructure**. Game-specific design lives in per-game docs:

- [Splendor](docs/games/splendor.md)
- [Exploding Kittens](docs/games/exploding-kittens.md)

Adding a new game means adding a doc under `docs/games/`, implementing one adapter under `src/lib/games/<id>/`, and registering it in `src/lib/games/registry.ts`. The main doc shouldn't need edits.

## 1. Goals & Non-Goals

### Goals
- Zero-backend BYOK: API keys stay client-side and are sent only to the AI provider the user selects.
- Pluggable AI providers: OpenAI, Anthropic, Google Gemini, DeepSeek, Kimi, GLM, Qwen, Llama, OpenRouter, and Ollama.
- Game-agnostic architecture — adding a new game = implementing one interface and adding a route.
- Two playable games at v1: Splendor, Exploding Kittens.
- Desktop-first; usable on mobile but not optimised for it in v1.

### Non-Goals (v1)
- Human-vs-human multiplayer over network.
- Accounts, server-side persistence, leaderboards.
- Spectator/replay system (state log exists internally but no replay UI).
- Mobile-first responsive design.

## 2. Architecture

### 2.1 High-level

```
Browser
 ├── Static site (HTML/CSS/JS bundles, served locally or from CDN)
 ├── Game engine (TypeScript, in-browser)
 ├── AI adapter (TypeScript, in-browser)
 └── direct HTTPS → chosen AI provider or local endpoint
```

No server-side code, no proxy. The user's key never transits any infrastructure operated by this project.

### 2.2 Recommended stack

| Layer | Choice | Reason |
|---|---|---|
| Site framework | **Astro** with interactive islands | File-based routing maps to game pages; static output; islands keep landing page JS-light |
| UI framework (islands) | **Svelte** (preferred) or React | Either works; Svelte is lighter and has good store ergonomics for game state |
| Language | TypeScript (strict) | Catches game-rule bugs early |
| Styling | Tailwind CSS | Easy theming per game |
| Build | Vite (via Astro) | Default |
| Tests | Vitest (unit, rules engines), Playwright (e2e) | |
| Hosting | Local dev server is sufficient for personal use; Cloudflare Pages or GitHub Pages if shared | |
| CI | GitHub Actions: lint, typecheck, unit tests on PR | |

Alternatives if Astro isn't preferred: SvelteKit (with static adapter), or Next.js with `output: 'export'`. The game engine and AI adapter modules are framework-agnostic.

### 2.3 Repository layout

```
/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── tailwind.config.cjs
├── README.md
├── DESIGN.md
├── TODO.md
├── docs/
│   └── games/
│       ├── splendor.md
│       └── exploding-kittens.md
├── public/
│   └── assets/                          # Card art, icons, fonts (per-game subdirs)
├── src/
│   ├── pages/
│   │   ├── index.astro                  # Landing: game selector
│   │   ├── settings.astro               # BYOK key management
│   │   ├── splendor.astro               # Hosts the game island
│   │   └── exploding-kittens.astro
│   ├── components/
│   │   ├── shell/                       # Header, nav, modals, toast
│   │   ├── ai/                          # KeyManager, ProviderPicker, TokenUsageBadge
│   │   └── games/
│   │       ├── splendor/                # Svelte/React components for the board, hand, etc.
│   │       └── exploding-kittens/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   │   ├── openai.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── google.ts
│   │   │   │   ├── deepseek.ts
│   │   │   │   ├── kimi.ts
│   │   │   │   ├── glm.ts
│   │   │   │   ├── qwen.ts
│   │   │   │   ├── llama.ts
│   │   │   │   ├── openrouter.ts
│   │   │   │   └── ollama.ts
│   │   │   ├── index.ts                 # Registry + dispatch
│   │   │   ├── types.ts                 # Shared types
│   │   │   └── prompt.ts                # Prompt helpers
│   │   ├── storage/
│   │   │   ├── keys.ts                  # localStorage wrappers
│   │   │   └── crypto.ts                # Optional Web Crypto AES-GCM (v1.1)
│   │   └── games/
│   │       ├── shared/
│   │       │   ├── types.ts             # GameAdapter<State, Move> interface
│   │       │   ├── rng.ts               # Seedable RNG
│   │       │   ├── shuffle.ts
│   │       │   └── loop.ts              # Generic turn loop
│   │       ├── registry.ts              # GameMeta[] consumed by landing page
│   │       ├── splendor/
│   │       └── exploding-kittens/
│   └── styles/
└── tests/
    ├── ai/
    ├── splendor/
    └── exploding-kittens/
```

### 2.4 Core interfaces

#### AI provider

```ts
// src/lib/ai/types.ts
export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'kimi'
  | 'glm'
  | 'qwen'
  | 'llama'
  | 'openrouter'
  | 'ollama';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface CompleteParams {
  apiKey: string;          // ignored for ollama
  model: string;
  system: string;
  messages: ChatMessage[];
  responseFormat?: 'text' | 'json';
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface CompleteResult {
  text: string;
  usage?: TokenUsage;
  raw?: unknown;           // for debugging
}

export interface AIProvider {
  id: ProviderId;
  label: string;
  defaultModel: string;
  availableModels: string[];
  complete(params: CompleteParams): Promise<CompleteResult>;
}
```

Each provider in `src/lib/ai/providers/*.ts` exports a default `AIProvider`. The registry in `src/lib/ai/index.ts` exposes `getProvider(id)` and `listProviders()`.

#### Game adapter

```ts
// src/lib/games/shared/types.ts
export interface GameMeta {
  id: string;              // 'splendor' | 'exploding-kittens'
  name: string;            // Display name
  description: string;
  minPlayers: number;
  maxPlayers: number;
  hiddenInformation: boolean;
  estimatedAITurnTokens: number;   // For cost display
  docPath: string;         // e.g. 'docs/games/splendor.md'
}

export interface GameAdapter<State, Move> {
  meta: GameMeta;
  init(opts: { seed?: string; playerCount: number; aiPlayerIndices: number[] }): State;
  legalMoves(state: State, player: number): Move[];
  applyMove(state: State, move: Move): State;
  currentPlayer(state: State): number;
  isTerminal(state: State): boolean;
  winner(state: State): number | null;

  // AI integration
  systemPrompt(): string;
  serializeForAI(state: State, player: number, legalMoves: Move[]): string;
  parseAIMove(response: string, legalMoves: Move[]):
    | { ok: true; move: Move }
    | { ok: false; error: string };
}
```

Concrete `State` and `Move` types are defined in each game's module and described in that game's design doc.

### 2.5 AI move flow

```
1. Game loop detects current player is AI.
2. legalMoves = adapter.legalMoves(state, current)
3. payload = adapter.serializeForAI(state, current, legalMoves)
4. result = provider.complete({
     system: adapter.systemPrompt(),
     messages: [{ role: 'user', content: payload }],
     responseFormat: 'json',
     ...
   })
5. parsed = adapter.parseAIMove(result.text, legalMoves)
6. if (!parsed.ok) retry with the same prompt + an assistant turn echoing the bad response
                   + a user turn explaining the error. Up to N=3 retries.
7. if still failing: pick a random legal move, surface a non-blocking warning.
8. state = adapter.applyMove(state, parsed.move)
9. log usage to TokenUsageBadge.
```

State is updated via an immutable reducer. Game UI subscribes to a store and re-renders. The loop lives in `src/lib/games/shared/loop.ts` and is fully game-agnostic.

### 2.6 BYOK key management

#### Storage

- `localStorage` key: `byok.keys.v1`
- Shape:
  ```ts
  type StoredKeys = {
    openai?: string;
    anthropic?: string;
    google?: string;
    deepseek?: string;
    kimi?: string;
    glm?: string;
    qwen?: string;
    llama?: string;
    openrouter?: string;
    llamaUrl?: string;           // local or hosted Llama-compatible endpoint
    ollamaUrl?: string;          // e.g. http://localhost:11434
    selectedProvider?: ProviderId;
    selectedModel?: Record<ProviderId, string>;
  };
  ```
- Settings UI: view (masked), edit, clear. Per-provider key + model.
- Optional **passphrase mode (v1.1)**: encrypt the value at rest using Web Crypto (AES-GCM, PBKDF2 to derive key from passphrase). User enters passphrase per session. Implementation in `src/lib/storage/crypto.ts`.

#### Security model (surfaced in UI)

- Keys live in `localStorage`, readable by any JS executing on the origin. Threat model: XSS.
- Mitigations:
  - Strict CSP via `<meta http-equiv="Content-Security-Policy">`:
    `default-src 'self'; script-src 'self'; connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com http://localhost:11434; img-src 'self' data:; style-src 'self' 'unsafe-inline';`
    Expand `connect-src` during Phase 2 to include only the verified endpoint origins for DeepSeek, Kimi, GLM, Qwen, Llama, and OpenRouter.
  - No third-party scripts. No analytics, no external font CDNs.
  - Dependabot enabled.
  - `npm audit` gate in CI.
- Settings page contains a plain-language notice:
  > Your API key is stored only in your browser. It is sent only to the AI provider you select, over HTTPS. Anyone with access to this device or browser profile can read it. Clear the key when you're done if this is a shared machine.

#### CORS and direct-from-browser calls

- **OpenAI**: standard CORS on `https://api.openai.com`.
- **Anthropic**: requires header `anthropic-dangerous-direct-browser-access: true`. Provider module sets this. Verify current docs before implementing — header name has historically been the subject of revision.
- **Google Gemini**: REST endpoint `https://generativelanguage.googleapis.com/v1beta/...` accepts API key via `x-goog-api-key` header. Direct browser calls work.
- **DeepSeek, Kimi, GLM, Qwen, Llama, OpenRouter**: adapter modules normalise each provider's chat-completion shape to the shared interface. Verify current endpoints, browser CORS, required headers, and JSON-output support in Phase 2 before implementing each module.
- **Ollama**: user-run, localhost. CORS depends on user config; document the `OLLAMA_ORIGINS` env var as a setup step.

All provider modules normalise to the `AIProvider` interface so game code never sees these differences.

## 3. Landing page

- Hero strip: short value-prop ("Play board games against the AI you bring.")
- Status pill: "Provider: not configured" → links to /settings. Or "Provider: Anthropic (claude-x-y)".
- Game grid: one card per game, data-driven from `src/lib/games/registry.ts`. Each card shows:
  - Title
  - 1-line description
  - Player count (e.g. "2-4 players")
  - Hidden-info badge
  - "Play" button → routes to `/<game-id>`
  - "View rules" link → opens the game's design doc in a new tab
- Footer: link to GitHub repo, link to settings, version.

Disabled state: if no key is configured, "Play" buttons are disabled with a tooltip "Set up your AI key first".

## 4. Project hygiene

- All randomness routes through a seeded RNG in `src/lib/games/shared/rng.ts`. Seed exposed in URL hash for reproducibility (`/splendor#seed=abc123`).
- Move log stored in state for post-game review (no UI in v1; useful for debugging).
- `pnpm` recommended over `npm` for monorepo hygiene if more games arrive later.
- License: MIT for code.

## 5. Known risks and open questions

| Risk | Mitigation |
|---|---|
| AI plays poorly at hidden-info games | Per-game v1 simplifications (see Exploding Kittens doc); surface a "AI difficulty: hard for current models" badge on the game card. |
| User's key leaked via XSS | Strict CSP, no third-party JS, dependency audit in CI, optional passphrase encryption. |
| Provider API change breaks a module | Each provider isolated; integration test per provider. |
| Cost surprise for the user | Show token usage per turn and total per session. Default to cheaper models. |

Phase 0 decisions are recorded in [DECISIONS.md](DECISIONS.md):
1. Include OpenAI, Anthropic, Google Gemini, DeepSeek, Kimi, GLM, Qwen, Llama, OpenRouter, and Ollama support in v1.
2. Defer passphrase encryption to v1.1; v1 ships plain `localStorage` with the security notice.
3. Target localhost-only hosting for v1.

## 6. Adding a new game

The standard process for any new game:

1. Write `docs/games/<id>.md` covering: components, turn structure, end conditions, state types, move encoding for AI, AI difficulty notes, v1 simplifications.
2. Create `src/lib/games/<id>/` with `state.ts`, `rules.ts`, `ai-adapter.ts`, and any `data/`.
3. Write unit tests for the rules under `tests/<id>/`.
4. Add UI under `src/components/games/<id>/` and a page at `src/pages/<id>.astro`.
5. Register `GameMeta` in `src/lib/games/registry.ts`.
6. Add an entry to the "Games" section below.

## 7. Games

| Game | Doc | Status |
|---|---|---|
| Splendor | [docs/games/splendor.md](docs/games/splendor.md) | v1 target |
| Exploding Kittens | [docs/games/exploding-kittens.md](docs/games/exploding-kittens.md) | v1 target |
