import { describe, expect, it } from 'vitest';
import {
  secretHitlerAdapter,
  type SecretHitlerState,
} from '@/lib/games/secret-hitler/ai-adapter';

describe('Secret Hitler AI adapter', () => {
  it('gives the model a hidden-info JSON-only contract', () => {
    const prompt = secretHitlerAdapter.systemPrompt();

    expect(prompt).toContain('exactly one assigned player');
    expect(prompt).toContain('only the information your player is allowed to know');
    expect(prompt).toContain('Never claim certainty from hidden information');
    expect(prompt).toContain('Do not make your next move obvious');
    expect(prompt).toContain('Never announce private policy choices');
    expect(prompt).toContain('public reasoning');
    expect(prompt).toContain('tableTalk');
    expect(prompt).toContain('moveId');
    expect(prompt).toContain('Do not include prose');
    expect(prompt).toContain('Liberals should');
    expect(prompt).toContain('Fascists should');
    expect(prompt).toContain('Hitler should');
  });

  it('serializes only legally visible identities for each player', () => {
    const state = secretHitlerAdapter.init({
      seed: 'visibility',
      playerCount: 7,
      aiPlayerIndices: [],
    });
    state.players = [
      { id: 0, name: 'Player 1', role: 'liberal', alive: true },
      { id: 1, name: 'Player 2', role: 'fascist', alive: true },
      { id: 2, name: 'Player 3', role: 'hitler', alive: true },
      { id: 3, name: 'Player 4', role: 'liberal', alive: true },
      { id: 4, name: 'Player 5', role: 'liberal', alive: true },
      { id: 5, name: 'Player 6', role: 'liberal', alive: true },
      { id: 6, name: 'Player 7', role: 'fascist', alive: true },
    ];

    const liberalPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 0, []),
    ) as {
      state: { players: Array<{ visibleRole: string | null }> };
    };
    expect(liberalPayload.state.players.map((player) => player.visibleRole)).toEqual([
      'liberal',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);

    const fascistPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 1, []),
    ) as {
      state: { players: Array<{ visibleRole: string | null }> };
    };
    expect(fascistPayload.state.players.map((player) => player.visibleRole)).toEqual([
      null,
      'fascist',
      'hitler',
      null,
      null,
      null,
      'fascist',
    ]);

    const hitlerPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 2, []),
    ) as {
      state: { players: Array<{ visibleRole: string | null }> };
    };
    expect(hitlerPayload.state.players.map((player) => player.visibleRole)).toEqual([
      null,
      null,
      'hitler',
      null,
      null,
      null,
      null,
    ]);
  });

  it('shows Hitler the fascist teammate in five and six player games', () => {
    const state = secretHitlerAdapter.init({
      seed: 'small-table',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.players = [
      { id: 0, name: 'Player 1', role: 'hitler', alive: true },
      { id: 1, name: 'Player 2', role: 'fascist', alive: true },
      { id: 2, name: 'Player 3', role: 'liberal', alive: true },
      { id: 3, name: 'Player 4', role: 'liberal', alive: true },
      { id: 4, name: 'Player 5', role: 'liberal', alive: true },
    ];

    const payload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 0, []),
    ) as {
      state: { players: Array<{ visibleRole: string | null }> };
    };

    expect(payload.state.players.map((player) => player.visibleRole)).toEqual([
      'hitler',
      'fascist',
      null,
      null,
      null,
    ]);
  });

  it('hides policy hands unless the viewer owns the private step', () => {
    const state = secretHitlerAdapter.init({
      seed: 'hands',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.phase = 'president-discard';
    state.president = 1;
    state.presidentHand = ['liberal', 'fascist', 'fascist'];

    const presidentPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 1, []),
    ) as { state: { private: { presidentHand?: string[] } } };
    expect(presidentPayload.state.private.presidentHand).toEqual([
      'liberal',
      'fascist',
      'fascist',
    ]);

    const otherPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 0, []),
    ) as { state: { private: { presidentHand?: string[] } } };
    expect(otherPayload.state.private.presidentHand).toBeUndefined();
  });

  it('parses legal move IDs and optional table talk', () => {
    const state = secretHitlerAdapter.init({
      seed: 'parse',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    const moves = secretHitlerAdapter.legalMoves(state, 0);
    const parsed = secretHitlerAdapter.parseAIMove(
      JSON.stringify({
        moveId: moves[0].id,
        tableTalk: 'I can take Chancellor if the table trusts this pairing.',
      }),
      moves,
    );

    expect(parsed).toEqual({
      ok: true,
      move: {
        ...moves[0],
        tableTalk: 'I can take Chancellor if the table trusts this pairing.',
      },
    });
  });

  it('rejects malformed or illegal model responses', () => {
    const state = secretHitlerAdapter.init({
      seed: 'reject',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    const moves = secretHitlerAdapter.legalMoves(state, 0);

    expect(secretHitlerAdapter.parseAIMove('not json', moves)).toMatchObject({
      ok: false,
    });
    expect(
      secretHitlerAdapter.parseAIMove(
        JSON.stringify({ moveId: 'nominate:999' }),
        moves,
      ),
    ).toMatchObject({ ok: false });
    expect(
      secretHitlerAdapter.parseAIMove(
        JSON.stringify({ moveId: moves[0].id, tableTalk: 123 }),
        moves,
      ),
    ).toMatchObject({ ok: false });
  });

  it('applies table talk as the current acting player', () => {
    const state = secretHitlerAdapter.init({
      seed: 'chat',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    const move = secretHitlerAdapter.legalMoves(state, 0)[0];
    const next = secretHitlerAdapter.applyMove(state, {
      ...move,
      tableTalk: 'Let me propose this government.',
    }) as SecretHitlerState;

    expect(next.chatMessages).toEqual([
      {
        playerId: 0,
        playerName: 'Player 1',
        body: 'Let me propose this government.',
        turn: 1,
        phase: 'nomination',
      },
    ]);
  });
});
