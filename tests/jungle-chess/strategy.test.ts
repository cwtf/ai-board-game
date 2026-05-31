import { describe, expect, it } from 'vitest';
import { legalMoves } from '@/lib/games/jungle-chess/rules';
import {
  chooseStrategicJungleMove,
  rankJungleMoves,
} from '@/lib/games/jungle-chess/strategy';
import {
  init,
  type JunglePiece,
  type JungleState,
} from '@/lib/games/jungle-chess/state';

function emptyState(): JungleState {
  return {
    ...init({ seed: 'strategy-test', playerCount: 2 }),
    pieces: [],
    current: 0,
    turn: 0,
    winner: null,
  };
}

function piece(
  id: string,
  owner: 0 | 1,
  type: JunglePiece['type'],
  rank: number,
  x: number,
  y: number,
): JunglePiece {
  return { id, owner, type, rank, x, y, captured: false };
}

describe('Jungle Chess strategy', () => {
  it('takes an immediate den-entry win', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-rat', 0, 'rat', 1, 3, 1),
      piece('blue-cat', 1, 'cat', 2, 6, 6),
    ];
    const moves = legalMoves(state, 0);

    expect(chooseStrategicJungleMove({ state, player: 0, legalMoves: moves }).id)
      .toBe('MOVE:red-rat:3,1->3,0');
  });

  it('prioritizes stopping an immediate opponent den-entry threat', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-dog', 0, 'dog', 3, 2, 7),
      piece('red-rat', 0, 'rat', 1, 6, 6),
      piece('blue-cat', 1, 'cat', 2, 3, 7),
    ];
    const moves = legalMoves(state, 0);

    expect(chooseStrategicJungleMove({ state, player: 0, legalMoves: moves }).id)
      .toBe('MOVE:red-dog:2,7->3,7');
  });

  it('marks risky moves that allow immediate den wins', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-dog', 0, 'dog', 3, 1, 7),
      piece('blue-cat', 1, 'cat', 2, 3, 7),
    ];
    const ranked = rankJungleMoves(state, 0, legalMoves(state, 0));

    expect(
      ranked.some((entry) =>
        entry.risks.includes('Allows an immediate opponent den-entry win.'),
      ),
    ).toBe(true);
  });

  it('preserves the rat instead of beelining toward an elephant without a safe capture', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-rat', 0, 'rat', 1, 4, 6),
      piece('red-dog', 0, 'dog', 3, 2, 6),
      piece('blue-elephant', 1, 'elephant', 8, 6, 6),
      piece('blue-cat', 1, 'cat', 2, 5, 7),
    ];
    const ranked = rankJungleMoves(state, 0, legalMoves(state, 0));
    const ratBeeline = ranked.find(
      (entry) => entry.move.id === 'MOVE:red-rat:4,6->5,6',
    );

    expect(ratBeeline?.risks).toContain(
      'Preserve the rat: it is your only elephant counter and should not beeline toward the elephant without a safe capture.',
    );
    expect(ranked[0].move.id).not.toBe('MOVE:red-rat:4,6->5,6');
  });
});
