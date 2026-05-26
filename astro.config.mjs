// @ts-check
import { defineConfig } from 'astro/config';
import process from 'node:process';
import { URL } from 'node:url';

import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

const defaultSiteUrl = 'https://aiboard.games';
const rawSiteUrl = process.env.PUBLIC_SITE_URL ?? defaultSiteUrl;
const siteUrl = /^https?:\/\//i.test(rawSiteUrl)
  ? rawSiteUrl
  : `https://${rawSiteUrl}`;

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: new URL(siteUrl).origin,
  integrations: [svelte()],

  vite: {
    plugins: [tailwindcss()],
  },
});
