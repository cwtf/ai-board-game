import { describe, expect, it } from 'vitest';
import {
  applyMove,
  hydrateState,
  isTerminal,
  legalMoves,
} from '@/lib/games/chess/rules';
import { init, type ChessMove, type ChessState } from '@/lib/games/chess/state';

function moveBySan(state: ChessState, san: string): ChessMove {
  const move = legalMoves(state).find((candidate) => candidate.san === san);
  expect(move, `Expected ${san} to be legal`).toBeTruthy();
  return move!;
}

function play(state: ChessState, san: string): ChessState {
  return applyMove(state, moveBySan(state, san));
}

function stateFromFen(fen: string): ChessState {
  return hydrateState({
    ...init({ seed: 'fen-test', playerCount: 2 }),
    fen,
    pgn: '',
    pieces: [],
    current: fen.includes(' b ') ? 1 : 0,
    turn: 0,
    winner: null,
    isCheck: false,
    status: 'active',
    moveHistory: [],
  });
}

describe('Chess rules', () => {
  it('initializes the standard board and legal opening moves', () => {
    const state = init({ seed: 'standard', playerCount: 2 });

    expect(state.pieces).toHaveLength(32);
    expect(state.current).toBe(0);
    expect(legalMoves(state)).toHaveLength(20);
    expect(legalMoves(state).some((move) => move.id === 'MOVE:e2e4')).toBe(
      true,
    );
    expect(legalMoves(state, 1)).toEqual([]);
  });

  it('applies moves immutably and records SAN', () => {
    const before = init({ seed: 'immutable', playerCount: 2 });
    const move = moveBySan(before, 'e4');
    const after = applyMove(before, move);

    expect(before.turn).toBe(0);
    expect(after.turn).toBe(1);
    expect(after.current).toBe(1);
    expect(after.lastMove?.san).toBe('e4');
    expect(after.fen).toContain(' b ');
  });

  it('allows castling when the path is clear and safe', () => {
    let state = init({ seed: 'castle', playerCount: 2 });
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']) {
      state = play(state, san);
    }

    const castle = legalMoves(state).find((move) => move.san === 'O-O');
    expect(castle?.isCastle).toBe(true);

    const after = applyMove(state, castle!);
    expect(after.pieces.some((piece) => piece.type === 'king' && piece.square === 'g1')).toBe(
      true,
    );
    expect(after.pieces.some((piece) => piece.type === 'rook' && piece.square === 'f1')).toBe(
      true,
    );
  });

  it('allows en passant captures from the legal move list', () => {
    let state = init({ seed: 'en-passant', playerCount: 2 });
    for (const san of ['e4', 'a6', 'e5', 'd5']) {
      state = play(state, san);
    }

    const enPassant = legalMoves(state).find(
      (move) => move.fromSquare === 'e5' && move.toSquare === 'd6',
    );
    expect(enPassant?.isEnPassant).toBe(true);
    expect(enPassant?.isCapture).toBe(true);
  });

  it('offers all standard promotion choices', () => {
    const state = stateFromFen('8/P7/8/8/8/8/8/4k2K w - - 0 1');
    const promotions = legalMoves(state).filter(
      (move) => move.fromSquare === 'a7' && move.toSquare === 'a8',
    );

    expect(promotions.map((move) => move.promotion).sort()).toEqual([
      'bishop',
      'knight',
      'queen',
      'rook',
    ]);
  });

  it('detects checkmate', () => {
    let state = init({ seed: 'mate', playerCount: 2 });
    for (const san of ['f3', 'e5', 'g4', 'Qh4#']) {
      state = play(state, san);
    }

    expect(state.status).toBe('checkmate');
    expect(state.winner).toBe(1);
    expect(isTerminal(state)).toBe(true);
  });

  it('detects draw states without a winner', () => {
    const state = stateFromFen('8/8/8/8/8/8/6k1/7K w - - 0 1');

    expect(state.status).toBe('insufficient-material');
    expect(state.winner).toBeNull();
    expect(isTerminal(state)).toBe(true);
    expect(legalMoves(state)).toEqual([]);
  });
});
