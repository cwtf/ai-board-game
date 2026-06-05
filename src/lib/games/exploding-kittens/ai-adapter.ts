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
  CARD_LABELS,
  init,
  type CardKind,
  type EKMove,
  type EKState,
} from './state';

interface AIMovePayload {
  moveId?: unknown;
  insertAt?: unknown;
  give?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function publicState(state: EKState, viewer: number) {
  const totalCards =
    state.deck.length +
    state.players.reduce((sum, p) => sum + p.hand.length, 0);

  // Count cards seen by this viewer: their own hand + discard
  const seenCounts: Partial<Record<CardKind, number>> = {};
  for (const card of [...state.players[viewer]!.hand, ...state.discard]) {
    seenCounts[card] = (seenCounts[card] ?? 0) + 1;
  }

  return {
    current: state.current,
    pendingTurns: state.pendingTurns,
    pendingFavor: state.pendingFavor,
    pendingDefuse: state.pendingDefuse,
    deckSize: state.deck.length,
    discard: state.discard.slice(0, 8),
    topOfDeck: state.knownTopN[viewer] ?? null,
    players: state.players.map((p, i) => ({
      index: i,
      alive: p.alive,
      handSize: p.hand.length,
      hand: i === viewer ? p.hand : null,
    })),
    totalCards,
    seenCounts,
    turn: state.turn,
  };
}

export const explodingKittensAdapter: GameAdapter<EKState, EKMove> = {
  meta: games.find((g) => g.id === 'exploding-kittens') ?? {
    id: 'exploding-kittens',
    name: 'Exploding Kittens',
    description: 'Manage a hidden hand, dodge exploding draws, and outlast the table with action cards.',
    minPlayers: 2,
    maxPlayers: 5,
    hiddenInformation: true,
    estimatedAITurnTokens: 600,
    docPath: 'https://www.explodingkittens.com/pages/how-to-play-exploding-kittens',
  },
  init,
  legalMoves,
  applyMove,
  currentPlayer,
  isTerminal,
  winner,

  systemPrompt() {
    return [
      'You are playing Exploding Kittens.',
      'Hidden information: you do not know other players\' hands or the deck order.',
      'You know your own hand, the discard pile, each player\'s hand size, the deck size, and any top-of-deck cards revealed by See the Future.',
      'Respond with a single JSON object: { "moveId": "<id>" }.',
      'Do not include prose, markdown, or explanation outside the JSON.',
      'Strategy: hoard at least one Defuse at all times — it is your lifeline.',
      'Use See the Future before drawing when the deck is thin or you suspect an Exploding Kitten near the top.',
      'Play Shuffle to randomise a dangerous deck order after See the Future reveals a threat.',
      'Play Skip or Attack to avoid drawing when you know or suspect an Exploding Kitten at the top.',
      'When placing a Defused Exploding Kitten back, put it near the top to threaten the next player unless you have information that makes it riskier for you.',
      'Favor and cat-pair steals are best used against players with many cards.',
      'Three-of-a-kind: name a card you strongly believe the target holds based on discard and known counts.',
    ].join(' ');
  },

  serializeForAI(state, player, moves) {
    return JSON.stringify({
      game: 'exploding-kittens',
      player,
      state: publicState(state, player),
      cardLabels: CARD_LABELS,
      legalMoves: moves.map((move) => ({ id: move.id, kind: move.kind, move })),
    });
  },

  parseAIMove(response, moves) {
    let payload: AIMovePayload;
    try {
      payload = JSON.parse(response) as AIMovePayload;
    } catch {
      return { ok: false, error: 'Response is not valid JSON.' };
    }

    if (!isRecord(payload)) {
      return { ok: false, error: 'Response must be a JSON object.' };
    }

    if (typeof payload.moveId !== 'string') {
      return { ok: false, error: 'Response must include a string moveId.' };
    }

    const move = moves.find((m) => m.id === payload.moveId);
    if (!move) {
      return { ok: false, error: `Move "${payload.moveId}" is not in the legal move list.` };
    }

    return { ok: true, move };
  },
};

export default explodingKittensAdapter;
