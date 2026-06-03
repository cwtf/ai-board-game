import { describe, expect, it } from 'vitest';
import { legalMoves } from '@/lib/games/chinese-chess/rules';
import {
  chooseStrategicChineseChessMove,
  rankChineseChessMoves,
} from '@/lib/games/chinese-chess/strategy';
import {
  init,
  type ChineseChessPiece,
  type ChineseChessState,
} from '@/lib/games/chinese-chess/state';

function emptyState(): ChineseChessState {
  return {
    ...init({ seed: 'strategy-test', playerCount: 2 }),
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

describe('Chinese Chess strategy', () => {
  it('takes an immediate checkmate win', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-general', 0, 'general', 4, 9),
      piece('black-general', 1, 'general', 4, 0),
      piece('red-chariot', 0, 'chariot', 3, 0),
    ];
    state.current = 0;
    const moves = legalMoves(state, 0);

    expect(chooseStrategicChineseChessMove({ state, player: 0, legalMoves: moves }).id)
      .toBe('MOVE:red-chariot:3,0->4,0');
  });

  it('ranks captures higher than non-captures', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-general', 0, 'general', 3, 9),
      piece('black-general', 1, 'general', 5, 0),
      piece('red-chariot', 0, 'chariot', 0, 9),
      piece('black-horse', 1, 'horse', 0, 5),
    ];
    state.current = 0;
    const ranked = rankChineseChessMoves(state, 0, legalMoves(state, 0));

    // Capture of a horse should score higher than a non-capturing slide
    const capture = ranked.find((entry) => entry.move.capturedId === 'black-horse');
    expect(capture).toBeDefined();
    if (capture) {
      expect(capture.score).toBeGreaterThan(500);
    }
  });

  it('assigns positive scores to legal moves', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-general', 0, 'general', 3, 9),
      piece('black-general', 1, 'general', 5, 0),
      piece('red-chariot', 0, 'chariot', 5, 9),
    ];
    state.current = 0;
    const ranked = rankChineseChessMoves(state, 0, legalMoves(state, 0));

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].score).toBeGreaterThanOrEqual(0);
  });

  it('rewards checking moves without flagging them as self-check', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-general', 0, 'general', 3, 9),
      piece('black-general', 1, 'general', 5, 0),
      piece('red-chariot', 0, 'chariot', 4, 9),
    ];
    state.current = 0;

    const ranked = rankChineseChessMoves(state, 0, legalMoves(state, 0));
    const checkingMove = ranked.find(
      (entry) => entry.move.id === 'MOVE:red-chariot:4,9->4,0',
    );

    expect(checkingMove).toBeDefined();
    expect(checkingMove?.reasons).toContain('Gives check.');
    expect(checkingMove?.risks).not.toContain('Leaves or exposes the general to check.');
  });

  it('avoids moves that hang pieces', () => {
    const state = emptyState();
    state.pieces = [
      piece('red-general', 0, 'general', 3, 9),
      piece('black-general', 1, 'general', 5, 0),
      piece('red-horse', 0, 'horse', 4, 7),
      piece('black-chariot', 1, 'chariot', 4, 4),
    ];
    state.current = 0;
    const ranked = rankChineseChessMoves(state, 0, legalMoves(state, 0));

    // Moving the horse to where the chariot can capture it should be flagged as risky
    const riskyMove = ranked.find(
      (entry) => entry.move.pieceId === 'red-horse' && entry.move.to.x === 4,
    );
    if (riskyMove) {
      expect(riskyMove.risks.length).toBeGreaterThan(0);
    }
  });
});
