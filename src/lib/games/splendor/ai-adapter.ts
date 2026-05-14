import type { GameAdapter } from '@/lib/games/shared/types';
import { games } from '@/lib/games/registry';
import {
  applyMove,
  currentPlayer,
  isTerminal,
  legalMoves,
  winner,
} from './rules';
import {
  init,
  type Gem,
  type GemOrGold,
  type SplendorMove,
  type SplendorState,
} from './state';

interface AIMovePayload {
  moveId?: unknown;
  goldUsedFor?: unknown;
  discard?: unknown;
  noble?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseGemMap<T extends string>(
  value: unknown,
  allowed: readonly T[],
): Partial<Record<T, number>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error('Expected a token map object.');
  }

  const result: Partial<Record<T, number>> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.includes(key as T)) {
      throw new Error(`Unknown gem key: ${key}.`);
    }
    if (!Number.isInteger(raw) || (raw as number) < 0) {
      throw new Error(`Invalid amount for ${key}.`);
    }
    result[key as T] = raw as number;
  }

  return result;
}

function publicState(state: SplendorState, viewer: number) {
  return {
    seed: state.seed,
    current: state.current,
    tokenPool: state.tokenPool,
    board: state.board,
    deckCounts: {
      tier1: state.decks.tier1.length,
      tier2: state.decks.tier2.length,
      tier3: state.decks.tier3.length,
    },
    noblesInPlay: state.noblesInPlay,
    turn: state.turn,
    finalRoundTriggered: state.finalRoundTriggered,
    players: state.players.map((player, index) => ({
      tokens: player.tokens,
      bonuses: player.bonuses,
      prestige: player.prestige,
      cards: player.cards,
      reserved: index === viewer ? player.reserved : [],
      reserveCount: player.reserved.length,
      nobles: player.nobles,
    })),
  };
}

export const splendorAdapter: GameAdapter<SplendorState, SplendorMove> = {
  meta: games.find((game) => game.id === 'splendor') ?? {
    id: 'splendor',
    name: 'Splendor',
    description: 'Splendor',
    minPlayers: 2,
    maxPlayers: 4,
    hiddenInformation: true,
    estimatedAITurnTokens: 400,
    docPath: 'docs/games/splendor.md',
  },
  init,
  legalMoves,
  applyMove,
  currentPlayer,
  isTerminal,
  winner,
  systemPrompt() {
    return [
      'You are playing Splendor.',
      'Each turn you receive the public game state from your perspective and an enumerated list of legal moves with IDs.',
      'Choose exactly one legal move by ID. Respond with one JSON object containing moveId and any required sub-decisions such as goldUsedFor, discard, or noble.',
      'Do not include prose, markdown, or explanation outside the JSON.',
      'Strategy priorities: buy affordable prestige cards when they improve your position; build permanent bonuses that reduce the cost of visible tier 2 and tier 3 cards; pursue nobles when you already have most of their required bonuses; reserve high-value cards you can soon buy or that an opponent is close to buying; take tokens that move you toward a near-term purchase.',
      'Avoid taking random tokens with no purchase plan, overusing gold when matching gems can pay, reserving low-impact cards, or ignoring an immediate winning or blocking move.',
      'When multiple moves look similar, prefer the move that increases prestige soonest, then the move that improves future discounts toward expensive cards.',
    ].join(' ');
  },
  serializeForAI(state, player, moves) {
    return JSON.stringify({
      game: 'splendor',
      player,
      state: publicState(state, player),
      legalMoves: moves.map((move) => ({
        id: move.id,
        kind: move.kind,
        move,
      })),
    });
  },
  parseAIMove(response, moves) {
    let payload: AIMovePayload;
    try {
      payload = JSON.parse(response) as AIMovePayload;
    } catch {
      return { ok: false, error: 'Response is not valid JSON.' };
    }

    if (typeof payload.moveId !== 'string') {
      return { ok: false, error: 'Response must include a string moveId.' };
    }

    const move = moves.find((candidate) => candidate.id === payload.moveId);
    if (!move) {
      return { ok: false, error: `Move ${payload.moveId} is not legal.` };
    }

    try {
      return {
        ok: true,
        move: {
          ...move,
          goldUsedFor:
            move.kind === 'buy'
              ? parseGemMap(payload.goldUsedFor, [
                  'emerald',
                  'sapphire',
                  'ruby',
                  'diamond',
                  'onyx',
                ] satisfies Gem[])
              : undefined,
          discard: parseGemMap(payload.discard, [
            'emerald',
            'sapphire',
            'ruby',
            'diamond',
            'onyx',
            'gold',
          ] satisfies GemOrGold[]),
          noble: typeof payload.noble === 'string' ? payload.noble : undefined,
        } as SplendorMove,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid move payload.',
      };
    }
  },
};

export default splendorAdapter;
