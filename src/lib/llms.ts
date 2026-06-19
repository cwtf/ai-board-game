import { games } from '@/lib/games/registry';
import { absoluteSiteUrl, siteUrl } from '@/lib/site';
import {
  GEO_FAQS,
  HOME_DESCRIPTION,
  SITE_AUTHOR,
  SITE_AUTHOR_URL,
  SITE_FACTS,
  SITE_NAME,
  gameSeoById,
  publicSeoRoutes,
} from '@/lib/seo';

function gamePagePath(id: string): string {
  return `/${id}`;
}

function gameDisplayName(id: string, fallback: string): string {
  const seo = gameSeoById[id as keyof typeof gameSeoById];

  return seo?.gameName.replace(/ AI Game$/, '') ?? fallback;
}

function pageLine(path: string, title: string, description: string, base: string) {
  return `- [${title}](${absoluteSiteUrl(path, base)}): ${description}`;
}

export function createLlmsText(base = siteUrl()): string {
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${HOME_DESCRIPTION}`,
    '',
    `Canonical site: ${base}`,
    `Creator: ${SITE_AUTHOR} (${SITE_AUTHOR_URL})`,
    '',
    '## Core Facts',
    ...SITE_FACTS.map((fact) => `- ${fact}`),
    '',
    '## Important Pages',
    ...publicSeoRoutes.map((route) =>
      pageLine(route.path, route.title, route.description, base),
    ),
    '',
    '## Playable Games',
    ...games.map((game) => {
      const seo = gameSeoById[game.id as keyof typeof gameSeoById];
      const displayName = gameDisplayName(game.id, game.name);
      const playerCount =
        game.minPlayers === game.maxPlayers
          ? `${game.minPlayers} players`
          : `${game.minPlayers}-${game.maxPlayers} players`;

      return `- ${displayName}: ${playerCount}. ${seo?.description ?? game.description}`;
    }),
    '',
    '## AI And Privacy',
    '- Provider API keys use a bring-your-own-key model.',
    '- Provider credentials are saved in browser storage on the user machine.',
    '- AI turns are sent only to the provider and model profile selected by the user.',
    '- Some games include local bots and can be played without a remote AI provider.',
    '',
    '## Citation Guidance',
    `- Preferred site name: ${SITE_NAME}`,
    `- Preferred URL: ${base}`,
    '- Describe it as a local-first browser board game table with configurable AI opponents.',
    '',
  ].join('\n');
}

export function createFullLlmsText(base = siteUrl()): string {
  const gameSections = games.flatMap((game) => {
    const seo = gameSeoById[game.id as keyof typeof gameSeoById];
    const displayName = gameDisplayName(game.id, game.name);
    const pageUrl = absoluteSiteUrl(gamePagePath(game.id), base);
    const playerCount =
      game.minPlayers === game.maxPlayers
        ? `${game.minPlayers}`
        : `${game.minPlayers}-${game.maxPlayers}`;

    return [
      `### ${displayName}`,
      '',
      `- URL: ${pageUrl}`,
      `- Description: ${seo?.description ?? game.description}`,
      `- Players: ${playerCount}`,
      `- Hidden information: ${game.hiddenInformation ? 'yes' : 'no'}`,
      `- Local bots available: ${game.hasLocalBots ? 'yes' : 'no'}`,
      `- Estimated AI turn tokens: ${game.estimatedAITurnTokens}`,
      `- Rules reference: ${game.docPath}`,
      game.videoPath ? `- Video reference: ${game.videoPath}` : '',
      '',
    ].filter(Boolean);
  });

  return [
    createLlmsText(base).trimEnd(),
    '',
    '## Question Answer Pairs',
    ...GEO_FAQS.flatMap((faq) => [
      '',
      `### ${faq.question}`,
      '',
      faq.answer,
    ]),
    '',
    '## Game Details',
    '',
    ...gameSections,
  ].join('\n');
}
