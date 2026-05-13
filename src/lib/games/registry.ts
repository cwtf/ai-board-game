import type { GameMeta } from './shared/types';

export type { GameMeta } from './shared/types';

export const games: GameMeta[] = [
  {
    id: 'splendor',
    name: 'Splendor',
    description:
      'Collect gem tokens, buy development cards, and race to prestige before the final round closes.',
    minPlayers: 2,
    maxPlayers: 4,
    hiddenInformation: false,
    estimatedAITurnTokens: 400,
    docPath: 'docs/games/splendor.md',
  },
  {
    id: 'exploding-kittens',
    name: 'Exploding Kittens',
    description:
      'Manage a hidden hand, dodge exploding draws, and outlast the table with action cards.',
    minPlayers: 2,
    maxPlayers: 5,
    hiddenInformation: true,
    estimatedAITurnTokens: 600,
    docPath: 'docs/games/exploding-kittens.md',
  },
];
