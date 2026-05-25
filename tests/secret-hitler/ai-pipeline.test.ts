import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, CompleteResult } from '@/lib/ai';
import { requestSecretHitlerAIMove } from '@/lib/games/secret-hitler/ai-pipeline';
import {
  createSecretHitlerAIMemory,
  secretHitlerAdapter,
  type SecretHitlerMove,
  type SecretHitlerState,
} from '@/lib/games/secret-hitler/ai-adapter';

function chancellorState(): {
  state: SecretHitlerState;
  moves: SecretHitlerMove[];
} {
  const state = secretHitlerAdapter.init({
    seed: 'pipeline-chancellor',
    playerCount: 5,
    aiPlayerIndices: [],
  });
  state.players[1] = {
    id: 1,
    name: 'Felix',
    role: 'fascist',
    alive: true,
  };
  state.phase = 'chancellor-discard';
  state.president = 0;
  state.nominee = 1;
  state.liberalPolicies = 4;
  state.chancellorHand = ['liberal', 'fascist'];
  return { state, moves: secretHitlerAdapter.legalMoves(state, 1) };
}

function completeWithReplies(replies: string[]) {
  const calls: ChatMessage[][] = [];
  const complete = vi.fn(
    async ({
      messages,
    }: {
      system: string;
      messages: ChatMessage[];
      signal?: AbortSignal;
    }): Promise<CompleteResult> => {
      calls.push(messages);
      return {
        text: replies.shift() ?? '{"moveId":"chancellor-enact:1"}',
        usage: { input: 10, output: 4 },
      };
    },
  );

  return { complete, calls };
}

describe('Secret Hitler AI decision pipeline', () => {
  it('returns a parsed legal move and usage totals', async () => {
    const { state, moves } = chancellorState();
    const { complete } = completeWithReplies([
      '{"moveId":"chancellor-enact:1"}',
    ]);

    const result = await requestSecretHitlerAIMove({
      state,
      player: 1,
      legalMoves: moves,
      memory: createSecretHitlerAIMemory(),
      complete,
    });

    expect(result.move).toEqual({
      id: 'chancellor-enact:1',
      kind: 'chancellor-enact',
      index: 1,
      tableTalk: undefined,
    });
    expect(result.usage).toEqual({ input: 10, output: 4 });
    expect(result.lastUsage).toEqual({ input: 10, output: 4 });
  });

  it('retries malformed responses with a corrective prompt', async () => {
    const { state, moves } = chancellorState();
    const { complete, calls } = completeWithReplies([
      'not json',
      '{"moveId":"chancellor-enact:1"}',
    ]);

    const result = await requestSecretHitlerAIMove({
      state,
      player: 1,
      legalMoves: moves,
      complete,
    });

    expect(result.move.id).toBe('chancellor-enact:1');
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.usage).toEqual({ input: 20, output: 8 });
    expect(calls[1].at(-1)?.content).toContain('Invalid response');
  });

  it('uses a strategic fallback after repeated hidden-objective contradictions', async () => {
    const { state, moves } = chancellorState();
    const { complete } = completeWithReplies([
      '{"moveId":"chancellor-enact:0"}',
      '{"moveId":"chancellor-enact:0"}',
      '{"moveId":"chancellor-enact:0"}',
    ]);

    const result = await requestSecretHitlerAIMove({
      state,
      player: 1,
      legalMoves: moves,
      maxAttempts: 3,
      complete,
    });

    expect(result.move).toEqual({
      id: 'chancellor-enact:1',
      kind: 'chancellor-enact',
      index: 1,
    });
    expect(result.warning).toContain('hidden objective');
    expect(result.usage).toEqual({ input: 30, output: 12 });
  });
});
