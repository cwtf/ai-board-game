export const HUMAN_SEAT_ID = '__human__';

export type SeatSelections = Record<number, string>;

export interface LocalAISeatOption {
  id: string;
  label: string;
}

export interface NormalizeSeatSelectionsOptions {
  playerCount: number;
  selections: SeatSelections;
  profileIds: readonly string[];
  fallbackSeatId: string;
  humanSeatIndex?: number;
  localSeatIds?: readonly string[];
}

export interface NormalizeSeatSelectionsResult {
  selections: SeatSelections;
  changed: boolean;
}

export function validAISeatIds(options: {
  profileIds: readonly string[];
  localSeatIds?: readonly string[];
}): Set<string> {
  return new Set([...(options.localSeatIds ?? []), ...options.profileIds]);
}

export function normalizeSeatSelections({
  playerCount,
  selections,
  profileIds,
  fallbackSeatId,
  humanSeatIndex = 0,
  localSeatIds = [],
}: NormalizeSeatSelectionsOptions): NormalizeSeatSelectionsResult {
  const validIds = validAISeatIds({ profileIds, localSeatIds });
  const fallback = validIds.has(fallbackSeatId)
    ? fallbackSeatId
    : (localSeatIds.find((id) => validIds.has(id)) ?? HUMAN_SEAT_ID);
  const next: SeatSelections = {};

  for (let index = 0; index < playerCount; index += 1) {
    const current = selections[index];
    if (index === humanSeatIndex) {
      next[index] =
        current === HUMAN_SEAT_ID || validIds.has(current)
          ? current
          : HUMAN_SEAT_ID;
      continue;
    }

    next[index] = validIds.has(current) ? current : fallback;
  }

  const changed =
    Object.keys(selections).length !== playerCount ||
    Array.from({ length: playerCount }).some(
      (_, index) => selections[index] !== next[index],
    );

  return { selections: next, changed };
}

export function aiControlledSeatIndexes({
  playerCount,
  selections,
  profileIds,
  localSeatIds = [],
}: {
  playerCount: number;
  selections: SeatSelections;
  profileIds: readonly string[];
  localSeatIds?: readonly string[];
}): number[] {
  const validIds = validAISeatIds({ profileIds, localSeatIds });
  return Array.from({ length: playerCount }, (_, index) => index).filter(
    (index) => {
      const selection = selections[index];
      return selection !== HUMAN_SEAT_ID && validIds.has(selection);
    },
  );
}
