import type { GameAdapter } from '@/lib/games/shared/types';
import { games } from '@/lib/games/registry';
import {
  activePieces,
  applyMove,
  currentPlayer,
  denOwnerAt,
  isTerminal,
  legalMoves,
  terrainAt,
  trapOwnerAt,
  winner,
} from './rules';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  pieceLabels,
  type JungleMove,
  type JunglePiece,
  type JunglePlayer,
  type JungleState,
} from './state';
import { rankJungleMoves } from './strategy';
import { init } from './state';

interface AIMovePayload {
  id?: unknown;
  moveId?: unknown;
  move_id?: unknown;
}

function sideFor(player: number): 'red' | 'blue' {
  return player === 0 ? 'red' : 'blue';
}

function opponentOf(player: number): JunglePlayer {
  return player === 0 ? 1 : 0;
}

function opponentDen(player: number) {
  return player === 0 ? { x: 3, y: 0 } : { x: 3, y: 8 };
}

function coordinateName(coord: { x: number; y: number }): string {
  return `${String.fromCharCode(65 + coord.x)}${coord.y + 1}`;
}

function distance(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function pieceById(
  state: JungleState,
  pieceId: string | undefined,
): JunglePiece | undefined {
  return pieceId
    ? state.pieces.find((piece) => piece.id === pieceId)
    : undefined;
}

function publicPiece(piece: JunglePiece) {
  return {
    id: piece.id,
    side: sideFor(piece.owner),
    type: piece.type,
    name: pieceLabels[piece.type].en,
    rank: piece.rank,
    x: piece.x,
    y: piece.y,
    terrain: terrainAt(piece),
  };
}

function publicState(state: JungleState) {
  return {
    seed: state.seed,
    current: state.current,
    currentSide: sideFor(state.current),
    turn: state.turn,
    winner: state.winner,
    board: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      coordinates:
        'x is 0-6 left-to-right, y is 0-8 top-to-bottom from Blue side. A1 is x=0,y=0.',
      blueDen: { x: 3, y: 0 },
      redDen: { x: 3, y: 8 },
      water:
        'Rivers are x=1,2 and x=4,5 on y=3,4,5. Only rats enter water; lions and tigers may jump across if no rat blocks the river.',
    },
    pieces: activePieces(state).map(publicPiece),
    captured: state.pieces
      .filter((piece) => piece.captured)
      .map((piece) => ({
        id: piece.id,
        side: sideFor(piece.owner),
        type: piece.type,
        rank: piece.rank,
      })),
  };
}

function moveAnnotation(state: JungleState, player: number, move: JungleMove) {
  const evaluation = rankJungleMoves(state, player, [move])[0];
  const piece = pieceById(state, move.pieceId);
  const captured = pieceById(state, move.capturedId);
  const targetDen = opponentDen(player);
  const beforeDistance = piece ? distance(piece, targetDen) : 0;
  const afterDistance = distance(move.to, targetDen);
  const destinationTerrain = terrainAt(move.to);
  const destinationTrapOwner = trapOwnerAt(move.to);
  const entersOpponentDen = denOwnerAt(move.to) === opponentOf(player);
  const next = applyMove(state, move);
  const movedPieceAfter = pieceById(next, move.pieceId);
  const opponentMoves = next.winner === null ? legalMoves(next, opponentOf(player)) : [];
  const canBeCapturedNext = movedPieceAfter
    ? opponentMoves.some((reply) => reply.capturedId === movedPieceAfter.id)
    : false;
  const givesOpponentDenWin = opponentMoves.some(
    (reply) => denOwnerAt(reply.to) === player,
  );
  const notes = [
    entersOpponentDen ? 'wins immediately by entering the opponent den' : '',
    captured
      ? `captures ${sideFor(captured.owner)} ${pieceLabels[captured.type].en} rank ${captured.rank}`
      : '',
    destinationTrapOwner === opponentOf(player)
      ? 'moves into an enemy trap and becomes rank 0 while there'
      : '',
    destinationTrapOwner === player
      ? 'moves into your own trap square, useful for defending the den'
      : '',
    canBeCapturedNext ? 'opponent has an immediate legal capture on this piece' : '',
    givesOpponentDenWin ? 'allows an immediate opponent den-entry threat' : '',
  ].filter(Boolean);

  return {
    id: move.id,
    pieceId: move.pieceId,
    piece: piece
      ? {
          side: sideFor(piece.owner),
          type: piece.type,
          name: pieceLabels[piece.type].en,
          rank: piece.rank,
        }
      : undefined,
    from: {
      ...move.from,
      name: coordinateName(move.from),
      terrain: terrainAt(move.from),
    },
    to: {
      ...move.to,
      name: coordinateName(move.to),
      terrain: destinationTerrain,
    },
    captured: captured
      ? {
          id: captured.id,
          side: sideFor(captured.owner),
          type: captured.type,
          name: pieceLabels[captured.type].en,
          rank: captured.rank,
        }
      : null,
    tactical: {
      heuristicScore: evaluation?.score ?? 0,
      entersOpponentDen,
      distanceToOpponentDenBefore: beforeDistance,
      distanceToOpponentDenAfter: afterDistance,
      progressTowardOpponentDen: beforeDistance - afterDistance,
      canBeCapturedNext,
      givesOpponentDenWin,
      reasons: evaluation?.reasons ?? [],
      risks: evaluation?.risks ?? [],
      notes,
    },
    summary: `${piece ? pieceLabels[piece.type].en : move.pieceId} ${coordinateName(move.from)} to ${coordinateName(move.to)}${
      captured ? ` captures ${pieceLabels[captured.type].en}` : ''
    }${notes.length ? ` (${notes.join('; ')})` : ''}`,
  };
}

function jsonObjectFromResponse(response: string): string {
  const trimmed = response.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    return candidate;
  }

  return candidate.slice(start, end + 1);
}

export const jungleChessAdapter: GameAdapter<JungleState, JungleMove> = {
  meta: games.find((game) => game.id === 'jungle-chess') ?? {
    id: 'jungle-chess',
    name: '斗兽棋',
    description: 'Move ranked animal pieces across rivers, traps, and dens.',
    minPlayers: 2,
    maxPlayers: 2,
    hiddenInformation: false,
    estimatedAITurnTokens: 350,
    docPath: 'https://en.wikipedia.org/wiki/Jungle_(board_game)',
  },
  init,
  legalMoves,
  applyMove,
  currentPlayer,
  isTerminal,
  winner,
  systemPrompt() {
    return [
      'You are playing 斗兽棋, also known as Jungle Chess or Dou Shou Qi.',
      'The game is open information. You receive the board state and an enumerated list of legal moves.',
      'Choose exactly one legal move by ID and respond with one JSON object: {"moveId":"..."}',
      'Do not include prose, markdown, or explanation outside the JSON.',
      'Rules summary: Red starts near y=8 and wins by entering the Blue den at x=3,y=0. Blue starts near y=0 and wins by entering the Red den at x=3,y=8. A player also wins by capturing all enemy animals.',
      'Pieces move one orthogonal square, except lions and tigers can jump straight across a river if no rat is in the crossed water squares. Only rats may enter water.',
      'Ranks from low to high are rat 1, cat 2, dog 3, wolf 4, leopard 5, tiger 6, lion 7, elephant 8. A piece captures an enemy on its destination if its rank is greater or equal. Rat can capture elephant. Elephant cannot capture rat. Rats in water cannot capture land pieces or be captured by land pieces.',
      'A piece in an opponent trap has effective rank 0 and can be captured by any enemy piece. You may not enter your own den.',
      'Strategic priorities: choose an immediate den-entry win; prevent opponent den-entry wins; prefer high heuristicScore moves unless a specific tactic overrides it; capture high-rank pieces when the moved piece is not immediately recaptured; use traps to make enemy pieces vulnerable; advance lion and tiger lanes toward the den; keep your own den protected; use rats to contest water and threaten elephants.',
    ].join(' ');
  },
  serializeForAI(state, player, moves) {
    return JSON.stringify({
      game: 'jungle-chess',
      player,
      side: sideFor(player),
      objective:
        player === 0
          ? 'Red: reach the Blue den at x=3,y=0.'
          : 'Blue: reach the Red den at x=3,y=8.',
      rules: {
        win:
          'Enter the opposing den or capture every opposing animal. You may not enter your own den.',
        movement:
          'Move one orthogonal square. Lions and tigers may jump straight across a river if no rat blocks the crossed water squares.',
        water:
          'Only rats enter water. Rats in water interact only with other rats in water, not land pieces.',
        capture:
          'Capture if attacker rank is greater than or equal to defender rank, except rat captures elephant and elephant cannot capture rat.',
        traps:
          'A piece in an opponent trap has effective rank 0 and can be captured by any enemy.',
      },
      state: publicState(state),
      strategy: {
        recommendation:
          'Prefer a topCandidate unless its risks clearly lose material or the den. Avoid avoidMoveIds unless all alternatives are worse.',
        topCandidates: rankJungleMoves(state, player, moves)
          .slice(0, 5)
          .map((entry) => ({
            moveId: entry.move.id,
            score: entry.score,
            reasons: entry.reasons,
            risks: entry.risks,
          })),
        avoidMoveIds: rankJungleMoves(state, player, moves)
          .filter((entry) =>
            entry.risks.some(
              (risk) =>
                risk.includes('opponent den-entry') ||
                risk.includes('enemy trap'),
            ),
          )
          .map((entry) => entry.move.id),
      },
      legalMoves: moves.map((move) => moveAnnotation(state, player, move)),
    });
  },
  parseAIMove(response, moves) {
    let payload: AIMovePayload;
    try {
      payload = JSON.parse(jsonObjectFromResponse(response)) as AIMovePayload;
    } catch {
      return { ok: false, error: 'Response is not valid JSON.' };
    }

    const moveId = payload.moveId ?? payload.move_id ?? payload.id;
    if (typeof moveId !== 'string') {
      return { ok: false, error: 'Response must include a string moveId.' };
    }

    const move = moves.find((candidate) => candidate.id === moveId);
    if (!move) {
      return { ok: false, error: `Move ${moveId} is not legal.` };
    }

    return { ok: true, move };
  },
};

export default jungleChessAdapter;
