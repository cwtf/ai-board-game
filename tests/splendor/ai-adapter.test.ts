import { describe, expect, it } from 'vitest';
import { splendorAdapter } from '@/lib/games/splendor/ai-adapter';
import { legalMoves } from '@/lib/games/splendor/rules';
import { init, type GemOrGold } from '@/lib/games/splendor/state';

function tokenTotal(tokens: Partial<Record<GemOrGold, number>>): number {
  return Object.values(tokens).reduce((sum, value) => sum + (value ?? 0), 0);
}

describe('Splendor AI adapter', () => {
  it('gives the model a JSON-only contract and Splendor strategy priorities', () => {
    const prompt = splendorAdapter.systemPrompt();

    expect(prompt).toContain('Respond with one JSON object');
    expect(prompt).toContain('moveId');
    expect(prompt).toContain('Do not include prose');
    expect(prompt).toContain('buy affordable prestige cards');
    expect(prompt).toContain('visible tier 2 and tier 3 cards');
    expect(prompt).toContain('pursue nobles');
    expect(prompt).toContain('reserve high-value cards');
    expect(prompt).toContain('near-term purchase');
  });

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

  it('prepares AI token moves with an automatic discard when over the token limit', () => {
    const state = init({ seed: 'adapter-discard', playerCount: 2 });
    state.current = 1;
    state.players[1].tokens = {
      emerald: 2,
      sapphire: 2,
      ruby: 2,
      diamond: 2,
      onyx: 1,
      gold: 0,
    };

    const move = legalMoves(state, 1).find(
      (candidate) =>
        candidate.kind === 'take' &&
        candidate.gems.length === 3,
    );

    expect(move).toBeDefined();
    const prepared = splendorAdapter.prepareAIMove?.(state, 1, move!);

    expect(prepared?.discard).toBeDefined();
    expect(tokenTotal(prepared?.discard ?? {})).toBe(2);
    expect(() => splendorAdapter.applyMove(state, prepared!)).not.toThrow();
    expect(splendorAdapter.applyMove(state, prepared!).current).toBe(0);
  });
});
