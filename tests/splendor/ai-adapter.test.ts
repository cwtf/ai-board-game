import { describe, expect, it } from 'vitest';
import { splendorAdapter } from '@/lib/games/splendor/ai-adapter';
import { legalMoves } from '@/lib/games/splendor/rules';
import { init } from '@/lib/games/splendor/state';

describe('Splendor AI adapter', () => {
  it('serializes legal moves with unique IDs', () => {
    const state = init({ seed: 'adapter', playerCount: 2 });
    const moves = legalMoves(state);
    const payload = JSON.parse(
      splendorAdapter.serializeForAI(state, 0, moves),
    ) as {
      legalMoves: Array<{ id: string }>;
    };

    expect(payload.legalMoves).toHaveLength(moves.length);
    expect(new Set(payload.legalMoves.map((move) => move.id)).size).toBe(
      moves.length,
    );
  });

  it('parses every legal move by legal move ID', () => {
    const state = init({ seed: 'adapter', playerCount: 2 });
    const moves = legalMoves(state);

    for (const move of moves) {
      expect(
        splendorAdapter.parseAIMove(JSON.stringify({ moveId: move.id }), moves),
      ).toEqual({ ok: true, move });
    }
  });

  it('rejects malformed or illegal AI moves', () => {
    const state = init({ seed: 'adapter', playerCount: 2 });
    const moves = legalMoves(state);

    expect(splendorAdapter.parseAIMove('not json', moves)).toMatchObject({
      ok: false,
    });
    expect(
      splendorAdapter.parseAIMove(
        JSON.stringify({ moveId: 'BUY:BOARD:nope' }),
        moves,
      ),
    ).toMatchObject({ ok: false });
  });
});
