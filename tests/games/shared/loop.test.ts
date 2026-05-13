import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '@/lib/ai/types';
import { createGameLoop } from '@/lib/games/shared/loop';
import { createRng } from '@/lib/games/shared/rng';
import type { GameAdapter } from '@/lib/games/shared/types';

interface CounterState {
  current: number;
  scores: number[];
  target: number;
}

interface CounterMove {
  id: 'ADD_ONE' | 'ADD_TWO';
  amount: number;
}

const addOne: CounterMove = { id: 'ADD_ONE', amount: 1 };
const addTwo: CounterMove = { id: 'ADD_TWO', amount: 2 };

const adapter: GameAdapter<CounterState, CounterMove> = {
  meta: {
    id: 'counter',
    name: 'Counter',
    description: 'Tiny loop test game.',
    minPlayers: 2,
    maxPlayers: 2,
    hiddenInformation: false,
    estimatedAITurnTokens: 10,
    docPath: 'docs/games/counter.md',
  },
  init() {
    return { current: 0, scores: [0, 0], target: 3 };
  },
  legalMoves() {
    return [addOne, addTwo];
  },
  applyMove(state, move) {
    const scores = [...state.scores];
    scores[state.current] += move.amount;
    return {
      ...state,
      scores,
      current: state.current === 0 ? 1 : 0,
    };
  },
  currentPlayer(state) {
    return state.current;
  },
  isTerminal(state) {
    return state.scores.some((score) => score >= state.target);
  },
  winner(state) {
    const winner = state.scores.findIndex((score) => score >= state.target);
    return winner === -1 ? null : winner;
  },
  systemPrompt() {
    return 'Pick a legal counter move.';
  },
  serializeForAI(state, player, legalMoves) {
    return JSON.stringify({ state, player, legalMoves });
  },
  parseAIMove(response, legalMoves) {
    const parsed = JSON.parse(response) as { moveId?: string };
    const move = legalMoves.find((candidate) => candidate.id === parsed.moveId);
    return move ? { ok: true, move } : { ok: false, error: 'Unknown move id.' };
  },
};

function providerWithReplies(replies: string[]): AIProvider {
  const complete = vi.fn(async () => ({
    text: replies.shift() ?? '{"moveId":"ADD_ONE"}',
    usage: { input: 3, output: 2 },
  }));

  return {
    id: 'openai',
    label: 'Mock',
    defaultModel: 'mock',
    availableModels: ['mock'],
    requiresApiKey: false,
    complete,
  };
}

describe('game loop', () => {
  it('applies human moves and notifies subscribers', () => {
    const loop = createGameLoop({
      adapter,
      initialState: adapter.init({
        playerCount: 2,
        aiPlayerIndices: [1],
      }),
      aiPlayers: { 1: { provider: providerWithReplies([]), model: 'mock' } },
    });

    const snapshots: CounterState[] = [];
    const unsubscribe = loop.subscribe((snapshot) => {
      snapshots.push(snapshot.state);
    });

    loop.playHumanMove(addTwo);
    unsubscribe();

    expect(loop.getSnapshot().state.scores).toEqual([2, 0]);
    expect(loop.getSnapshot().log[0]).toMatchObject({
      player: 0,
      source: 'human',
      move: addTwo,
    });
    expect(snapshots.length).toBe(2);
  });

  it('runs an AI move and records usage', async () => {
    const provider = providerWithReplies(['{"moveId":"ADD_TWO"}']);
    const loop = createGameLoop({
      adapter,
      initialState: { current: 1, scores: [0, 0], target: 3 },
      aiPlayers: { 1: { provider, model: 'mock' } },
    });

    const moved = await loop.step();
    const snapshot = loop.getSnapshot();

    expect(moved).toBe(true);
    expect(snapshot.state.scores).toEqual([0, 2]);
    expect(snapshot.totalUsage).toEqual({ input: 3, output: 2 });
    expect(snapshot.log[0]).toMatchObject({
      player: 1,
      source: 'ai',
      attempts: 1,
      usage: { input: 3, output: 2 },
    });
  });

  it('retries invalid AI moves before applying a valid move', async () => {
    const provider = providerWithReplies([
      '{"moveId":"NOPE"}',
      '{"moveId":"ADD_ONE"}',
    ]);
    const loop = createGameLoop({
      adapter,
      initialState: { current: 1, scores: [0, 0], target: 3 },
      aiPlayers: { 1: { provider, model: 'mock' } },
    });

    await loop.step();

    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(loop.getSnapshot().state.scores).toEqual([0, 1]);
    expect(loop.getSnapshot().log[0]).toMatchObject({
      source: 'ai',
      attempts: 2,
      usage: { input: 6, output: 4 },
    });
  });

  it('falls back to a deterministic legal move after retry exhaustion', async () => {
    const provider = providerWithReplies([
      '{"moveId":"NOPE"}',
      '{"moveId":"STILL_NOPE"}',
    ]);
    const loop = createGameLoop({
      adapter,
      initialState: { current: 1, scores: [0, 0], target: 3 },
      aiPlayers: { 1: { provider, model: 'mock' } },
      maxRetries: 2,
      rng: createRng('fallback'),
    });

    await loop.step();

    expect(loop.getSnapshot().log[0]).toMatchObject({
      source: 'fallback',
      attempts: 2,
      error: 'Unknown move id.',
    });
    expect(loop.getSnapshot().warning).toContain('random legal fallback');
  });

  it('runs until the next human turn or terminal state', async () => {
    const loop = createGameLoop({
      adapter,
      initialState: { current: 1, scores: [0, 2], target: 3 },
      aiPlayers: {
        1: {
          provider: providerWithReplies(['{"moveId":"ADD_ONE"}']),
          model: 'mock',
        },
      },
    });

    await loop.runUntilBlocked();

    expect(loop.getSnapshot().status).toBe('terminal');
    expect(loop.getSnapshot().winner).toBe(1);
  });
});
