import { describe, expect, it } from 'vitest';
import { chessAdapter } from '@/lib/games/chess/ai-adapter';
import { formatChessMove } from '@/lib/games/chess/move-format';
import { applyMove, legalMoves } from '@/lib/games/chess/rules';
import { init } from '@/lib/games/chess/state';

describe('Chess move formatting and adapter', () => {
  it('formats algebraic moves with piece and square context', () => {
    const state = init({ seed: 'format', playerCount: 2 });
    const move = legalMoves(state).find((candidate) => candidate.san === 'e4');

    expect(move).toBeTruthy();
    expect(formatChessMove(move!)).toContain('e4: Pawn e2-e4');
  });

  it('formats captures and check', () => {
    let state = init({ seed: 'capture-format', playerCount: 2 });
    for (const san of ['e4', 'd5']) {
      const move = legalMoves(state).find((candidate) => candidate.san === san);
      expect(move).toBeTruthy();
      state = applyMove(state, move!);
    }
    const capture = legalMoves(state).find((move) => move.san === 'exd5');

    expect(capture).toBeTruthy();
    expect(formatChessMove(capture!)).toContain('captures Pawn');
  });

  it('serializes and parses legal AI move ids', () => {
    const state = chessAdapter.init({
      seed: 'adapter',
      playerCount: 2,
      aiPlayerIndices: [1],
    });
    const moves = chessAdapter.legalMoves(state, 0);
    const payload = chessAdapter.serializeForAI(state, 0, moves);

    expect(JSON.parse(payload).game).toBe('chess');
    expect(
      chessAdapter.parseAIMove('{"moveId":"MOVE:e2e4"}', moves),
    ).toEqual({
      ok: true,
      move: moves.find((move) => move.id === 'MOVE:e2e4'),
    });
    expect(chessAdapter.parseAIMove('{"moveId":"MOVE:e7e5"}', moves)).toEqual({
      ok: false,
      error: 'Move MOVE:e7e5 is not legal.',
    });
  });
});
