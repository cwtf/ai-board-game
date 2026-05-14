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

  it('hides opponent reserved-card identities while preserving the viewer reserve', () => {
    const state = init({ seed: 'adapter-visibility', playerCount: 2 });
    state.players[0].reserved = [state.decks.tier1[0]];
    state.players[1].reserved = [state.decks.tier2[0]];

    const payload = JSON.parse(
      splendorAdapter.serializeForAI(state, 0, legalMoves(state)),
    ) as {
      state: {
        players: Array<{
          reserved: unknown[];
          reserveCount: number;
        }>;
      };
    };

    expect(payload.state.players[0].reserved).toEqual([
      state.players[0].reserved[0],
    ]);
    expect(payload.state.players[0].reserveCount).toBe(1);
    expect(payload.state.players[1].reserved).toEqual([]);
    expect(payload.state.players[1].reserveCount).toBe(1);
    expect(JSON.stringify(payload.state.players[1])).not.toContain(
      state.players[1].reserved[0].id,
    );
  });
});
