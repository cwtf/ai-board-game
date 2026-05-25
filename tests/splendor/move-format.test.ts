import { describe, expect, it } from 'vitest';
import { formatSplendorMove } from '@/lib/games/splendor/move-format';

describe('Splendor move formatter', () => {
  it('formats token takes with gem labels', () => {
    expect(
      formatSplendorMove({
        id: 'TAKE3:emerald,sapphire,ruby',
        kind: 'take',
        gems: ['emerald', 'sapphire', 'ruby'],
      }),
    ).toBe('Take Emerald, Sapphire, Ruby');
  });

  it('formats reserve and buy moves with sub-decisions', () => {
    expect(
      formatSplendorMove({
        id: 'RESERVE:2:DECK',
        kind: 'reserve',
        source: 'deck',
        tier: 2,
        discard: { gold: 1 },
      }),
    ).toBe('Reserve face-down tier 2; discard 1 Gold');

    expect(
      formatSplendorMove({
        id: 'BUY:RESERVED:t3_05',
        kind: 'buy',
        source: 'reserved',
        cardId: 't3_05',
        noble: 'noble_4',
      }),
    ).toBe('Buy reserved t3_05; claim noble_4');
  });
});
