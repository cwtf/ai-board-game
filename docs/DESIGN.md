# AI Board Game Platform — Design Doc

A static-site repository of browser-playable board games where the player supplies their own AI provider API key (BYOK) and plays against AI opponents. Each game is an independent module sharing a common shell, AI provider abstraction, and UI primitives.

This document covers **shared infrastructure**. Game-specific design lives in per-game docs:

- [Splendor](docs/games/splendor.md)
- [Exploding Kittens](docs/games/exploding-kittens.md)
- [Secret Hitler](docs/games/secret-hitler.md)

Adding a new game means adding a doc under `docs/games/`, implementing one adapter under `src/lib/games/<id>/`, and registering it in `src/lib/games/registry.ts`. The main doc shouldn't need edits.

## 1. Goals & Non-Goals

### Goals
- Zero-backend BYOK: API keys stay client-side and are sent only to the AI provider the user selects.
- Pluggable AI providers: OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Mistral, Together, Kimi, GLM, Qwen, Llama, OpenRouter, and Ollama.
- Game-agnostic architecture — adding a new game = implementing one interface and adding a route.
- Desktop-first; usable on mobile but not optimised for it.

### Non-Goals
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
├── docs/
│   ├── DESIGN.md
│   └── games/
│       ├── splendor.md
│       ├── exploding-kittens.md
│       └── secret-hitler.md
├── public/
│   └── assets/                          # Card art, icons, fonts (per-game subdirs)
├── src/
│   ├── pages/
│   │   ├── index.astro                  # Landing: game selector
│   │   ├── about.astro
│   │   ├── settings.astro               # BYOK key management
│   │   ├── splendor.astro
│   │   ├── exploding-kittens.astro
│   │   ├── secret-hitler.astro
│   │   ├── chess.astro
│   │   ├── chinese-chess.astro
│   │   └── jungle-chess.astro
│   ├── components/
│   │   ├── shell/                       # Header, nav, modals, toast
│   │   ├── ai/                          # KeyManager, ProviderPicker, TokenUsageBadge
│   │   └── games/
│   │       ├── splendor/
│   │       ├── exploding-kittens/
│   │       ├── secret-hitler/
│   │       ├── chess/
│   │       ├── chinese-chess/
│   │       └── jungle-chess/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   │   ├── openai.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── google.ts
│   │   │   │   ├── deepseek.ts
│   │   │   │   ├── groq.ts
│   │   │   │   ├── mistral.ts
│   │   │   │   ├── together.ts
│   │   │   │   ├── kimi.ts
│   │   │   │   ├── glm.ts
│   │   │   │   ├── qwen.ts
│   │   │   │   ├── llama.ts
│   │   │   │   ├── openrouter.ts
│   │   │   │   └── ollama.ts
│   │   │   ├── index.ts                 # Registry + dispatch
│   │   │   └── types.ts                 # Shared types
│   │   ├── storage/
│   │   │   └── keys.ts                  # localStorage wrappers
│   │   └── games/
│   │       ├── shared/
│   │       │   ├── types.ts             # GameAdapter<State, Move> + loop types
│   │       │   ├── loop.ts              # Generic turn loop
│   │       │   ├── ai-seats.ts          # Seat selection normalisation helpers
│   │       │   ├── seed-url.ts          # URL hash ↔ seed helpers
│   │       │   ├── rng.ts               # Seedable RNG
│   │       │   └── shuffle.ts
│   │       ├── registry.ts              # GameMeta[] consumed by landing page
│   │       ├── splendor/
│   │       ├── exploding-kittens/
│   │       ├── secret-hitler/
│   │       ├── chess/
│   │       ├── chinese-chess/
│   │       └── jungle-chess/
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
  | 'groq'
  | 'mistral'
  | 'together'
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
  apiKey?: string;           // omitted for ollama and other keyless providers
  endpointUrl?: string;      // for llama / ollama / custom endpoints
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
  raw?: unknown;
}

export interface ListModelsParams {
  apiKey?: string;
  endpointUrl?: string;
  signal?: AbortSignal;
}

export interface AIProvider {
  id: ProviderId;
  label: string;
  platformUrl?: string;
  defaultModel: string;
  availableModels: string[];
  requiresApiKey: boolean;
  requiresEndpointUrl?: boolean;
  endpointLabel?: string;
  defaultEndpointUrl?: string;
  listModels?(params?: ListModelsParams): Promise<string[]>;
  complete(params: CompleteParams): Promise<CompleteResult>;
}
```

Each provider in `src/lib/ai/providers/*.ts` exports a default `AIProvider`. The registry in `src/lib/ai/index.ts` exposes `getProvider(id)` and `listProviders()`.

#### Game adapter

```ts
// src/lib/games/shared/types.ts
export interface GameMeta {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  hiddenInformation: boolean;
  estimatedAITurnTokens: number;
  docPath: string;
  videoPath?: string;
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
  prepareAIMove?(state: State, player: number, move: Move): Move;
  parseAIMove(response: string, legalMoves: Move[]):
    | { ok: true; move: Move }
    | { ok: false; error: string };
}

export type MoveSource = 'human' | 'ai' | 'fallback';

export interface MoveRecord<Move = unknown> {
  turn: number;
  player: number;
  move: Move;
  source: MoveSource;
  providerId?: ProviderId;
  model?: string;
  usage?: TokenUsage;
  attempts: number;
  error?: string;
  at: string; // ISO timestamp
}

// AI player configs — either a cloud provider or a local bot
export interface ProviderAIPlayerConfig {
  kind?: 'provider';
  provider: AIProvider;
  model: string;
  apiKey?: string;
  endpointUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LocalAIPlayerConfig<State = unknown, Move = unknown> {
  kind: 'local';
  label: string;
  model: string;
  chooseMove(opts: {
    state: State;
    player: number;
    legalMoves: Move[];
    signal?: AbortSignal;
  }): Move | Promise<Move>;
}

export type AIPlayerConfig<State = unknown, Move = unknown> =
  | ProviderAIPlayerConfig
  | LocalAIPlayerConfig<State, Move>;
```

Concrete `State` and `Move` types are defined in each game's module and described in that game's design doc.

### 2.5 AI move flow

```
1. Game loop detects current player is AI.
2. legalMoves = adapter.legalMoves(state, current)
3. If LocalAIPlayerConfig:
     move = ai.chooseMove({ state, current, legalMoves, signal })
     move = adapter.prepareAIMove?.(state, current, move) ?? move
     validate with applyMove; fallback to random legal if invalid.
4. If ProviderAIPlayerConfig:
     payload = adapter.serializeForAI(state, current, legalMoves)
     result = provider.complete({
       system: adapter.systemPrompt(),
       messages: [{ role: 'user', content: payload }],
       responseFormat: 'json', ...
     })
     parsed = adapter.parseAIMove(result.text, legalMoves)
     prepared = adapter.prepareAIMove?.(state, current, parsed.move) ?? parsed.move
     validate with applyMove
     if invalid/failing: retry with the bad response echoed as an assistant turn
                         + a user turn explaining the error. Up to N=3 retries.
     if still failing: pick a random legal move, surface a non-blocking warning.
5. state = adapter.applyMove(state, move)
6. log usage to TokenUsageBadge.
```

State is updated via an immutable reducer. Game UI subscribes to a store and re-renders. The loop lives in `src/lib/games/shared/loop.ts` and is fully game-agnostic.

#### Loop API

```ts
// src/lib/games/shared/loop.ts
export interface GameLoop<State, Move> {
  subscribe(subscriber: (snapshot: LoopSnapshot<State, Move>) => void): () => void;
  getSnapshot(): LoopSnapshot<State, Move>;
  setAIPlayers(aiPlayers: GameLoopOptions<State, Move>['aiPlayers']): void;
  clearWarning(): void;
  playHumanMove(move: Move): void;
  undo(): boolean;                           // walks back to last human move
  step(signal?: AbortSignal): Promise<boolean>;
  runUntilBlocked(signal?: AbortSignal): Promise<void>;
}
```

`undo()` walks back through trailing AI moves and removes the last human move plus all subsequent AI moves, then replays from the initial state.

### 2.6 BYOK key management

#### Storage

- `localStorage` key: `byok.keys.v1`
- Shape:
  ```ts
  type StoredKeys = Partial<Record<ProviderId, string>> & {
    llamaUrl?: string;
    ollamaUrl?: string;
    selectedProvider?: ProviderId;
    selectedModel?: Partial<Record<ProviderId, string>>;
    selectedProfileId?: string;
    modelProfiles?: ProviderModelProfile[];
    deletedProviders?: ProviderId[];
  };

  interface ProviderModelProfile {
    id: string;
    label: string;
    provider: ProviderId;
    model: string;
  }
  ```
- `modelProfiles` lets users save named presets (e.g. "fast cheap" or "quality run") and switch between them.
- `deletedProviders` records providers explicitly cleared so they don't re-appear after an app update adds them.
- Settings UI: view (masked), edit, clear. Per-provider key + model.

#### Security model (surfaced in UI)

- Keys live in `localStorage`, readable by any JS executing on the origin. Threat model: XSS.
- Mitigations:
  - Strict CSP via `<meta http-equiv="Content-Security-Policy">`:
    `default-src 'self'; script-src 'self'; connect-src 'self' <verified provider origins>; img-src 'self' data:; style-src 'self' 'unsafe-inline';`
  - No third-party scripts. No analytics, no external font CDNs.
  - Dependabot enabled.
  - `npm audit` gate in CI.
- Settings page contains a plain-language notice:
  > Your API key is stored only in your browser. It is sent only to the AI provider you select, over HTTPS. Anyone with access to this device or browser profile can read it. Clear the key when you're done if this is a shared machine.

#### CORS and direct-from-browser calls

- **OpenAI**: standard CORS on `https://api.openai.com`.
- **Anthropic**: requires header `anthropic-dangerous-direct-browser-access: true`. Provider module sets this.
- **Google Gemini**: REST endpoint accepts API key via `x-goog-api-key` header. Direct browser calls work.
- **Groq / Mistral / Together / DeepSeek / Kimi / GLM / Qwen / OpenRouter**: adapter modules normalise each provider's chat-completion shape to the shared interface.
- **Llama**: user-supplied endpoint URL stored in `llamaUrl`. OpenAI-compatible API assumed.
- **Ollama**: user-run, localhost. Endpoint stored in `ollamaUrl`. CORS depends on user config; document the `OLLAMA_ORIGINS` env var as a setup step.

All provider modules normalise to the `AIProvider` interface so game code never sees these differences.

### 2.7 Seat management

`src/lib/games/shared/ai-seats.ts` provides helpers used by game setup UIs:

- `normalizeSeatSelections` — given a player count and a map of seat → profile/bot ID, ensures every seat has a valid assignment and returns whether anything changed.
- `aiControlledSeatIndexes` — returns the seat indices that are AI-controlled (non-human).
- `HUMAN_SEAT_ID = '__human__'` — the sentinel value for a human-occupied seat.

## 3. Landing page

- Hero strip: short value-prop ("Play board games against the AI you bring.")
- Status pill: "Provider: not configured" → links to /settings. Or "Provider: Anthropic (claude-x-y)".
- Game grid: one card per game, data-driven from `src/lib/games/registry.ts`. Each card shows:
  - Title
  - 1-line description
  - Player count (e.g. "2-4 players")
  - Hidden-info badge
  - "Play" button → routes to `/<game-id>`
  - "View rules" link (external, from `docPath`)
  - Optional "Watch" link (from `videoPath`)
- Footer: link to GitHub repo, link to settings, version.

Disabled state: if no key is configured, "Play" buttons are disabled with a tooltip "Set up your AI key first".

## 4. Project hygiene

- All randomness routes through a seeded RNG in `src/lib/games/shared/rng.ts`. Seed exposed in URL hash via `src/lib/games/shared/seed-url.ts` for reproducibility (`/splendor#seed=abc123`).
- Move log stored in state for post-game review (no UI currently; useful for debugging).
- `pnpm` recommended over `npm` for monorepo hygiene if more games arrive later.
- License: MIT for code.

## 5. Known risks and open questions

| Risk | Mitigation |
|---|---|
| AI plays poorly at hidden-info games | Per-game simplifications noted in each game's doc; surface a difficulty badge on the game card. |
| User's key leaked via XSS | Strict CSP, no third-party JS, dependency audit in CI. |
| Provider API change breaks a module | Each provider isolated; integration test per provider. |
| Cost surprise for the user | Show token usage per turn and total per session. Default to cheaper models. |

## 6. Adding a new game

The standard process for any new game:

1. Write `docs/games/<id>.md` covering: components, turn structure, end conditions, state types, move encoding for AI, AI difficulty notes, v1 simplifications.
2. Create `src/lib/games/<id>/` with `state.ts`, `rules.ts`, `ai-adapter.ts`, and any `data/`. Optionally add a `bot.ts` for a `LocalAIPlayerConfig`.
3. Write unit tests for the rules under `tests/<id>/`.
4. Add UI under `src/components/games/<id>/` and a page at `src/pages/<id>.astro`.
5. Register `GameMeta` in `src/lib/games/registry.ts`.

## 7. Games

| Game | Doc | Status |
|---|---|---|
| Splendor | [docs/games/splendor.md](docs/games/splendor.md) | Implemented |
| Exploding Kittens | [docs/games/exploding-kittens.md](docs/games/exploding-kittens.md) | TODO |
| Secret Hitler | [docs/games/secret-hitler.md](docs/games/secret-hitler.md) | Implemented |
| Chess | — | Implemented (local bot + provider AI) |
| 象棋 (Chinese Chess) | — | Implemented (local bot + provider AI) |
| 斗兽棋 (Jungle Chess) | — | Implemented (local bot + provider AI) |
