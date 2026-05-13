import type { MoveRecord } from '@/lib/games/shared/types';
import { createRng } from '@/lib/games/shared/rng';
import { shuffle } from '@/lib/games/shared/shuffle';
import { ALL_CARDS } from './data/cards';
import { NOBLES } from './data/nobles';

export const GEMS = ['emerald', 'sapphire', 'ruby', 'diamond', 'onyx'] as const;
export const GEM_OR_GOLD = [...GEMS, 'gold'] as const;

export type Gem = (typeof GEMS)[number];
export type GemOrGold = (typeof GEM_OR_GOLD)[number];
export type Tier = 1 | 2 | 3;
export type GemCost = Partial<Record<Gem, number>>;
export type TokenSet = Record<GemOrGold, number>;
export type BonusSet = Record<Gem, number>;

export interface Card {
  id: string;
  tier: Tier;
  cost: GemCost;
  bonus: Gem;
  prestige: number;
}

export interface Noble {
  id: string;
  cost: GemCost;
  prestige: number;
}

export interface PlayerState {
  tokens: TokenSet;
  bonuses: BonusSet;
  cards: Card[];
  reserved: Card[];
  nobles: Noble[];
  prestige: number;
}

export interface SplendorState {
  seed: string;
  players: PlayerState[];
  current: number;
  tokenPool: TokenSet;
  board: {
    tier1: (Card | null)[];
    tier2: (Card | null)[];
    tier3: (Card | null)[];
  };
  decks: { tier1: Card[]; tier2: Card[]; tier3: Card[] };
  noblesInPlay: Noble[];
  turn: number;
  finalRoundTriggered: boolean;
  finalRoundStartedAt: number | null;
  log: MoveRecord<SplendorMove>[];
}

interface BaseMove {
  id: string;
  discard?: Partial<Record<GemOrGold, number>>;
  noble?: string;
}

export type SplendorMove =
  | (BaseMove & { kind: 'take'; gems: Gem[] })
  | (BaseMove & {
      kind: 'reserve';
      source: 'board';
      tier: Tier;
      cardId: string;
    })
  | (BaseMove & { kind: 'reserve'; source: 'deck'; tier: Tier })
  | (BaseMove & {
      kind: 'buy';
      source: 'board' | 'reserved';
      cardId: string;
      goldUsedFor?: Partial<Record<Gem, number>>;
    });

export function emptyTokens(): TokenSet {
  return { emerald: 0, sapphire: 0, ruby: 0, diamond: 0, onyx: 0, gold: 0 };
}

export function emptyBonuses(): BonusSet {
  return { emerald: 0, sapphire: 0, ruby: 0, diamond: 0, onyx: 0 };
}

function tokenPoolFor(playerCount: number): TokenSet {
  const standard = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  return {
    emerald: standard,
    sapphire: standard,
    ruby: standard,
    diamond: standard,
    onyx: standard,
    gold: 5,
  };
}

function createPlayer(): PlayerState {
  return {
    tokens: emptyTokens(),
    bonuses: emptyBonuses(),
    cards: [],
    reserved: [],
    nobles: [],
    prestige: 0,
  };
}

function tierKey(tier: Tier): keyof SplendorState['decks'] {
  return `tier${tier}` as const;
}

function dealFaceUp(deck: Card[]): [(Card | null)[], Card[]] {
  const faceUp = deck.slice(0, 4);
  return [
    [...faceUp, ...Array.from({ length: 4 - faceUp.length }, () => null)],
    deck.slice(4),
  ];
}

export function init(opts: {
  seed?: string;
  playerCount: number;
  aiPlayerIndices?: number[];
}): SplendorState {
  if (opts.playerCount < 2 || opts.playerCount > 4) {
    throw new RangeError('Splendor supports 2-4 players.');
  }

  const seed = opts.seed ?? crypto.randomUUID?.() ?? 'splendor';
  const cardsByTier = {
    tier1: shuffle(
      ALL_CARDS.filter((card) => card.tier === 1),
      createRng(`${seed}:tier1`),
    ),
    tier2: shuffle(
      ALL_CARDS.filter((card) => card.tier === 2),
      createRng(`${seed}:tier2`),
    ),
    tier3: shuffle(
      ALL_CARDS.filter((card) => card.tier === 3),
      createRng(`${seed}:tier3`),
    ),
  };

  const [tier1, deck1] = dealFaceUp(cardsByTier.tier1);
  const [tier2, deck2] = dealFaceUp(cardsByTier.tier2);
  const [tier3, deck3] = dealFaceUp(cardsByTier.tier3);

  return {
    seed,
    players: Array.from({ length: opts.playerCount }, createPlayer),
    current: 0,
    tokenPool: tokenPoolFor(opts.playerCount),
    board: { tier1, tier2, tier3 },
    decks: { tier1: deck1, tier2: deck2, tier3: deck3 },
    noblesInPlay: shuffle(NOBLES, createRng(`${seed}:nobles`)).slice(
      0,
      opts.playerCount + 1,
    ),
    turn: 0,
    finalRoundTriggered: false,
    finalRoundStartedAt: null,
    log: [],
  };
}

export function boardKey(tier: Tier): keyof SplendorState['board'] {
  return tierKey(tier);
}

export function deckKey(tier: Tier): keyof SplendorState['decks'] {
  return tierKey(tier);
}
