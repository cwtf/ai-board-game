import type { GameAdapter } from '@/lib/games/shared/types';
import { games } from '@/lib/games/registry';
import {
  activePieces,
  applyMove,
  currentPlayer,
  hydrateState,
  isTerminal,
  legalMoves,
  winner,
} from './rules';
import {
  BOARD_SIZE,
  coordinateLabel,
  init,
  pieceGlyph,
  pieceLabels,
  type ChessMove,
  type ChessPiece,
  type ChessState,
} from './state';
import { rankChessMoves } from './strategy';

interface AIMovePayload {
  id?: unknown;
  moveId?: unknown;
  move_id?: unknown;
}

function sideFor(player: number): 'white' | 'black' {
  return player === 0 ? 'white' : 'black';
}

function publicPiece(piece: ChessPiece) {
  return {
    id: piece.id,
    side: sideFor(piece.owner),
    type: piece.type,
    glyph: pieceGlyph(piece),
    name: pieceLabels[piece.type].en,
    square: piece.square,
    x: piece.x,
    y: piece.y,
  };
}

function publicState(state: ChessState) {
  const hydrated = hydrateState(state);
  return {
    seed: hydrated.seed,
    current: hydrated.current,
    currentSide: sideFor(hydrated.current),
    turn: hydrated.turn,
    winner: hydrated.winner,
    isCheck: hydrated.isCheck,
    status: hydrated.status,
    fen: hydrated.fen,
    pgn: hydrated.pgn,
    board: {
      width: BOARD_SIZE,
      height: BOARD_SIZE,
      coordinates:
        'x is 0-7 from a-file to h-file. y is 0-7 from rank 8 to rank 1. White starts at y=6 and y=7; Black starts at y=0 and y=1.',
      squareNames:
        'Use algebraic squares such as e2, e4, g1, f3. White moves toward lower y values; Black moves toward higher y values.',
    },
    pieces: activePieces(hydrated).map(publicPiece),
    lastMove: hydrated.lastMove
      ? {
          id: hydrated.lastMove.id,
          san: hydrated.lastMove.san,
          from: hydrated.lastMove.fromSquare,
          to: hydrated.lastMove.toSquare,
        }
      : null,
  };
}

function moveAnnotation(
  state: ChessState,
  player: number,
  move: ChessMove,
  precomputedRanked?: Map<string, { score: number; reasons: string[]; risks: string[] }>,
) {
  const hydrated = hydrateState(state);
  const evaluation = precomputedRanked?.get(move.id);
  const piece = activePieces(hydrated).find(
    (candidate) => candidate.square === move.fromSquare,
  );
  const next = applyMove(hydrated, move);
  const opponentMoves =
    next.status === 'active' ? legalMoves(next, next.current) : [];
  const canDestinationBeCaptured = opponentMoves.some(
    (reply) => reply.toSquare === move.toSquare,
  );
  const notes = [
    next.winner === player ? 'delivers checkmate' : '',
    next.isCheck ? 'gives check' : '',
    move.captured ? `captures ${pieceLabels[move.captured].en}` : '',
    move.isCastle ? 'castles the king' : '',
    move.isPromotion && move.promotion
      ? `promotes to ${pieceLabels[move.promotion].en}`
      : '',
    move.isEnPassant ? 'captures en passant' : '',
    canDestinationBeCaptured
      ? 'the moved piece can be captured by opponent next turn'
      : '',
  ].filter(Boolean);

  return {
    id: move.id,
    piece: piece
      ? {
          side: sideFor(piece.owner),
          type: piece.type,
          glyph: pieceGlyph(piece),
          name: pieceLabels[piece.type].en,
        }
      : {
          side: sideFor(move.owner),
          type: move.piece,
          name: pieceLabels[move.piece].en,
        },
    from: {
      ...move.from,
      square: move.fromSquare,
      name: coordinateLabel(move.from.x, move.from.y),
    },
    to: {
      ...move.to,
      square: move.toSquare,
      name: coordinateLabel(move.to.x, move.to.y),
    },
    san: move.san,
    lan: move.lan,
    captured: move.captured
      ? {
          type: move.captured,
          name: pieceLabels[move.captured].en,
        }
      : null,
    promotion: move.promotion
      ? {
          type: move.promotion,
          name: pieceLabels[move.promotion].en,
        }
      : null,
    tactical: {
      heuristicScore: evaluation?.score ?? 0,
      canDestinationBeCaptured,
      reasons: evaluation?.reasons ?? [],
      risks: evaluation?.risks ?? [],
      notes,
    },
    summary: `${move.san}${notes.length ? ` (${notes.join('; ')})` : ''}`,
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

export const chessAdapter: GameAdapter<ChessState, ChessMove> = {
  meta:
    games.find((game) => game.id === 'chess') ?? {
      id: 'chess',
      name: 'Chess',
      description:
        'Control the board, protect your king, and checkmate your opponent in classic chess.',
      minPlayers: 2,
      maxPlayers: 2,
      hiddenInformation: false,
      estimatedAITurnTokens: 500,
      docPath: 'https://en.wikipedia.org/wiki/Rules_of_chess',
    },
  init(opts) {
    return hydrateState(init(opts));
  },
  legalMoves,
  applyMove,
  currentPlayer,
  isTerminal,
  winner,
  systemPrompt() {
    return [
      'You are playing standard chess.',
      'The game is open information. You receive the board state and an enumerated list of legal moves.',
      'Choose exactly one legal move by ID and respond with one JSON object: {"moveId":"..."}',
      'Do not include prose, markdown, or explanation outside the JSON.',
      'Rules summary: White moves first. Pieces move by standard chess rules including castling, en passant, promotion, check, checkmate, stalemate, threefold repetition, insufficient material, and the fifty-move rule.',
      'A player may not make a move that leaves their own king in check. Checkmate wins. Stalemate and other draw states end without a winner.',
      'Strategic priorities: address check immediately; take forced checkmate; avoid hanging high-value pieces; develop knights and bishops; contest the center; castle before opening the king; promote pawns; prefer legal moves with high heuristicScore unless there is a concrete tactic.',
    ].join(' ');
  },
  serializeForAI(state, player, moves) {
    const ranked = rankChessMoves(state, player, moves);
    const rankedById = new Map(
      ranked.map((entry) => [
        entry.move.id,
        {
          score: entry.score,
          reasons: entry.reasons,
          risks: entry.risks,
        },
      ]),
    );

    return JSON.stringify({
      game: 'chess',
      player,
      side: sideFor(player),
      objective:
        player === 0
          ? 'White: checkmate the Black king.'
          : 'Black: checkmate the White king.',
      rules: {
        win: 'Checkmate the opponent king.',
        draw:
          'Stalemate, insufficient material, threefold repetition, and the fifty-move rule are draws.',
        movement:
          'Use standard chess movement. Castling, promotion, and en passant are included in the legal move list when available.',
        check:
          'You may not leave your own king in check. If in check, choose a legal move that resolves it.',
      },
      state: publicState(state),
      strategy: {
        recommendation:
          'Prefer a topCandidate unless its risks clearly lose material or miss an immediate tactical shot.',
        topCandidates: ranked.slice(0, 6).map((entry) => ({
          moveId: entry.move.id,
          san: entry.move.san,
          score: entry.score,
          reasons: entry.reasons,
          risks: entry.risks,
        })),
        avoidMoveIds: ranked
          .filter((entry) =>
            entry.risks.some((risk) => risk.includes('captured next turn')),
          )
          .map((entry) => entry.move.id),
      },
      legalMoves: moves.map((move) =>
        moveAnnotation(state, player, move, rankedById),
      ),
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

export default chessAdapter;
