import { describe, expect, it } from 'vitest';
import { NOBLES } from '@/lib/games/splendor/data/nobles';
import {
  applyMove,
  isTerminal,
  legalMoves,
  winner,
} from '@/lib/games/splendor/rules';
import {
  emptyBonuses,
  emptyTokens,
  init,
  type Card,
  type SplendorState,
} from '@/lib/games/splendor/state';

const freeCard: Card = {
  id: 'test_free',
  tier: 1,
  cost: {},
  bonus: 'diamond',
  prestige: 1,
};

const rubyCard: Card = {
  id: 'test_ruby',
  tier: 1,
  cost: { ruby: 4 },
  bonus: 'sapphire',
  prestige: 0,
};

function state(): SplendorState {
  return {
    ...init({ seed: 'rules', playerCount: 2 }),
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
      tier1: [freeCard, null, null, null],
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

function totalTokens(current: SplendorState): number {
  const playerTokens = current.players.flatMap((player) =>
    Object.values(player.tokens),
  );
  return [...Object.values(current.tokenPool), ...playerTokens].reduce(
    (sum, value) => sum + value,
    0,
  );
}

describe('Splendor rules', () => {
  it('conserves tokens when taking gems', () => {
    const before = state();
    const after = applyMove(before, {
      id: 'TAKE3:emerald,sapphire,ruby',
      kind: 'take',
      gems: ['emerald', 'sapphire', 'ruby'],
    });

    expect(totalTokens(after)).toBe(totalTokens(before));
    expect(after.players[0].tokens).toMatchObject({
      emerald: 1,
      sapphire: 1,
      ruby: 1,
    });
  });

  it('allows taking fewer colours when only two distinct token colours are available', () => {
    const current = state();
    current.tokenPool = {
      emerald: 0,
      sapphire: 1,
      ruby: 1,
      diamond: 0,
      onyx: 0,
      gold: 5,
    };

    expect(legalMoves(current).map((move) => move.id)).toContain(
      'TAKEN:sapphire,ruby',
    );
  });

  it('allows taking two of a kind when exactly four are in supply', () => {
    const current = state();
    current.tokenPool.ruby = 4;

    expect(legalMoves(current).map((move) => move.id)).toContain('TAKE2:ruby');
  });

  it('does not offer reserve-from-deck moves for empty decks', () => {
    const current = state();

    expect(legalMoves(current).some((move) => move.id.endsWith(':DECK'))).toBe(
      false,
    );
    expect(() =>
      applyMove(current, {
        id: 'RESERVE:1:DECK',
        kind: 'reserve',
        source: 'deck',
        tier: 1,
      }),
    ).toThrow('empty deck');
  });

  it('enforces the reserved-card limit', () => {
    const current = state();
    current.players[0].reserved = [
      { ...freeCard, id: 'r1' },
      { ...freeCard, id: 'r2' },
      { ...freeCard, id: 'r3' },
    ];

    expect(legalMoves(current).some((move) => move.kind === 'reserve')).toBe(
      false,
    );
  });

  it("does not allow buying a card you can't afford", () => {
    const current = state();
    current.board.tier1[0] = rubyCard;
    current.players[0].tokens.ruby = 3;

    expect(legalMoves(current).map((move) => move.id)).not.toContain(
      'BUY:BOARD:test_ruby',
    );
    expect(() =>
      applyMove(current, {
        id: 'BUY:BOARD:test_ruby',
        kind: 'buy',
        source: 'board',
        cardId: 'test_ruby',
      }),
    ).toThrow('Not enough');
  });

  it('buys using bonuses, tokens, and gold by reconstructing payment', () => {
    const current = state();
    current.board.tier1[0] = rubyCard;
    current.players[0].bonuses.ruby = 1;
    current.players[0].tokens.ruby = 1;
    current.players[0].tokens.gold = 2;

    const after = applyMove(current, {
      id: 'BUY:BOARD:test_ruby',
      kind: 'buy',
      source: 'board',
      cardId: 'test_ruby',
      goldUsedFor: { ruby: 2 },
    });

    expect(after.players[0].tokens.ruby).toBe(0);
    expect(after.players[0].tokens.gold).toBe(0);
    expect(after.players[0].bonuses.sapphire).toBe(1);
    expect(after.tokenPool.ruby).toBe(5);
    expect(after.tokenPool.gold).toBe(7);
  });

  it('requires discard down to 10 after reserving with gold', () => {
    const current = state();
    current.tokenPool.gold = 1;
    current.players[0].tokens = {
      emerald: 2,
      sapphire: 2,
      ruby: 2,
      diamond: 2,
      onyx: 2,
      gold: 0,
    };

    expect(() =>
      applyMove(current, {
        id: 'RESERVE:1:test_free',
        kind: 'reserve',
        source: 'board',
        tier: 1,
        cardId: 'test_free',
      }),
    ).toThrow('Discard');

    const after = applyMove(current, {
      id: 'RESERVE:1:test_free',
      kind: 'reserve',
      source: 'board',
      tier: 1,
      cardId: 'test_free',
      discard: { gold: 1 },
    });

    expect(
      Object.values(after.players[0].tokens).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBe(10);
  });

  it('claims at most one noble per turn', () => {
    const current = state();
    current.noblesInPlay = [NOBLES[0], NOBLES[5]];
    current.players[0].bonuses = {
      diamond: 4,
      sapphire: 4,
      emerald: 3,
      ruby: 0,
      onyx: 0,
    };

    const after = applyMove(current, {
      id: 'TAKE3:emerald,sapphire,ruby',
      kind: 'take',
      gems: ['emerald', 'sapphire', 'ruby'],
      noble: NOBLES[0].id,
    });

    expect(after.players[0].nobles).toHaveLength(1);
    expect(after.players[0].prestige).toBe(3);
    expect(after.noblesInPlay).toHaveLength(1);
  });

  it('triggers and finishes the final round', () => {
    const current = state();
    current.players[0].prestige = 14;

    const afterTrigger = applyMove(current, {
      id: 'BUY:BOARD:test_free',
      kind: 'buy',
      source: 'board',
      cardId: 'test_free',
    });

    expect(afterTrigger.finalRoundTriggered).toBe(true);
    expect(isTerminal(afterTrigger)).toBe(false);

    const afterLastTurn = applyMove(afterTrigger, {
      id: 'TAKE3:emerald,sapphire,ruby',
      kind: 'take',
      gems: ['emerald', 'sapphire', 'ruby'],
    });

    expect(isTerminal(afterLastTurn)).toBe(true);
    expect(winner(afterLastTurn)).toBe(0);
  });

  it('uses fewest purchased cards as winner tie-break', () => {
    const current = state();
    current.finalRoundTriggered = true;
    current.finalRoundStartedAt = 0;
    current.turn = 2;
    current.current = 0;
    current.players[0].prestige = 15;
    current.players[1].prestige = 15;
    current.players[0].cards = [
      { ...freeCard, id: 'a' },
      { ...freeCard, id: 'b' },
    ];
    current.players[1].cards = [{ ...freeCard, id: 'c' }];

    expect(winner(current)).toBe(1);
  });
});
