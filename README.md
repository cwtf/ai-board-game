# AI Board Game Platform

A static, browser-based board game table where you bring your own AI provider key and play against configurable AI opponents. The app is built with Astro, Svelte, TypeScript, and Tailwind CSS, with game state and provider settings kept local to the browser.

## Features

- Playable Splendor implementation with configurable AI seats.
- Playable Secret Hitler implementation with hidden roles, party cards, table chat, policy tracks, executive powers, and AI table reads.
- Bring-your-own-key provider setup stored in browser `localStorage`.
- Model profiles that can be assigned per player.
- Static Astro routes with SEO metadata, `robots.txt`, and `sitemap.xml`.
- Local-first game engines and UI; AI requests go only to the provider/model profile you select.

## Games

| Game | Status | Players |
| --- | --- | --- |
| Splendor | Playable | 2-4 |
| Secret Hitler | Playable | 5-10 |
| Exploding Kittens | Planned route/spec | 2-5 |

## Screenshots

### Splendor

![Splendor game screen](public/screenshots/splendor.png)

### Secret Hitler

![Secret Hitler game screen](public/screenshots/secret-hitler.png)

## Quickstart

Requires Node.js `>=22.12.0`.

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

Open `/settings` to configure providers and save model profiles. Keys and profile selections are stored locally in your browser under `localStorage` key `byok.keys.v1`.

Supported providers include OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Mistral, Together, Kimi, GLM, Qwen, Llama-compatible endpoints, OpenRouter, and Ollama.

## Environment

Copy `.env.example` and set your production site URL:

```sh
PUBLIC_SITE_URL=https://your-domain.example
```

`PUBLIC_SITE_URL` is used for canonical URLs, Open Graph URLs, `robots.txt`, and `sitemap.xml`.

## Build And Deploy

Build locally:

```sh
npm run build
```

For Cloudflare Pages, use:

```sh
npm run build
npx wrangler pages deploy dist --project-name=ai-board-game
```

In the Cloudflare dashboard, the build command is `npm run build` and the output directory is `dist`.

## Docs

- Shared architecture: [docs/DESIGN.md](docs/DESIGN.md)
- Implementation plan: [docs/TODO.md](docs/TODO.md)
- Splendor spec: [docs/games/splendor.md](docs/games/splendor.md)
- Secret Hitler AI notes: [docs/games/secret-hitler.md](docs/games/secret-hitler.md)
- Exploding Kittens spec: [docs/games/exploding-kittens.md](docs/games/exploding-kittens.md)
