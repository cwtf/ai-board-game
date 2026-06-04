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
    docPath:
      'https://cdn.svc.asmodee.net/production-spacecowboys/uploads/2025/10/SCSPL01EN_SPLENDOR_RULES_LIGHT.pdf',
    videoPath: 'https://www.youtube.com/watch?v=dmc8vTLHsCg',
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
    videoPath: 'https://www.youtube.com/watch?v=mbGXIDYdtas',
  },
  {
    id: 'jungle-chess',
    name: '斗兽棋',
    description:
      'Cross rivers, spring traps, and race ranked animal pieces into the opposing den.',
    minPlayers: 2,
    maxPlayers: 2,
    hiddenInformation: false,
    estimatedAITurnTokens: 350,
    docPath: 'https://en.wikipedia.org/wiki/Jungle_(board_game)',
  },
  {
    id: 'chinese-chess',
    name: '象棋',
    description:
      'Cross the river, protect your general, and checkmate the opponent in traditional Chinese Chess.',
    minPlayers: 2,
    maxPlayers: 2,
    hiddenInformation: false,
    estimatedAITurnTokens: 450,
    docPath: 'https://en.wikipedia.org/wiki/Xiangqi',
  },
  {
    id: 'chess',
    name: 'Chess',
    description:
      'Control the board, protect your king, and checkmate your opponent in this classic game of strategy.',
    minPlayers: 2,
    maxPlayers: 2,
    hiddenInformation: false,
    estimatedAITurnTokens: 500,
    docPath: 'https://en.wikipedia.org/wiki/Rules_of_chess',
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
    docPath: 'https://www.explodingkittens.com/pages/how-to-play-exploding-kittens',
    videoPath: 'https://www.youtube.com/watch?v=VU2vDerX8_c',
  },
];
