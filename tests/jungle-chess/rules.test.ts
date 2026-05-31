import { describe, expect, it } from 'vitest';
import {
  applyMove,
  legalMoves,
  terrainAt,
} from '@/lib/games/jungle-chess/rules';
import {
  init,
  type JunglePiece,
  type JungleState,
} from '@/lib/games/jungle-chess/state';

function emptyState(): JungleState {
  return {
    ...init({ seed: 'jungle-test', playerCount: 2 }),
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

describe('Jungle Chess rules', () => {
  it('initializes the standard 7x9 board and starting armies', () => {
    const state = init({ seed: 'standard', playerCount: 2 });

    expect(state.pieces).toHaveLength(16);
    expect(terrainAt({ x: 3, y: 0 })).toBe('den');
    expect(terrainAt({ x: 1, y: 4 })).toBe('water');
    expect(terrainAt({ x: 3, y: 7 })).toBe('trap');
  });

  it('does not allow a piece to enter its own den', () => {
    const state = emptyState();
    state.pieces = [piece('red-dog', 0, 'dog', 3, 3, 7)];

    expect(legalMoves(state).map((move) => move.id)).not.toContain(
      'MOVE:red-dog:3,7->3,8',
    );
  });

  it('lets rats enter water but keeps other pieces on land', () => {
    const ratState = emptyState();
    ratState.pieces = [piece('red-rat', 0, 'rat', 1, 1, 6)];

    expect(legalMoves(ratState).map((move) => move.id)).toContain(
      'MOVE:red-rat:1,6->1,5',
    );

    const dogState = emptyState();
    dogState.pieces = [piece('red-dog', 0, 'dog', 3, 1, 6)];

    expect(legalMoves(dogState).map((move) => move.id)).not.toContain(
      'MOVE:red-dog:1,6->1,5',
    );
  });

  it('allows lion and tiger river jumps unless a rat blocks the water path', () => {
    const open = emptyState();
    open.pieces = [piece('red-lion', 0, 'lion', 7, 1, 2)];

    expect(legalMoves(open).map((move) => move.id)).toContain(
      'MOVE:red-lion:1,2->1,6',
    );

    const blocked = emptyState();
    blocked.pieces = [
      piece('red-lion', 0, 'lion', 7, 1, 2),
      piece('blue-rat', 1, 'rat', 1, 1, 4),
    ];

    expect(legalMoves(blocked).map((move) => move.id)).not.toContain(
      'MOVE:red-lion:1,2->1,6',
    );
  });

  it('lets any piece capture an enemy standing in its trap', () => {
    const state = emptyState();
    state.current = 1;
    state.pieces = [
      piece('blue-cat', 1, 'cat', 2, 2, 1),
      piece('red-elephant', 0, 'elephant', 8, 2, 0),
    ];

    const capture = legalMoves(state).find(
      (move) => move.id === 'MOVE:blue-cat:2,1->2,0',
    );

    expect(capture?.capturedId).toBe('red-elephant');
  });

  it('does not let an attacker capture into the defender own trap using its original rank', () => {
    const state = emptyState();
    state.current = 1;
    state.pieces = [
      piece('blue-lion', 1, 'lion', 7, 3, 6),
      piece('red-cat', 0, 'cat', 2, 3, 7),
    ];

    expect(legalMoves(state).map((move) => move.id)).not.toContain(
      'MOVE:blue-lion:3,6->3,7',
    );
  });

  it('never lets a player capture their own piece in their own trap', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-lion', 0, 'lion', 7, 3, 6),
      piece('red-cat', 0, 'cat', 2, 3, 7),
    ];

    expect(legalMoves(state).map((move) => move.id)).not.toContain(
      'MOVE:red-lion:3,6->3,7',
    );
  });

  it('applies captures immutably and wins by entering the opposing den', () => {
    const before = emptyState();
    before.pieces = [
      piece('red-rat', 0, 'rat', 1, 3, 1),
      piece('blue-cat', 1, 'cat', 2, 4, 4),
    ];

    const after = applyMove(before, {
      id: 'MOVE:red-rat:3,1->3,0',
      pieceId: 'red-rat',
      from: { x: 3, y: 1 },
      to: { x: 3, y: 0 },
    });

    expect(before.winner).toBeNull();
    expect(after.winner).toBe(0);
    expect(after.pieces.find((item) => item.id === 'red-rat')).toMatchObject({
      x: 3,
      y: 0,
    });
  });
});
