import {
  activePieces,
  applyMove,
  generalFor,
  isRiverCrossed,
  legalMoves,
} from './rules';
import {
  pieceLabels,
  type ChineseChessMove,
  type ChineseChessPiece,
  type ChineseChessPlayer,
  type ChineseChessState,
  type Coord,
} from './state';

export interface ChineseChessMoveEvaluation {
  move: ChineseChessMove;
  score: number;
  reasons: string[];
  risks: string[];
}

function opponentOf(player: ChineseChessPlayer): ChineseChessPlayer {
  return player === 0 ? 1 : 0;
}

function distance(left: Coord, right: Coord): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function pieceValue(piece: ChineseChessPiece): number {
  const values: Record<string, number> = {
    general: 10000,
    advisor: 250,
    elephant: 250,
    horse: 400,
    chariot: 900,
    cannon: 450,
    soldier: 100,
  };
  return values[piece.type] ?? 100;
}

function pieceById(
  state: ChineseChessState,
  pieceId: string | undefined,
): ChineseChessPiece | undefined {
  return pieceId
    ? state.pieces.find((piece) => piece.id === pieceId)
    : undefined;
}

function activePieceById(
  state: ChineseChessState,
  pieceId: string,
): ChineseChessPiece | undefined {
  return activePieces(state).find((piece) => piece.id === pieceId);
}

function materialFor(state: ChineseChessState, player: ChineseChessPlayer): number {
  return activePieces(state, player).reduce(
    (sum, piece) => sum + pieceValue(piece),
    0,
  );
}

function centerProximity(piece: ChineseChessPiece): number {
  const centerX = 4;
  const distFromCenter = Math.abs(piece.x - centerX);
  if (distFromCenter <= 1) return 15;
  if (distFromCenter <= 2) return 8;
  return 0;
}

function forwardMobility(state: ChineseChessState, piece: ChineseChessPiece): number {
  const ownMoves = legalMoves(state, piece.owner).filter(
    (m) => m.pieceId === piece.id,
  );
  return ownMoves.length * 3;
}

function soldierAdvancement(piece: ChineseChessPiece): number {
  if (piece.type !== 'soldier') return 0;
  // Reward soldiers that have crossed the river or are close
  if (isRiverCrossed(piece, piece.owner)) {
    // Further forward = better
    const forwardProgress = piece.owner === 0 ? 9 - piece.y : piece.y;
    return forwardProgress * 15;
  }
  // Before crossing, closeness to river
  const distToRiver = piece.owner === 0 ? piece.y - 5 : 4 - piece.y;
  return Math.max(0, -distToRiver * 5);
}

function positionalScore(state: ChineseChessState, player: ChineseChessPlayer): number {
  return activePieces(state, player).reduce((sum, piece) => {
    let s = centerProximity(piece) + forwardMobility(state, piece) + soldierAdvancement(piece);
    if (piece.type === 'general') {
      // Slightly prefer general to stay in palace center
      if (piece.x === 4 && (piece.y === 0 || piece.y === 9 || piece.y === 1 || piece.y === 8)) {
        s += 20;
      }
    }
    return sum + s;
  }, 0);
}

function moveSummary(state: ChineseChessState, move: ChineseChessMove): string {
  const piece = pieceById(state, move.pieceId);
  const captured = pieceById(state, move.capturedId);
  const pieceName = piece ? pieceLabels[piece.type].en : move.pieceId;
  const capture = captured ? ` captures ${pieceLabels[captured.type].en}` : '';

  return `${pieceName} to ${move.to.x},${move.to.y}${capture}`;
}

export function evaluateChineseChessMove(
  state: ChineseChessState,
  player: number,
  move: ChineseChessMove,
): ChineseChessMoveEvaluation {
  const currentPlayer = player as ChineseChessPlayer;
  const opponent = opponentOf(currentPlayer);
  const piece = pieceById(state, move.pieceId);
  const captured = pieceById(state, move.capturedId);
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  if (!piece) {
    return { move, score: -100000, reasons: [], risks: ['Missing piece.'] };
  }

  const after = applyMove(state, move);

  if (after.winner === currentPlayer) {
    return {
      move,
      score: 100000,
      reasons: ['Checkmate.'],
      risks: [],
    };
  }

  // Material evaluation
  const beforeMaterial = materialFor(state, currentPlayer) - materialFor(state, opponent);
  const afterMaterial = materialFor(after, currentPlayer) - materialFor(after, opponent);
  const materialSwing = afterMaterial - beforeMaterial;
  if (materialSwing !== 0) {
    score += materialSwing * 10;
    reasons.push(`Material change: ${materialSwing > 0 ? '+' : ''}${materialSwing}.`);
  }

  if (captured) {
    const captureScore = pieceValue(captured) * 8;
    score += captureScore;
    reasons.push(`Captures ${pieceLabels[captured.type].en} worth ${pieceValue(captured)}.`);
  }

  // Positional evaluation
  const beforePos = positionalScore(state, currentPlayer) - positionalScore(state, opponent);
  const afterPos = positionalScore(after, currentPlayer) - positionalScore(after, opponent);
  const posSwing = afterPos - beforePos;
  if (posSwing !== 0) {
    score += posSwing;
    if (posSwing > 0) {
      reasons.push('Improves position.');
    }
  }

  // Check bonus
  if (after.isCheck) {
    score += 80;
    reasons.push('Gives check.');
  }

  // Move piece toward opponent general
  const oppGeneral = generalFor(state, opponent);
  if (oppGeneral) {
    const beforeDist = distance(piece, oppGeneral);
    const afterDist = distance(move.to, oppGeneral);
    const progress = beforeDist - afterDist;
    if (progress > 0) {
      score += progress * 6;
      reasons.push(`Moves ${progress} steps closer to the general.`);
    } else if (progress < 0) {
      score += progress * 2;
    }
  }

  // Develop minor pieces early
  if (piece.type === 'horse' || piece.type === 'cannon') {
    const ownBackRank = piece.owner === 0 ? 9 : 0;
    if (piece.y === ownBackRank) {
      score += 25;
      reasons.push('Develops a piece from the back rank.');
    }
  }

  // River crossing bonus for soldiers
  if (piece.type === 'soldier' && !isRiverCrossed(piece, piece.owner)) {
    if (isRiverCrossed(move.to, piece.owner)) {
      score += 40;
      reasons.push('Soldier crosses the river.');
    }
  }

  // Risks: can moved piece be captured?
  const movedPieceAfter = activePieceById(after, move.pieceId);
  if (movedPieceAfter) {
    const oppMoves = legalMoves(after, opponent);
    const canBeCaptured = oppMoves.some((m) => m.capturedId === movedPieceAfter.id);
    if (canBeCaptured) {
      const riskValue = pieceValue(movedPieceAfter) * 2;
      score -= riskValue;
      risks.push(`Moved ${pieceLabels[movedPieceAfter.type].en} can be captured next turn.`);
    }
  }

  if (reasons.length === 0) {
    reasons.push(`Legal positional move: ${moveSummary(state, move)}.`);
  }

  return { move, score: Math.round(score), reasons, risks };
}

export function rankChineseChessMoves(
  state: ChineseChessState,
  player: number,
  moves: ChineseChessMove[] = legalMoves(state, player),
): ChineseChessMoveEvaluation[] {
  return moves
    .map((move) => evaluateChineseChessMove(state, player, move))
    .sort(
      (left, right) =>
        right.score - left.score || left.move.id.localeCompare(right.move.id),
    );
}

export function chooseStrategicChineseChessMove(opts: {
  state: ChineseChessState;
  player: number;
  legalMoves: ChineseChessMove[];
}): ChineseChessMove {
  const best = rankChineseChessMoves(opts.state, opts.player, opts.legalMoves)[0];
  if (!best) {
    throw new Error('No legal Chinese Chess move is available.');
  }

  return best.move;
}
