import { describe, expect, it } from 'vitest';
import {
  applyMove,
  inPalace,
  isRiverCrossed,
  legalMoves,
} from '@/lib/games/chinese-chess/rules';
import {
  init,
  type ChineseChessPiece,
  type ChineseChessState,
} from '@/lib/games/chinese-chess/state';

function emptyState(): ChineseChessState {
  return {
    ...init({ seed: 'chinese-test', playerCount: 2 }),
    pieces: [],
    current: 0,
    turn: 0,
    winner: null,
    isCheck: false,
  };
}

function piece(
  id: string,
  owner: 0 | 1,
  type: ChineseChessPiece['type'],
  x: number,
  y: number,
): ChineseChessPiece {
  return { id, owner, type, x, y, captured: false };
}

describe('Chinese Chess rules', () => {
  it('initializes the standard 9x10 board and starting armies', () => {
    const state = init({ seed: 'standard', playerCount: 2 });

    expect(state.pieces).toHaveLength(32);
    expect(inPalace({ x: 4, y: 9 }, 0)).toBe(true);
    expect(inPalace({ x: 4, y: 0 }, 1)).toBe(true);
    expect(inPalace({ x: 4, y: 5 }, 0)).toBe(false);
    expect(isRiverCrossed({ x: 3, y: 4 }, 0)).toBe(true);
    expect(isRiverCrossed({ x: 3, y: 4 }, 1)).toBe(false);
  });

  it('allows chariot to move orthogonally any distance', () => {
    const state = emptyState();
    state.pieces = [piece('red-chariot', 0, 'chariot', 0, 9)];

    const moves = legalMoves(state);
    expect(moves.some((m) => m.to.x === 0 && m.to.y === 5)).toBe(true);
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 9)).toBe(true);
    expect(moves.some((m) => m.to.x === 1 && m.to.y === 8)).toBe(false);
  });

  it('allows horse L-shape move if leg is not blocked', () => {
    const state = emptyState();
    state.pieces = [piece('red-horse', 0, 'horse', 1, 9)];

    const moves = legalMoves(state);
    // Horse at (1,9) can move to (2,7) or (0,7) - forward L-shapes
    expect(moves.some((m) => m.to.x === 2 && m.to.y === 7)).toBe(true);
    expect(moves.some((m) => m.to.x === 0 && m.to.y === 7)).toBe(true);
  });

  it('blocks horse move when the leg is occupied', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-horse', 0, 'horse', 1, 9),
      piece('red-blocker', 0, 'soldier', 1, 8),
    ];

    const moves = legalMoves(state);
    // Horse leg at (1,8) is blocked, so cannot move to (2,7) or (0,7)
    expect(moves.some((m) => m.to.x === 2 && m.to.y === 7)).toBe(false);
    expect(moves.some((m) => m.to.x === 0 && m.to.y === 7)).toBe(false);
  });

  it('allows elephant diagonal move if eye is not blocked and stays on own side', () => {
    const state = emptyState();
    state.pieces = [piece('red-elephant', 0, 'elephant', 2, 9)];

    const moves = legalMoves(state);
    // Elephant at (2,9) can move to (4,7) or (0,7)
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 7)).toBe(true);
    expect(moves.some((m) => m.to.x === 0 && m.to.y === 7)).toBe(true);
  });

  it('blocks elephant if eye is occupied', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-elephant', 0, 'elephant', 2, 9),
      piece('red-blocker', 0, 'soldier', 3, 8),
    ];

    const moves = legalMoves(state);
    // Elephant eye at (3,8) is blocked
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 7)).toBe(false);
  });

  it('prevents elephant from crossing the river', () => {
    const state = emptyState();
    state.pieces = [piece('red-elephant', 0, 'elephant', 4, 6)];

    const moves = legalMoves(state);
    // Elephant cannot cross to y=4 or below
    expect(moves.some((m) => m.to.y <= 4)).toBe(false);
  });

  it('keeps advisor within the palace', () => {
    const state = emptyState();
    state.pieces = [piece('red-advisor', 0, 'advisor', 3, 9)];

    const moves = legalMoves(state);
    // Advisor at (3,9) can only move to (4,8) diagonally within palace
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 8)).toBe(true);
    expect(moves.some((m) => m.to.x === 2 && m.to.y === 8)).toBe(false); // outside palace
  });

  it('keeps general within the palace', () => {
    const state = emptyState();
    state.pieces = [piece('red-general', 0, 'general', 4, 9)];

    const moves = legalMoves(state);
    // General can move within palace
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 8)).toBe(true);
    expect(moves.some((m) => m.to.x === 3 && m.to.y === 9)).toBe(true);
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 7)).toBe(false); // 2 steps
  });

  it('allows flying general when no pieces between', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-general', 0, 'general', 4, 9),
      piece('black-general', 1, 'general', 4, 0),
    ];

    const moves = legalMoves(state);
    // Red general can fly to capture black general
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 0)).toBe(true);
  });

  it('blocks flying general when pieces are between', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-general', 0, 'general', 4, 9),
      piece('red-soldier', 0, 'soldier', 4, 6),
      piece('black-general', 1, 'general', 4, 0),
    ];

    const moves = legalMoves(state);
    // Flying general blocked by soldier at (4,6)
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 0)).toBe(false);
  });

  it('requires cannon to jump exactly one piece to capture', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-cannon', 0, 'cannon', 1, 7),
      piece('red-platform', 0, 'soldier', 1, 6),
      piece('black-target', 1, 'soldier', 1, 4),
    ];

    const moves = legalMoves(state);
    // Cannon can capture black soldier at (1,4) by jumping red soldier at (1,6)
    expect(moves.some((m) => m.to.x === 1 && m.to.y === 4)).toBe(true);
    // Cannot capture without platform
    expect(moves.some((m) => m.to.x === 1 && m.to.y === 3)).toBe(false);
  });

  it('allows cannon to move freely without capturing', () => {
    const state = emptyState();
    state.pieces = [piece('red-cannon', 0, 'cannon', 1, 7)];

    const moves = legalMoves(state);
    // Cannon can slide along empty file
    expect(moves.some((m) => m.to.x === 1 && m.to.y === 5)).toBe(true);
    expect(moves.some((m) => m.to.x === 1 && m.to.y === 0)).toBe(true);
    expect(moves.some((m) => m.to.x === 5 && m.to.y === 7)).toBe(true);
  });

  it('allows soldier to move forward and sideways after crossing river', () => {
    const state = emptyState();
    state.current = 1;
    state.pieces = [piece('black-soldier', 1, 'soldier', 4, 5)];

    const moves = legalMoves(state);
    // Black soldier at (4,5) has crossed river, can move forward (to y=6) or sideways
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 6)).toBe(true);
    expect(moves.some((m) => m.to.x === 3 && m.to.y === 5)).toBe(true);
    expect(moves.some((m) => m.to.x === 5 && m.to.y === 5)).toBe(true);
  });

  it('prevents soldier from moving backward', () => {
    const state = emptyState();
    state.pieces = [piece('red-soldier', 0, 'soldier', 4, 6)];

    const moves = legalMoves(state);
    // Red soldier cannot move backward (to y=7)
    expect(moves.some((m) => m.to.x === 4 && m.to.y === 7)).toBe(false);
  });

  it('does not allow a move that leaves general in check', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-general', 0, 'general', 4, 9),
      piece('red-advisor', 0, 'advisor', 4, 8),
      piece('black-chariot', 1, 'chariot', 4, 0),
    ];

    const moves = legalMoves(state);
    // Moving advisor diagonally off the x=4 file would expose general to chariot
    expect(moves.some((m) => m.pieceId === 'red-advisor')).toBe(false);
  });

  it('detects checkmate when no legal moves remain', () => {
    const state = emptyState();
    state.current = 1;
    state.pieces = [
      piece('red-general', 0, 'general', 4, 9),
      piece('black-chariot', 1, 'chariot', 3, 9),
    ];

    const after = applyMove(state, {
      id: 'MOVE:black-chariot:3,9->4,9',
      pieceId: 'black-chariot',
      from: { x: 3, y: 9 },
      to: { x: 4, y: 9 },
      capturedId: 'red-general',
    });

    expect(after.winner).toBe(1);
  });

  it('ends immediately when a general is captured even if other pieces remain', () => {
    const state = emptyState();
    state.current = 0;
    state.pieces = [
      piece('red-general', 0, 'general', 3, 9),
      piece('black-general', 1, 'general', 5, 0),
      piece('red-chariot', 0, 'chariot', 5, 9),
      piece('black-soldier', 1, 'soldier', 0, 3),
    ];

    const after = applyMove(state, {
      id: 'MOVE:red-chariot:5,9->5,0',
      pieceId: 'red-chariot',
      from: { x: 5, y: 9 },
      to: { x: 5, y: 0 },
      capturedId: 'black-general',
    });

    expect(after.winner).toBe(0);
    expect(legalMoves(after, 1)).toEqual([]);
  });

  it('applies moves immutably', () => {
    const before = init({ seed: 'immutable', playerCount: 2 });

    const move = legalMoves(before)[0];
    const after = applyMove(before, move);

    expect(before.winner).toBeNull();
    expect(before.turn).toBe(0);
    expect(after.turn).toBe(1);
    expect(after.current).toBe(1);
  });
});
