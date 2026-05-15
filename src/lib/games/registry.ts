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
    hiddenInformation: true,
    estimatedAITurnTokens: 400,
    docPath: 'https://www.youtube.com/watch?v=dmc8vTLHsCg',
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
    docPath: 'https://www.youtube.com/watch?v=VU2vDerX8_c',
  },
  {
    id: 'secret-hitler',
    name: 'Secret Hitler',
    description:
      'Read the table, pass laws, investigate loyalties, and survive a tense social deduction fight.',
    minPlayers: 5,
    maxPlayers: 10,
    hiddenInformation: true,
    estimatedAITurnTokens: 700,
    docPath: 'https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf',
  },
];
