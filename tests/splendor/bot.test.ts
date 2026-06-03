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
  type Noble,
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

const nobleEmeraldCard: Card = {
  id: 'bot_noble_emerald',
  tier: 1,
  cost: {},
  bonus: 'emerald',
  prestige: 0,
};

const balancingSapphireCard: Card = {
  id: 'bot_balance_sapphire',
  tier: 1,
  cost: {},
  bonus: 'sapphire',
  prestige: 0,
};

const contestedEmeraldCard: Card = {
  id: 'bot_contested_emerald',
  tier: 1,
  cost: { ruby: 3 },
  bonus: 'emerald',
  prestige: 0,
};

const emeraldNoble: Noble = {
  id: 'bot_emerald_noble',
  cost: { emerald: 4 },
  prestige: 3,
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

  it('can choose a move while continuing after the standard final round', () => {
    const current = state();
    current.finalRoundTriggered = true;
    current.finalRoundStartedAt = 0;
    current.turn = 2;
    current.current = 0;

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'medium',
      seed: 'after-terminal',
    });

    expect(() =>
      applyMove(current, move, { allowAfterTerminal: true }),
    ).not.toThrow();
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

  it('hard difficulty balances gem bonuses before chasing nobles', () => {
    const current = state();
    current.board = {
      tier1: [freePrestigeCard, balancingSapphireCard, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    };
    current.players[0].bonuses.diamond = 3;

    const mediumMove = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'medium',
      seed: 'balance',
    });
    const hardMove = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'hard',
      seed: 'balance',
    });

    expect(mediumMove).toMatchObject({
      kind: 'buy',
      source: 'board',
      cardId: freePrestigeCard.id,
    });
    expect(hardMove).toMatchObject({
      kind: 'buy',
      source: 'board',
      cardId: balancingSapphireCard.id,
    });
  });

  it('hard difficulty chases nobles after building three strong gem colors', () => {
    const current = state();
    current.board = {
      tier1: [freePrestigeCard, nobleEmeraldCard, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    };
    current.noblesInPlay = [{ ...emeraldNoble, cost: { emerald: 5 } }];
    current.players[0].bonuses = {
      emerald: 3,
      sapphire: 3,
      ruby: 3,
      diamond: 0,
      onyx: 0,
    };

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'hard',
      seed: 'mature-noble-race',
    });

    expect(move).toMatchObject({
      kind: 'buy',
      source: 'board',
      cardId: nobleEmeraldCard.id,
    });
  });

  it('hard difficulty prefers points over future noble progress near the end', () => {
    const current = state();
    current.board = {
      tier1: [freePrestigeCard, nobleEmeraldCard, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    };
    current.noblesInPlay = [{ ...emeraldNoble, cost: { emerald: 5 } }];
    current.players[0].prestige = 10;
    current.players[0].bonuses = {
      emerald: 3,
      sapphire: 3,
      ruby: 3,
      diamond: 0,
      onyx: 0,
    };

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'hard',
      seed: 'endgame-points',
    });

    expect(move).toMatchObject({
      kind: 'buy',
      source: 'board',
      cardId: freePrestigeCard.id,
    });
  });

  it('hard difficulty does not reserve just to deny a non-noble card at low tokens', () => {
    const current = state();
    current.board = {
      tier1: [freePrestigeCard, null, null, null],
      tier2: [null, null, null, null],
      tier3: [cheapPrestigeCard, null, null, null],
    };
    current.players[1].tokens.ruby = 1;

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'hard',
      seed: 'no-casual-reserve',
    });

    expect(move).not.toMatchObject({
      kind: 'reserve',
      source: 'board',
      cardId: cheapPrestigeCard.id,
    });
  });

  it('hard difficulty buys before denying an opponent noble', () => {
    const current = state();
    current.board = {
      tier1: [contestedEmeraldCard, freePrestigeCard, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    };
    current.noblesInPlay = [emeraldNoble];
    current.players[1].bonuses.emerald = 1;
    current.players[1].tokens.ruby = 3;

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'hard',
      seed: 'deny-noble',
    });

    expect(move).toMatchObject({
      kind: 'buy',
      source: 'board',
      cardId: freePrestigeCard.id,
    });
  });

  it('hard difficulty may reserve to deny a noble when no buy is available', () => {
    const current = state();
    current.board = {
      tier1: [contestedEmeraldCard, null, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
    };
    current.noblesInPlay = [emeraldNoble];
    current.players[1].bonuses.emerald = 3;
    current.players[1].tokens.ruby = 3;

    const move = chooseSplendorBotMove(current, 0, legalMoves(current), {
      difficulty: 'hard',
      seed: 'deny-noble-no-buy',
    });

    expect(move).toMatchObject({
      kind: 'reserve',
      source: 'board',
      cardId: contestedEmeraldCard.id,
    });
  });

  it('hard difficulty may reserve when the bot is nearly token capped', () => {
    const current = state();
    current.board = {
      tier1: [contestedEmeraldCard, null, null, null],
      tier2: [null, null, null, null],
      tier3: [null, null, null, null],
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
      difficulty: 'hard',
      seed: 'token-capped-reserve',
    });

    expect(move.kind).toBe('reserve');
  });
});
