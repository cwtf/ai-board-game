import type { MoveRecord } from '@/lib/games/shared/types';
import { createRng } from '@/lib/games/shared/rng';
import { shuffle } from '@/lib/games/shared/shuffle';

export type CardKind =
  | 'defuse'
  | 'exploding'
  | 'attack'
  | 'skip'
  | 'favor'
  | 'shuffle'
  | 'see_future'
  | 'nope'
  | 'cat_tacocat'
  | 'cat_potato'
  | 'cat_cattermelon'
  | 'cat_beard'
  | 'cat_rainbow';

export const ALL_CAT_KINDS: readonly CardKind[] = [
  'cat_tacocat',
  'cat_potato',
  'cat_cattermelon',
  'cat_beard',
  'cat_rainbow',
] as const;

export const ALL_NAMED_KINDS: readonly CardKind[] = [
  'defuse',
  'attack',
  'skip',
  'favor',
  'shuffle',
  'see_future',
  'nope',
  'cat_tacocat',
  'cat_potato',
  'cat_cattermelon',
  'cat_beard',
  'cat_rainbow',
] as const;

export const CARD_LABELS: Record<CardKind, string> = {
  defuse: 'Defuse',
  exploding: 'Exploding Kitten',
  attack: 'Attack',
  skip: 'Skip',
  favor: 'Favor',
  shuffle: 'Shuffle',
  see_future: 'See the Future',
  nope: 'Nope',
  cat_tacocat: 'Tacocat',
  cat_potato: 'Hairy Potato Cat',
  cat_cattermelon: 'Cattermelon',
  cat_beard: 'Beard Cat',
  cat_rainbow: 'Rainbow Cat',
};

export const CARD_COLORS: Record<CardKind, string> = {
  defuse: '#16a34a',
  exploding: '#dc2626',
  attack: '#ea580c',
  skip: '#0891b2',
  favor: '#9333ea',
  shuffle: '#2563eb',
  see_future: '#7c3aed',
  nope: '#4b5563',
  cat_tacocat: '#db2777',
  cat_potato: '#ca8a04',
  cat_cattermelon: '#16a34a',
  cat_beard: '#1d4ed8',
  cat_rainbow: '#be185d',
};

export interface EKPlayer {
  hand: CardKind[];
  alive: boolean;
}

export interface EKState {
  seed: string;
  players: EKPlayer[];
  deck: CardKind[];
  discard: CardKind[];
  current: number;
  pendingTurns: number;
  knownTopN: Record<number, CardKind[]>;
  pendingFavor: { from: number; to: number } | null;
  pendingDefuse: boolean;
  pendingNope: {
    action: EKMove;
    byPlayer: number;
    waitingFor: number[];
  } | null;
  turn: number;
  log: MoveRecord<EKMove>[];
}

interface BaseMove {
  id: string;
}

export type EKMove =
  | (BaseMove & { kind: 'play_single'; card: CardKind })
  | (BaseMove & { kind: 'play_favor'; targetIndex: number })
  | (BaseMove & { kind: 'play_cat_pair'; cardKind: CardKind; targetIndex: number })
  | (BaseMove & {
      kind: 'play_three_kind';
      cardKind: CardKind;
      targetIndex: number;
      namedCard: CardKind;
    })
  | (BaseMove & { kind: 'play_five_diff'; cards: CardKind[]; discardPick: CardKind })
  | (BaseMove & { kind: 'draw' })
  | (BaseMove & { kind: 'defuse'; insertAt: number })
  | (BaseMove & { kind: 'give_favor'; card: CardKind })
  | (BaseMove & { kind: 'nope' })
  | (BaseMove & { kind: 'pass_nope' });

export function init(opts: {
  seed?: string;
  playerCount: number;
  aiPlayerIndices?: number[];
}): EKState {
  if (opts.playerCount < 2 || opts.playerCount > 5) {
    throw new RangeError('Exploding Kittens supports 2–5 players.');
  }

  const seed =
    opts.seed ??
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'exploding-kittens');

  const base: CardKind[] = [
    ...Array<CardKind>(4).fill('attack'),
    ...Array<CardKind>(4).fill('skip'),
    ...Array<CardKind>(4).fill('favor'),
    ...Array<CardKind>(4).fill('shuffle'),
    ...Array<CardKind>(5).fill('see_future'),
    ...Array<CardKind>(5).fill('nope'),
    ...Array<CardKind>(4).fill('cat_tacocat'),
    ...Array<CardKind>(4).fill('cat_potato'),
    ...Array<CardKind>(4).fill('cat_cattermelon'),
    ...Array<CardKind>(4).fill('cat_beard'),
    ...Array<CardKind>(4).fill('cat_rainbow'),
  ];

  const shuffledBase = shuffle(base, createRng(`${seed}:base`));

  const players: EKPlayer[] = Array.from({ length: opts.playerCount }, () => ({
    hand: [] as CardKind[],
    alive: true,
  }));

  // Deal 7 cards to each player (round-robin)
  let idx = 0;
  for (let c = 0; c < 7; c++) {
    for (let p = 0; p < opts.playerCount; p++) {
      players[p]!.hand.push(shuffledBase[idx++]!);
    }
  }

  // Give each player exactly 1 defuse (hand is now 8 cards)
  for (let p = 0; p < opts.playerCount; p++) {
    players[p]!.hand.push('defuse');
  }

  // Remaining base cards + extra defuses + (playerCount - 1) exploding kittens → deck
  const remaining: CardKind[] = [...shuffledBase.slice(idx)];
  const extraDefuses = 6 - opts.playerCount;
  for (let i = 0; i < extraDefuses; i++) remaining.push('defuse');
  for (let i = 0; i < opts.playerCount - 1; i++) remaining.push('exploding');

  const finalDeck = shuffle(remaining, createRng(`${seed}:deck`));

  return {
    seed,
    players,
    deck: finalDeck,
    discard: [],
    current: 0,
    pendingTurns: 1,
    knownTopN: {},
    pendingFavor: null,
    pendingDefuse: false,
    pendingNope: null,
    turn: 0,
    log: [],
  };
}
