import { activePieces, applyMove, legalMoves } from './rules';
import {
  opponentOf,
  pieceLabels,
  type ChessMove,
  type ChessPiece,
  type ChessPlayer,
  type ChessState,
} from './state';

export interface ChessMoveEvaluation {
  move: ChessMove;
  score: number;
  reasons: string[];
  risks: string[];
}

const INF = 1_000_000;
const SEARCH_DEPTH = 2;

const pieceValues: Record<ChessPiece['type'], number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20_000,
};

function pieceValue(piece: Pick<ChessPiece, 'type'>): number {
  return pieceValues[piece.type];
}

function materialFor(state: ChessState, player: ChessPlayer): number {
  return activePieces(state, player).reduce(
    (sum, piece) => sum + pieceValue(piece),
    0,
  );
}

function centerControl(piece: ChessPiece): number {
  const distX = Math.abs(piece.x - 3.5);
  const distY = Math.abs(piece.y - 3.5);
  const center = Math.max(0, 4 - (distX + distY));
  return Math.round(center * (piece.type === 'pawn' ? 4 : 8));
}

function advancement(piece: ChessPiece): number {
  if (piece.type !== 'pawn') {
    return 0;
  }

  return piece.owner === 0 ? (6 - piece.y) * 9 : (piece.y - 1) * 9;
}

function kingSafety(piece: ChessPiece, state: ChessState): number {
  if (piece.type !== 'king') {
    return 0;
  }

  const earlyGame = state.turn < 18;
  const homeRank = piece.owner === 0 ? 7 : 0;
  if (earlyGame && piece.y === homeRank && (piece.x === 6 || piece.x === 2)) {
    return 35;
  }
  if (earlyGame && piece.y === homeRank) {
    return 12;
  }
  return 0;
}

function positionalFor(state: ChessState, player: ChessPlayer): number {
  return activePieces(state, player).reduce(
    (sum, piece) => sum + centerControl(piece) + advancement(piece) + kingSafety(piece, state),
    0,
  );
}

function staticEvaluation(state: ChessState, player: ChessPlayer): number {
  if (state.winner !== null) {
    return state.winner === player ? INF : -INF;
  }
  if (state.status !== 'active') {
    return 0;
  }

  const opponent = opponentOf(player);
  return (
    materialFor(state, player) -
    materialFor(state, opponent) +
    positionalFor(state, player) -
    positionalFor(state, opponent) +
    (state.isCheck && state.current === opponent ? 45 : 0) -
    (state.isCheck && state.current === player ? 55 : 0)
  );
}

function capturedValue(state: ChessState, move: ChessMove): number {
  if (!move.captured) {
    return 0;
  }

  const attacker = activePieces(state).find(
    (piece) =>
      piece.square === move.fromSquare && piece.owner === move.owner,
  );
  return pieceValues[move.captured] * 10 - (attacker ? pieceValue(attacker) : 0);
}

function orderMoves(state: ChessState, moves: ChessMove[]): ChessMove[] {
  return [...moves].sort((left, right) => {
    const rightScore =
      capturedValue(state, right) +
      (right.isPromotion ? 800 : 0) +
      (right.isCheckmate ? INF : right.isCheck ? 120 : 0);
    const leftScore =
      capturedValue(state, left) +
      (left.isPromotion ? 800 : 0) +
      (left.isCheckmate ? INF : left.isCheck ? 120 : 0);
    return rightScore - leftScore || left.id.localeCompare(right.id);
  });
}

function alphaBeta(
  state: ChessState,
  depth: number,
  alpha: number,
  beta: number,
  rootPlayer: ChessPlayer,
): number {
  if (state.winner !== null) {
    return state.winner === rootPlayer ? INF : -INF;
  }
  if (state.status !== 'active' || depth === 0) {
    return staticEvaluation(state, rootPlayer);
  }

  const moves = orderMoves(state, legalMoves(state, state.current));
  if (moves.length === 0) {
    return staticEvaluation(state, rootPlayer);
  }

  if (state.current === rootPlayer) {
    let best = -INF;
    for (const move of moves) {
      best = Math.max(
        best,
        alphaBeta(applyMove(state, move), depth - 1, alpha, beta, rootPlayer),
      );
      alpha = Math.max(alpha, best);
      if (alpha >= beta) {
        break;
      }
    }
    return best;
  }

  let best = INF;
  for (const move of moves) {
    best = Math.min(
      best,
      alphaBeta(applyMove(state, move), depth - 1, alpha, beta, rootPlayer),
    );
    beta = Math.min(beta, best);
    if (alpha >= beta) {
      break;
    }
  }
  return best;
}

export function evaluateChessMove(
  state: ChessState,
  player: number,
  move: ChessMove,
): ChessMoveEvaluation {
  const currentPlayer = player as ChessPlayer;
  const opponent = opponentOf(currentPlayer);
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  const beforeMaterial =
    materialFor(state, currentPlayer) - materialFor(state, opponent);
  const after = applyMove(state, move);

  if (after.winner === currentPlayer) {
    return { move, score: INF, reasons: ['Checkmate.'], risks: [] };
  }

  if (move.captured) {
    const value = pieceValues[move.captured];
    score += value * 8;
    reasons.push(`Captures ${pieceLabels[move.captured].en} worth ${value}.`);
  }

  if (move.isPromotion && move.promotion) {
    score += pieceValues[move.promotion] - pieceValues.pawn;
    reasons.push(`Promotes to ${pieceLabels[move.promotion].en}.`);
  }

  if (after.isCheck) {
    score += 90;
    reasons.push('Gives check.');
  }

  if (move.isCastle) {
    score += 55;
    reasons.push('Castles to improve king safety.');
  }

  const afterMaterial =
    materialFor(after, currentPlayer) - materialFor(after, opponent);
  const materialSwing = afterMaterial - beforeMaterial;
  if (materialSwing !== 0) {
    score += materialSwing * 4;
  }

  const positionalSwing =
    positionalFor(after, currentPlayer) -
    positionalFor(after, opponent) -
    (positionalFor(state, currentPlayer) - positionalFor(state, opponent));
  if (positionalSwing > 0) {
    score += positionalSwing;
    reasons.push('Improves piece activity.');
  } else {
    score += positionalSwing;
  }

  const opponentMoves = after.status === 'active' ? legalMoves(after, opponent) : [];
  const canBeCaptured = opponentMoves.some(
    (reply) => reply.toSquare === move.toSquare,
  );
  if (canBeCaptured && move.piece !== 'king') {
    const riskValue = pieceValues[move.piece] * 2;
    score -= riskValue;
    risks.push(`Moved ${pieceLabels[move.piece].en} can be captured next turn.`);
  }

  if (reasons.length === 0) {
    reasons.push(`Develops ${pieceLabels[move.piece].en} to ${move.toSquare}.`);
  }

  return { move, score: Math.round(score), reasons, risks };
}

export function rankChessMoves(
  state: ChessState,
  player: number,
  moves: ChessMove[] = legalMoves(state, player),
): ChessMoveEvaluation[] {
  return moves
    .map((move) => evaluateChessMove(state, player, move))
    .sort(
      (left, right) =>
        right.score - left.score || left.move.id.localeCompare(right.move.id),
    );
}

export function chooseStrategicChessMove(opts: {
  state: ChessState;
  player: number;
  legalMoves: ChessMove[];
}): ChessMove {
  const player = opts.player as ChessPlayer;
  const ordered = orderMoves(opts.state, opts.legalMoves);
  if (!ordered.length) {
    throw new Error('No legal chess move is available.');
  }

  let bestMove = ordered[0]!;
  let bestScore = -INF - 1;
  let alpha = -INF;

  for (const move of ordered) {
    const score = alphaBeta(
      applyMove(opts.state, move),
      SEARCH_DEPTH - 1,
      alpha,
      INF,
      player,
    );
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      alpha = Math.max(alpha, score);
    }
    if (bestScore >= INF) {
      break;
    }
  }

  return bestMove;
}
