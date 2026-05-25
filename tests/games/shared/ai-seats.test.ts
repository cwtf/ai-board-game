import { describe, expect, it } from 'vitest';
import {
  aiControlledSeatIndexes,
  HUMAN_SEAT_ID,
  normalizeSeatSelections,
} from '@/lib/games/shared/ai-seats';

const localMedium = '__local_medium__';
const localEasy = '__local_easy__';

describe('AI seat assignment helpers', () => {
  it('keeps a human first seat and defaults other seats to the fallback AI', () => {
    const result = normalizeSeatSelections({
      playerCount: 3,
      selections: { 0: HUMAN_SEAT_ID },
      profileIds: ['profile-a'],
      localSeatIds: [localMedium, localEasy],
      fallbackSeatId: localMedium,
    });

    expect(result.changed).toBe(true);
    expect(result.selections).toEqual({
      0: HUMAN_SEAT_ID,
      1: localMedium,
      2: localMedium,
    });
  });

  it('preserves delegated human seats when the selected AI id remains valid', () => {
    const result = normalizeSeatSelections({
      playerCount: 2,
      selections: { 0: 'profile-a', 1: localEasy },
      profileIds: ['profile-a'],
      localSeatIds: [localMedium, localEasy],
      fallbackSeatId: localMedium,
    });

    expect(result.changed).toBe(false);
    expect(result.selections[0]).toBe('profile-a');
  });

  it('returns the human seat to human control when its profile disappears', () => {
    const result = normalizeSeatSelections({
      playerCount: 2,
      selections: { 0: 'missing-profile', 1: localEasy },
      profileIds: [],
      localSeatIds: [localMedium, localEasy],
      fallbackSeatId: localMedium,
    });

    expect(result.selections[0]).toBe(HUMAN_SEAT_ID);
    expect(result.selections[1]).toBe(localEasy);
  });

  it('reports only seats with valid AI selections as controlled by AI', () => {
    expect(
      aiControlledSeatIndexes({
        playerCount: 4,
        selections: {
          0: HUMAN_SEAT_ID,
          1: localMedium,
          2: 'profile-a',
          3: 'missing-profile',
        },
        profileIds: ['profile-a'],
        localSeatIds: [localMedium],
      }),
    ).toEqual([1, 2]);
  });
});
