import type { GameAdapter } from '@/lib/games/shared/types';
import { games } from '@/lib/games/registry';
import {
  activePieces,
  applyMove,
  currentPlayer,
  generalFor,
  inPalace,
  isRiverCrossed,
  isTerminal,
  legalMoves,
  winner,
} from './rules';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  formatChineseNotation,
  pieceLabels,
  sideName,
  type ChineseChessMove,
  type ChineseChessPiece,
  type ChineseChessPlayer,
  type ChineseChessState,
} from './state';
import { rankChineseChessMoves } from './strategy';
import { init } from './state';

interface AIMovePayload {
  id?: unknown;
  moveId?: unknown;
  move_id?: unknown;
}

function sideFor(player: number): 'red' | 'black' {
  return player === 0 ? 'red' : 'black';
}

function opponentOf(player: number): ChineseChessPlayer {
  return player === 0 ? 1 : 0;
}

function coordinateName(coord: { x: number; y: number }): string {
  const redFiles = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];
  return `${redFiles[coord.x] ?? String(coord.x + 1)}${coord.y + 1}`;
}

function pieceLabelFull(piece: ChineseChessPiece): string {
  const label = pieceLabels[piece.type];
  const char = piece.owner === 0 ? label.zhRed : label.zhBlack;
  return `${sideName(piece.owner)} ${char} (${label.en})`;
}

function publicPiece(piece: ChineseChessPiece) {
  const label = pieceLabels[piece.type];
  return {
    id: piece.id,
    side: sideFor(piece.owner),
    type: piece.type,
    character: piece.owner === 0 ? label.zhRed : label.zhBlack,
    name: label.en,
    x: piece.x,
    y: piece.y,
    xRelative: piece.owner === 0 ? piece.x : BOARD_WIDTH - 1 - piece.x,
    inPalace: inPalace(piece, piece.owner),
    crossedRiver: isRiverCrossed(piece, piece.owner),
  };
}

function publicState(state: ChineseChessState) {
  const currentGen = generalFor(state, state.current);
  const oppGen = generalFor(state, opponentOf(state.current));
  return {
    seed: state.seed,
    current: state.current,
    currentSide: sideFor(state.current),
    turn: state.turn,
    winner: state.winner,
    isCheck: state.isCheck,
    board: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      coordinates:
        'x is 0-8 left-to-right from Red perspective. y is 0-9 top-to-bottom. Red general starts at x=4,y=9. Black general starts at x=4,y=0. The river is between y=4 and y=5.',
      redPalace: 'y=7,8,9 and x=3,4,5',
      blackPalace: 'y=0,1,2 and x=3,4,5',
      river: 'Between rows 4 and 5. Soldiers gain horizontal movement after crossing.',
    },
    pieces: activePieces(state).map(publicPiece),
    currentGeneralPosition: currentGen ? { x: currentGen.x, y: currentGen.y } : null,
    opponentGeneralPosition: oppGen ? { x: oppGen.x, y: oppGen.y } : null,
    captured: state.pieces
      .filter((piece) => piece.captured)
      .map((piece) => ({
        id: piece.id,
        side: sideFor(piece.owner),
        type: piece.type,
        name: pieceLabels[piece.type].en,
      })),
  };
}

function moveAnnotation(
  state: ChineseChessState,
  player: number,
  move: ChineseChessMove,
  precomputedRanked?: Map<string, { score: number; reasons: string[]; risks: string[] }>,
) {
  const evaluation = precomputedRanked?.get(move.id);
  const piece = state.pieces.find((p) => p.id === move.pieceId);
  const captured = state.pieces.find((p) => p.id === move.capturedId);
  const notation = piece
    ? formatChineseNotation(piece, move.from, move.to)
    : `${move.from.x},${move.from.y} -> ${move.to.x},${move.to.y}`;

  const next = applyMove(state, move);
  const movedPieceAfter = next.pieces.find(
    (p) => p.id === move.pieceId && !p.captured,
  );
  const opponentMoves =
    next.winner === null ? legalMoves(next, opponentOf(player)) : [];
  const canBeCapturedNext = movedPieceAfter
    ? opponentMoves.some((reply) => reply.capturedId === movedPieceAfter.id)
    : false;

  const notes = [
    next.winner === player ? 'delivers checkmate' : '',
    next.isCheck ? 'gives check' : '',
    captured ? `captures ${pieceLabelFull(captured)}` : '',
    canBeCapturedNext
      ? 'the moved piece can be captured by opponent next turn'
      : '',
  ].filter(Boolean);

  return {
    id: move.id,
    pieceId: move.pieceId,
    piece: piece
      ? {
          side: sideFor(piece.owner),
          type: piece.type,
          character: piece.owner === 0 ? pieceLabels[piece.type].zhRed : pieceLabels[piece.type].zhBlack,
          name: pieceLabels[piece.type].en,
        }
      : undefined,
    from: {
      ...move.from,
      name: coordinateName(move.from),
    },
    to: {
      ...move.to,
      name: coordinateName(move.to),
    },
    captured: captured
      ? {
          id: captured.id,
          side: sideFor(captured.owner),
          type: captured.type,
          name: pieceLabels[captured.type].en,
        }
      : null,
    notation,
    tactical: {
      heuristicScore: evaluation?.score ?? 0,
      canBeCapturedNext,
      reasons: evaluation?.reasons ?? [],
      risks: evaluation?.risks ?? [],
      notes,
    },
    summary: `${notation}${notes.length ? ` (${notes.join('; ')})` : ''}`,
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

export const chineseChessAdapter: GameAdapter<
  ChineseChessState,
  ChineseChessMove
> = {
  meta:
    games.find((game) => game.id === 'chinese-chess') ?? {
      id: 'chinese-chess',
      name: '象棋',
      description:
        'Cross the river, protect your general, and checkmate the opponent in traditional Chinese Chess.',
      minPlayers: 2,
      maxPlayers: 2,
      hiddenInformation: false,
      estimatedAITurnTokens: 450,
      docPath: 'https://en.wikipedia.org/wiki/Xiangqi',
    },
  init,
  legalMoves,
  applyMove,
  currentPlayer,
  isTerminal,
  winner,
  systemPrompt() {
    return [
      'You are playing 象棋 (Xiangqi / Chinese Chess).',
      'The game is open information. You receive the board state and an enumerated list of legal moves.',
      'Choose exactly one legal move by ID and respond with one JSON object: {"moveId":"..."}',
      'Do not include prose, markdown, or explanation outside the JSON.',
      'Rules summary: Red (bottom/0) vs Black (top/1). The board is 9x10 with a river between rows 4 and 5. Each side has a 3x3 palace.',
      'Pieces and movement: General (帥/將) moves one orthogonal step within the palace. Advisors (仕/士) move one diagonal step within the palace. Elephants (相/象) move two diagonal steps and cannot cross the river; blocked by the "elephant eye" (the intermediate square). Horses (傌/馬) move one orthogonal then one diagonal (L-shape) and are blocked by the "horse leg" piece on the orthogonal step. Chariots (俥/車) move any distance orthogonally like a rook. Cannons (炮/砲) move like chariots but must jump exactly one piece (platform) to capture. Soldiers (兵/卒) move one step forward; after crossing the river they may also move one step horizontally.',
      'Capture by landing on an opponent piece. You may not capture your own pieces.',
      'Flying general: if the two generals face each other on the same file with no pieces between, the general that exposes this line loses immediately (the opposing general can capture).',
      'Check and checkmate: a player may not make a move that leaves their own general in check. If a player has no legal moves, they are checkmated and lose.',
      'Strategic priorities: develop chariots and horses early; control the center; protect the general with advisors and elephants; use cannons for long-range threats; advance soldiers across the river to limit enemy movement; set up checkmate patterns; avoid hanging pieces; prefer high heuristicScore moves unless a tactic overrides it.',
    ].join(' ');
  },
  serializeForAI(state, player, moves) {
    return JSON.stringify({
      game: 'chinese-chess',
      player,
      side: sideFor(player),
      objective:
        player === 0
          ? 'Red: checkmate the Black general.'
          : 'Black: checkmate the Red general.',
      rules: {
        win: 'Checkmate the opponent general (no legal moves for them). Also wins if the opponent general is captured.',
        movement:
          'General: 1 orthogonal step in palace. Advisor: 1 diagonal in palace. Elephant: 2 diagonal, no river crossing, blocked by eye. Horse: L-shape, blocked by leg. Chariot: any orthogonal distance. Cannon: any orthogonal distance, captures by jumping exactly one piece. Soldier: 1 forward, gains horizontal after crossing river.',
        flyingGeneral:
          'Generals may not face each other on the same file with no pieces between.',
        check: 'A player may not leave their general in check. No legal moves = checkmate.',
      },
      state: publicState(state),
      strategy: {
        recommendation:
          'Prefer a topCandidate unless its risks clearly lose material or the game. Avoid avoidMoveIds unless all alternatives are worse.',
        topCandidates: rankChineseChessMoves(state, player, moves)
          .slice(0, 5)
          .map((entry) => ({
            moveId: entry.move.id,
            score: entry.score,
            reasons: entry.reasons,
            risks: entry.risks,
          })),
        avoidMoveIds: rankChineseChessMoves(state, player, moves)
          .filter((entry) =>
            entry.risks.some(
              (risk) =>
                risk.includes('captured next turn') ||
                risk.includes('check'),
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

export default chineseChessAdapter;
