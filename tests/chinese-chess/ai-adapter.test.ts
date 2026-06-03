import { describe, expect, it } from 'vitest';
import { chineseChessAdapter } from '@/lib/games/chinese-chess/ai-adapter';
import { init } from '@/lib/games/chinese-chess/state';

describe('Chinese Chess AI adapter', () => {
  it('returns a non-empty system prompt', () => {
    expect(chineseChessAdapter.systemPrompt().length).toBeGreaterThan(100);
    expect(chineseChessAdapter.systemPrompt()).toContain('象棋');
  });

  it('initializes a standard starting position', () => {
    const state = chineseChessAdapter.init({
      seed: 'adapter-test',
      playerCount: 2,
      aiPlayerIndices: [1],
    });

    expect(state.pieces).toHaveLength(32);
    expect(state.current).toBe(0);
    expect(state.winner).toBeNull();
  });

  it('serializes state into a JSON string for the AI', () => {
    const state = {
      ...init({ seed: 'ai-serialize', playerCount: 2 }),
      pieces: [
        { id: 'r-general', owner: 0 as const, type: 'general' as const, x: 4, y: 9, captured: false },
        { id: 'b-general', owner: 1 as const, type: 'general' as const, x: 4, y: 0, captured: false },
        { id: 'r-chariot', owner: 0 as const, type: 'chariot' as const, x: 0, y: 9, captured: false },
      ],
    };
    const moves = chineseChessAdapter.legalMoves(state, 0);
    const payload = chineseChessAdapter.serializeForAI(state, 0, moves);

    expect(JSON.parse(payload)).toMatchObject({
      game: 'chinese-chess',
      player: 0,
      side: 'red',
      state: expect.objectContaining({
        pieces: expect.any(Array),
        currentGeneralPosition: expect.any(Object),
      }),
      legalMoves: expect.any(Array),
    });
  });

  it('parses a valid AI move response', () => {
    const state = init({ seed: 'ai-parse', playerCount: 2 });
    const moves = chineseChessAdapter.legalMoves(state, 0);
    const target = moves[0];

    const parsed = chineseChessAdapter.parseAIMove(
      JSON.stringify({ moveId: target.id }),
      moves,
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.move.id).toBe(target.id);
    }
  });

  it('rejects an invalid move ID', () => {
    const state = init({ seed: 'ai-invalid', playerCount: 2 });
    const moves = chineseChessAdapter.legalMoves(state, 0);

    const parsed = chineseChessAdapter.parseAIMove(
      JSON.stringify({ moveId: 'INVALID_MOVE' }),
      moves,
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('not legal');
    }
  });

  it('rejects non-JSON responses', () => {
    const state = init({ seed: 'ai-bad-json', playerCount: 2 });
    const moves = chineseChessAdapter.legalMoves(state, 0);

    const parsed = chineseChessAdapter.parseAIMove('not json', moves);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain('valid JSON');
    }
  });
});
