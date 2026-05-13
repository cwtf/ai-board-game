# AI Board Game Platform

A static, browser-only board game platform where players bring their own AI provider key and play against AI opponents. The v1 target is a localhost-first Astro app with Svelte islands, Tailwind CSS, BYOK provider settings, and playable Splendor and Exploding Kittens implementations.

## Quickstart

```sh
npm install
npm run dev
```

The local dev server starts at `http://localhost:4321`.

Useful checks:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

## BYOK Setup

Provider key management will be added in Phase 2. v1 stores keys only in the browser under `localStorage` key `byok.keys.v1`; passphrase encryption is deferred to v1.1.

Planned v1 providers: OpenAI, Anthropic, Google Gemini, DeepSeek, Kimi, GLM, Qwen, Llama, OpenRouter, and Ollama.

## Screenshot

Screenshot placeholder: add the first playable landing page capture here after Phase 3.

## Docs

- Shared architecture: [docs/DESIGN.md](docs/DESIGN.md)
- Implementation plan: [docs/TODO.md](docs/TODO.md)
- Phase decisions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Splendor spec: [docs/games/splendor.md](docs/games/splendor.md)
- Exploding Kittens spec: [docs/games/exploding-kittens.md](docs/games/exploding-kittens.md)
