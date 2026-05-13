import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '@/lib/games/splendor/data/cards';
import { NOBLES } from '@/lib/games/splendor/data/nobles';
import { init } from '@/lib/games/splendor/state';

describe('Splendor data', () => {
  it('contains the standard development and noble counts', () => {
    expect(ALL_CARDS).toHaveLength(90);
    expect(ALL_CARDS.filter((card) => card.tier === 1)).toHaveLength(40);
    expect(ALL_CARDS.filter((card) => card.tier === 2)).toHaveLength(30);
    expect(ALL_CARDS.filter((card) => card.tier === 3)).toHaveLength(20);
    expect(new Set(ALL_CARDS.map((card) => card.id)).size).toBe(90);
    expect(NOBLES).toHaveLength(10);
  });

  it('initializes deterministic boards and player-count token pools', () => {
    const left = init({ seed: 'same', playerCount: 2 });
    const right = init({ seed: 'same', playerCount: 2 });

    expect(left.board).toEqual(right.board);
    expect(left.noblesInPlay).toEqual(right.noblesInPlay);
    expect(left.board.tier1).toHaveLength(4);
    expect(left.board.tier2).toHaveLength(4);
    expect(left.board.tier3).toHaveLength(4);
    expect(left.tokenPool).toEqual({
      emerald: 4,
      sapphire: 4,
      ruby: 4,
      diamond: 4,
      onyx: 4,
      gold: 5,
    });
  });
});
