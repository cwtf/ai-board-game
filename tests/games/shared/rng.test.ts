import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/games/shared/rng';
import { shuffle } from '@/lib/games/shared/shuffle';

describe('shared RNG', () => {
  it('produces the same sequence for the same seed', () => {
    const left = createRng('phase-4');
    const right = createRng('phase-4');

    expect(Array.from({ length: 8 }, () => left.next())).toEqual(
      Array.from({ length: 8 }, () => right.next()),
    );
  });

  it('produces bounded integers', () => {
    const rng = createRng('bounds');
    const values = Array.from({ length: 100 }, () => rng.int(4));

    expect(values.every((value) => value >= 0 && value < 4)).toBe(true);
    expect(() => rng.int(0)).toThrow(RangeError);
  });
});

describe('shared shuffle', () => {
  it('is deterministic with an injected RNG', () => {
    const items = [1, 2, 3, 4, 5, 6];

    expect(shuffle(items, createRng('deck'))).toEqual(
      shuffle(items, createRng('deck')),
    );
  });

  it('does not mutate the input array', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const result = shuffle(items, createRng('deck'));

    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result).toHaveLength(items.length);
    expect([...result].sort()).toEqual(items);
  });
});
