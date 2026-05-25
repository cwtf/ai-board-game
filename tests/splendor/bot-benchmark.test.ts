import { describe, expect, it } from 'vitest';
import {
  chooseSplendorBotMove,
  type SplendorBotDifficulty,
} from '@/lib/games/splendor/bot';
import {
  applyMove,
  isTerminal,
  legalMoves,
  winner,
} from '@/lib/games/splendor/rules';
import { init, type SplendorState } from '@/lib/games/splendor/state';

interface GameResult {
  winner: number | null;
  prestige: number[];
  turns: number;
}

function playBotGame(
  seed: string,
  difficulties: [SplendorBotDifficulty, SplendorBotDifficulty],
): GameResult {
  let state: SplendorState = init({ seed, playerCount: 2 });

  while (!isTerminal(state) && state.turn < 250) {
    const player = state.current;
    const moves = legalMoves(state, player);
    const move = chooseSplendorBotMove(state, player, moves, {
      difficulty: difficulties[player],
      seed: `${seed}:${state.turn}:${player}:${difficulties[player]}`,
    });
    state = applyMove(state, move);
  }

  expect(isTerminal(state)).toBe(true);

  return {
    winner: winner(state),
    prestige: state.players.map((player) => player.prestige),
    turns: state.turn,
  };
}

function mediumOutcome(result: GameResult, mediumPlayer: number): number {
  if (result.winner === mediumPlayer) {
    return 1;
  }

  if (result.winner !== null) {
    return 0;
  }

  const easyPlayer = mediumPlayer === 0 ? 1 : 0;
  if (result.prestige[mediumPlayer] > result.prestige[easyPlayer]) {
    return 1;
  }

  if (result.prestige[mediumPlayer] < result.prestige[easyPlayer]) {
    return 0;
  }

  return 0.5;
}

describe('Splendor local bot benchmark', () => {
  it('medium beats easy over mirrored deterministic self-play seeds', () => {
    const seeds = Array.from(
      { length: 8 },
      (_, index) => `medium-vs-easy-${index}`,
    );
    const outcomes = seeds.flatMap((seed) => {
      const mediumFirst = playBotGame(seed, ['medium', 'easy']);
      const mediumSecond = playBotGame(`${seed}:mirror`, ['easy', 'medium']);
      return [mediumOutcome(mediumFirst, 0), mediumOutcome(mediumSecond, 1)];
    });

    const score = outcomes.reduce((sum, outcome) => sum + outcome, 0);
    expect(score).toBeGreaterThanOrEqual(11);
  });
});
