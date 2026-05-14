import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '@/lib/games/splendor/data/cards';
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

const nextCard: Card = {
  id: 'test_next',
  tier: 1,
  cost: { emerald: 1 },
  bonus: 'onyx',
  prestige: 0,
};

const deckCardA: Card = {
  id: 'test_deck_a',
  tier: 2,
  cost: { sapphire: 1 },
  bonus: 'emerald',
  prestige: 1,
};

const deckCardB: Card = {
  id: 'test_deck_b',
  tier: 2,
  cost: { ruby: 1 },
  bonus: 'ruby',
  prestige: 1,
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
  it('initializes reproducible shuffled tiers and nobles without preserving source order', () => {
    const left = init({ seed: 'shuffle-contract', playerCount: 3 });
    const right = init({ seed: 'shuffle-contract', playerCount: 3 });
    const other = init({ seed: 'shuffle-contract-other', playerCount: 3 });

    expect(left.board).toEqual(right.board);
    expect(left.decks).toEqual(right.decks);
    expect(left.noblesInPlay).toEqual(right.noblesInPlay);
    expect(left.board.tier1.map((card) => card?.id)).not.toEqual(
      ALL_CARDS.filter((card) => card.tier === 1)
        .slice(0, 4)
        .map((card) => card.id),
    );
    expect(left.board.tier1.map((card) => card?.id)).not.toEqual(
      other.board.tier1.map((card) => card?.id),
    );
    expect(left.noblesInPlay.map((noble) => noble.id)).not.toEqual(
      other.noblesInPlay.map((noble) => noble.id),
    );
  });

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

  it('refills the same board slot after reserving a face-up card', () => {
    const current = state();
    current.decks.tier1 = [nextCard];

    const after = applyMove(current, {
      id: 'RESERVE:1:test_free',
      kind: 'reserve',
      source: 'board',
      tier: 1,
      cardId: 'test_free',
    });

    expect(after.board.tier1[0]).toEqual(nextCard);
    expect(after.decks.tier1).toHaveLength(0);
    expect(after.players[0].reserved).toContainEqual(freeCard);
  });

  it('leaves the board slot empty when a face-up reserve exhausts the deck', () => {
    const current = state();

    const after = applyMove(current, {
      id: 'RESERVE:1:test_free',
      kind: 'reserve',
      source: 'board',
      tier: 1,
      cardId: 'test_free',
    });

    expect(after.board.tier1[0]).toBeNull();
  });

  it('reserves the front card of the shuffled tier deck', () => {
    const current = state();
    current.decks.tier2 = [deckCardA, deckCardB];

    const after = applyMove(current, {
      id: 'RESERVE:2:DECK',
      kind: 'reserve',
      source: 'deck',
      tier: 2,
    });

    expect(after.players[0].reserved).toContainEqual(deckCardA);
    expect(after.decks.tier2).toEqual([deckCardB]);
  });

  it('does not grant gold when reserving and the gold pool is empty', () => {
    const current = state();
    current.tokenPool.gold = 0;

    const after = applyMove(current, {
      id: 'RESERVE:1:test_free',
      kind: 'reserve',
      source: 'board',
      tier: 1,
      cardId: 'test_free',
    });

    expect(after.players[0].tokens.gold).toBe(0);
    expect(after.tokenPool.gold).toBe(0);
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

  it('does not mutate the input state when applying a move', () => {
    const before = state();
    const snapshot = structuredClone(before);

    applyMove(before, {
      id: 'TAKE3:emerald,sapphire,ruby',
      kind: 'take',
      gems: ['emerald', 'sapphire', 'ruby'],
    });

    expect(before).toEqual(snapshot);
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

  it('rejects gold payments that overpay or over-allocate gold', () => {
    const overpay = state();
    overpay.board.tier1[0] = rubyCard;
    overpay.players[0].tokens.gold = 5;

    expect(() =>
      applyMove(overpay, {
        id: 'BUY:BOARD:test_ruby',
        kind: 'buy',
        source: 'board',
        cardId: 'test_ruby',
        goldUsedFor: { ruby: 5 },
      }),
    ).toThrow('Invalid gold allocation');

    const overAllocate = state();
    overAllocate.board.tier1[0] = rubyCard;
    overAllocate.players[0].tokens.gold = 3;

    expect(() =>
      applyMove(overAllocate, {
        id: 'BUY:BOARD:test_ruby',
        kind: 'buy',
        source: 'board',
        cardId: 'test_ruby',
        goldUsedFor: { ruby: 4 },
      }),
    ).toThrow('Not enough gold');
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
