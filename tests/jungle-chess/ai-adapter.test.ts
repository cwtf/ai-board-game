import { describe, expect, it } from 'vitest';
import { jungleChessAdapter } from '@/lib/games/jungle-chess/ai-adapter';

describe('Jungle Chess AI adapter', () => {
  it('serializes legal moves and parses a selected move id', () => {
    const state = jungleChessAdapter.init({
      seed: 'adapter',
      playerCount: 2,
      aiPlayerIndices: [1],
    });
    const moves = jungleChessAdapter.legalMoves(state, 0);
    const payload = jungleChessAdapter.serializeForAI(state, 0, moves);

    expect(payload).toContain('"game":"jungle-chess"');
    expect(payload).toContain(moves[0].id);
    expect(payload).toContain('"rules"');
    expect(payload).toContain('"strategy"');
    expect(payload).toContain('"topCandidates"');
    expect(payload).toContain('"tactical"');
    expect(payload).toContain('"heuristicScore"');
    expect(payload).toContain('"summary"');

    const parsed = jungleChessAdapter.parseAIMove(
      JSON.stringify({ moveId: moves[0].id }),
      moves,
    );

    expect(parsed).toEqual({ ok: true, move: moves[0] });
  });

  it('teaches the model the core special rules in the system prompt', () => {
    const prompt = jungleChessAdapter.systemPrompt();

    expect(prompt).toContain('Only rats may enter water');
    expect(prompt).toContain('Rat can capture elephant');
    expect(prompt).toContain('lions and tigers can jump');
    expect(prompt).toContain('opponent trap has effective rank 0');
    expect(prompt).toContain('You may not enter your own den');
  });

  it('parses common LLM JSON variants instead of falling back randomly', () => {
    const state = jungleChessAdapter.init({
      seed: 'adapter-variants',
      playerCount: 2,
      aiPlayerIndices: [1],
    });
    const moves = jungleChessAdapter.legalMoves(state, 0);

    expect(
      jungleChessAdapter.parseAIMove(
        `\`\`\`json\n{"move_id":"${moves[0].id}"}\n\`\`\``,
        moves,
      ),
    ).toEqual({ ok: true, move: moves[0] });

    expect(
      jungleChessAdapter.parseAIMove(JSON.stringify({ id: moves[1].id }), moves),
    ).toEqual({ ok: true, move: moves[1] });
  });

  it('rejects malformed or illegal model responses', () => {
    const state = jungleChessAdapter.init({
      seed: 'adapter-bad',
      playerCount: 2,
      aiPlayerIndices: [1],
    });
    const moves = jungleChessAdapter.legalMoves(state, 0);

    expect(jungleChessAdapter.parseAIMove('nope', moves)).toMatchObject({
      ok: false,
    });
    expect(
      jungleChessAdapter.parseAIMove(
        JSON.stringify({ moveId: 'MOVE:missing' }),
        moves,
      ),
    ).toMatchObject({ ok: false });
  });
});
