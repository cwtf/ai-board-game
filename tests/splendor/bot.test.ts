import { describe, expect, it } from 'vitest';
import { NOBLES } from '@/lib/games/splendor/data/nobles';
import { chooseSplendorBotMove } from '@/lib/games/splendor/bot';
import { applyMove, legalMoves } from '@/lib/games/splendor/rules';
import {
  emptyBonuses,
  emptyTokens,
  init,
  type Card,
  type GemOrGold,
  type SplendorState,
} from '@/lib/games/splendor/state';

const freePrestigeCard: Card = {
  id: 'bot_free_prestige',
  tier: 1,
  cost: {},
  bonus: 'diamond',
  prestige: 1,
};

const cheapPrestigeCard: Card = {
  id: 'bot_cheap_prestige',
  tier: 3,
  cost: { ruby: 1 },
  bonus: 'onyx',
  prestige: 5,
};

const lowImpactEmeraldCard: Card = {
  id: 'bot_low_emerald',
  tier: 1,
  cost: { emerald: 1 },
  bonus: 'emerald',
  prestige: 0,
};

const lowImpactSapphireCard: Card = {
  id: 'bot_low_sapphire',
  tier: 1,
  cost: { sapphire: 1 },
  bonus: 'sapphire',
  prestige: 0,
};

const lowImpactRubyCard: Card = {
  id: 'bot_low_ruby',
  tier: 1,
  cost: { ruby: 1 },
  bonus: 'ruby',
  prestige: 0,
};

function tokenTotal(tokens: Partial<Record<GemOrGold, number>>): number {
  return Object.values(tokens).reduce((sum, value) => sum + (value ?? 0), 0);
}

function state(): SplendorState {
  return {
    ...init({ seed: 'bot-test', playerCount: 2 }),
    current: 0,
    turn: 0,
    tokenPool: {
      emerald: 4,
      sapphire: 4,
      ruby: 4,
      diamond: 4,
      onyx: 4,
      gold: 5,
    },
    board: {
      tier1: [freePrestigeCard, null, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    },
    decks: { tier1: [], tier2: [], tier3: [] },
    noblesInPlay: [],
    players: [
      {
        tokens: emptyTokens(),
        bonuses: emptyBonuses(),
        cards: [],
        reserved: [],
        nobles: [],
        prestige: 0,
      },
      {
        tokens: emptyTokens(),
        bonuses: emptyBonuses(),
        cards: [],
        reserved: [],
        nobles: [],
        prestige: 0,
      },
    ],
    log: [],
  };
}

describe('Splendor local bot', () => {
  it('medium difficulty prefers an immediately affordable prestige card', () => {
    const current = state();
    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'medium',
      seed: 'buy-now',
    });

    expect(move).toMatchObject({
      kind: 'buy',
      source: 'board',
      cardId: freePrestigeCard.id,
    });
    expect(applyMove(current, move).players[0].prestige).toBe(1);
  });

  it('adds a discard sub-decision when a token move would exceed the limit', () => {
    const current = state();
    current.board = {
      tier1: [null, null, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    };
    current.tokenPool = {
      emerald: 3,
      sapphire: 3,
      ruby: 3,
      diamond: 3,
      onyx: 3,
      gold: 5,
    };
    current.players[0].tokens = {
      emerald: 2,
      sapphire: 2,
      ruby: 2,
      diamond: 2,
      onyx: 1,
      gold: 0,
    };

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'medium',
      seed: 'discard',
    });

    expect(move.kind).toBe('take');
    expect(tokenTotal(move.discard ?? {})).toBe(2);
    expect(() => applyMove(current, move)).not.toThrow();
    expect(tokenTotal(applyMove(current, move).players[0].tokens)).toBe(10);
  });

  it('adds a noble sub-decision when multiple nobles are eligible', () => {
    const current = state();
    current.board = {
      tier1: [null, null, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    };
    current.noblesInPlay = [NOBLES[0], NOBLES[5]];
    current.players[0].bonuses = {
      diamond: 4,
      sapphire: 4,
      emerald: 3,
      ruby: 0,
      onyx: 0,
    };

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'medium',
      seed: 'noble',
    });

    expect(move.noble).toBeDefined();
    expect([NOBLES[0].id, NOBLES[5].id]).toContain(move.noble);
    expect(() => applyMove(current, move)).not.toThrow();
    expect(applyMove(current, move).players[0].nobles).toHaveLength(1);
  });

  it('easy difficulty is deterministic with a fixed bot seed', () => {
    const current = state();
    const moves = legalMoves(current);
    const left = chooseSplendorBotMove(current, 0, moves, {
      difficulty: 'easy',
      seed: 'same-seed',
    });
    const right = chooseSplendorBotMove(current, 0, moves, {
      difficulty: 'easy',
      seed: 'same-seed',
    });

    expect(left).toEqual(right);
  });

  it('medium difficulty reserves a card an opponent can immediately buy', () => {
    const current = state();
    current.board = {
      tier1: [null, null, null, null],
      tier2: [null, null, null, null],
      tier3: [cheapPrestigeCard, null, null, null],
    };
    current.players[1].tokens.ruby = 1;

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'medium',
      seed: 'deny',
    });

    expect(move).toMatchObject({
      kind: 'reserve',
      source: 'board',
      cardId: cheapPrestigeCard.id,
    });
  });

  it('medium difficulty does not fill the last reserve slot with a low-impact card', () => {
    const current = state();
    current.board = {
      tier1: [
        lowImpactEmeraldCard,
        lowImpactSapphireCard,
        lowImpactRubyCard,
        null,
      ],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    };
    current.players[0].reserved = [
      { ...lowImpactEmeraldCard, id: 'bot_reserved_a' },
      { ...lowImpactSapphireCard, id: 'bot_reserved_b' },
    ];

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'medium',
      seed: 'do-not-hoard',
    });

    expect(move.kind).toBe('take');
  });
});
