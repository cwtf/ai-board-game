import {
  activePieces,
  applyMove,
  denOwnerAt,
  legalMoves,
  terrainAt,
  trapOwnerAt,
} from './rules';
import {
  pieceLabels,
  type Coord,
  type JungleMove,
  type JunglePiece,
  type JunglePlayer,
  type JungleState,
} from './state';

export interface JungleMoveEvaluation {
  move: JungleMove;
  score: number;
  reasons: string[];
  risks: string[];
}

function opponentOf(player: JunglePlayer): JunglePlayer {
  return player === 0 ? 1 : 0;
}

function opponentDen(player: JunglePlayer): Coord {
  return player === 0 ? { x: 3, y: 0 } : { x: 3, y: 8 };
}

function ownDen(player: JunglePlayer): Coord {
  return player === 0 ? { x: 3, y: 8 } : { x: 3, y: 0 };
}

function distance(left: Coord, right: Coord): number {
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

function activePieceById(
  state: JungleState,
  pieceId: string,
): JunglePiece | undefined {
  return activePieces(state).find((piece) => piece.id === pieceId);
}

function opponentHasElephant(state: JungleState, player: JunglePlayer): boolean {
  const opponent = opponentOf(player);
  return activePieces(state, opponent).some((piece) => piece.type === 'elephant');
}

function strategicPieceValue(
  state: JungleState,
  piece: JunglePiece,
): number {
  const base = piece.rank * piece.rank;
  if (piece.type === 'rat') {
    return base + (opponentHasElephant(state, piece.owner) ? 55 : 16);
  }
  if (piece.type === 'lion' || piece.type === 'tiger') {
    return base + 28;
  }
  if (piece.type === 'elephant') {
    return base + 12;
  }

  return base + 6;
}

function materialFor(state: JungleState, player: JunglePlayer): number {
  return activePieces(state, player).reduce(
    (sum, piece) => sum + strategicPieceValue(state, piece),
    0,
  );
}

function minDistanceToDen(state: JungleState, player: JunglePlayer): number {
  const den = opponentDen(player);
  const distances = activePieces(state, player).map((piece) =>
    distance(piece, den),
  );
  return distances.length ? Math.min(...distances) : 99;
}

function denGuardScore(state: JungleState, player: JunglePlayer): number {
  const den = ownDen(player);
  return activePieces(state, player).reduce((sum, piece) => {
    const guardDistance = distance(piece, den);
    if (guardDistance === 0) {
      return sum;
    }

    return sum + Math.max(0, 5 - guardDistance) * Math.min(piece.rank, 5);
  }, 0);
}

function immediateDenThreats(
  state: JungleState,
  player: JunglePlayer,
): JungleMove[] {
  return legalMoves(state, player).filter(
    (move) => denOwnerAt(move.to) === opponentOf(player),
  );
}

function canOpponentCapturePiece(
  state: JungleState,
  opponent: JunglePlayer,
  pieceId: string,
): boolean {
  return legalMoves(state, opponent).some((move) => move.capturedId === pieceId);
}

function hangingValue(state: JungleState, player: JunglePlayer): number {
  const threatenedIds = new Set(
    legalMoves(state, opponentOf(player))
      .map((move) => move.capturedId)
      .filter((pieceId): pieceId is string => Boolean(pieceId)),
  );

  return activePieces(state, player).reduce((sum, piece) => {
    return threatenedIds.has(piece.id)
      ? sum + strategicPieceValue(state, piece)
      : sum;
  }, 0);
}

function nearestEnemyOfType(
  state: JungleState,
  player: JunglePlayer,
  type: JunglePiece['type'],
  from: Coord,
): JunglePiece | undefined {
  return activePieces(state, opponentOf(player))
    .filter((piece) => piece.type === type)
    .sort((left, right) => distance(left, from) - distance(right, from))[0];
}

function moveSummary(state: JungleState, move: JungleMove): string {
  const piece = pieceById(state, move.pieceId);
  const captured = pieceById(state, move.capturedId);
  const pieceName = piece ? pieceLabels[piece.type].en : move.pieceId;
  const capture = captured ? ` captures ${pieceLabels[captured.type].en}` : '';

  return `${pieceName} to ${move.to.x},${move.to.y}${capture}`;
}

export function evaluateJungleMove(
  state: JungleState,
  player: number,
  move: JungleMove,
): JungleMoveEvaluation {
  const currentPlayer = player as JunglePlayer;
  const opponent = opponentOf(currentPlayer);
  const piece = pieceById(state, move.pieceId);
  const captured = pieceById(state, move.capturedId);
  const beforeMaterial =
    materialFor(state, currentPlayer) - materialFor(state, opponent);
  const beforeHangingValue = hangingValue(state, currentPlayer);
  const beforeDenDistance =
    minDistanceToDen(state, currentPlayer) -
    minDistanceToDen(state, opponent);
  const beforeOpponentDenThreats = immediateDenThreats(state, opponent).length;
  const after = applyMove(state, move);
  const movedPiece = activePieceById(after, move.pieceId);
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  if (!piece) {
    return { move, score: -100000, reasons: [], risks: ['Missing piece.'] };
  }

  if (after.winner === currentPlayer) {
    return {
      move,
      score: 100000,
      reasons: ['Wins immediately.'],
      risks: [],
    };
  }

  const afterMaterial =
    materialFor(after, currentPlayer) - materialFor(after, opponent);
  const materialSwing = afterMaterial - beforeMaterial;
  if (materialSwing !== 0) {
    score += materialSwing * 5;
    reasons.push(`Improves material by ${materialSwing}.`);
  }

  if (captured) {
    const captureScore = strategicPieceValue(state, captured) * 4;
    score += captureScore;
    reasons.push(`Captures ${pieceLabels[captured.type].en} rank ${captured.rank}.`);
  }

  const targetDen = opponentDen(currentPlayer);
  const progress = distance(piece, targetDen) - distance(move.to, targetDen);
  if (progress > 0) {
    score += progress * 14;
    reasons.push(`Moves ${progress} step${progress === 1 ? '' : 's'} closer to the den.`);
  } else if (progress < 0) {
    score += progress * 6;
    risks.push('Moves away from the opponent den.');
  }

  if (piece.type === 'lion' || piece.type === 'tiger') {
    if (progress > 0) {
      score += 12;
      reasons.push('Develops a long-range den attacker.');
    }
  }

  if (piece.type === 'rat' && terrainAt(move.to) === 'water') {
    score += 16;
    reasons.push('Uses the rat to contest river lanes.');
  }

  if (piece.type === 'rat' && opponentHasElephant(state, currentPlayer)) {
    const nearestElephant = nearestEnemyOfType(
      state,
      currentPlayer,
      'elephant',
      piece,
    );
    const ratApproachesElephant =
      nearestElephant &&
      !captured &&
      distance(move.to, nearestElephant) < distance(piece, nearestElephant);
    if (ratApproachesElephant) {
      const closeToElephant = distance(move.to, nearestElephant) <= 3;
      const penalty = closeToElephant ? 75 : 35;
      score -= penalty;
      risks.push(
        'Preserve the rat: it is your only elephant counter and should not beeline toward the elephant without a safe capture.',
      );
    }
  }

  if (trapOwnerAt(move.to) === currentPlayer) {
    score += 18;
    reasons.push('Occupies a friendly trap for den defense.');
  }

  if (trapOwnerAt(move.to) === opponent) {
    score -= 55;
    risks.push('Steps into an enemy trap and becomes rank 0.');
  }

  const afterOpponentDenThreats = immediateDenThreats(after, opponent);
  if (afterOpponentDenThreats.length > 0) {
    const penalty = afterOpponentDenThreats.length * 350;
    score -= penalty;
    risks.push('Allows an immediate opponent den-entry win.');
  } else if (beforeOpponentDenThreats > 0) {
    score += 140;
    reasons.push('Stops the opponent immediate den-entry threat.');
  }

  const afterOwnDenThreats = immediateDenThreats(after, currentPlayer).length;
  if (afterOwnDenThreats > 0) {
    score += afterOwnDenThreats * 260;
    reasons.push('Creates an immediate den-entry threat.');
  }

  if (movedPiece && canOpponentCapturePiece(after, opponent, movedPiece.id)) {
    const captureRisk =
      strategicPieceValue(after, movedPiece) * 3 +
      (captured ? strategicPieceValue(state, captured) : 0);
    score -= captureRisk;
    risks.push(`The moved ${pieceLabels[movedPiece.type].en} can be captured next.`);
  }

  const hangingValueDelta = hangingValue(after, currentPlayer) - beforeHangingValue;
  if (hangingValueDelta > 0) {
    score -= hangingValueDelta * 2;
    risks.push(`Leaves ${hangingValueDelta} strategic material under capture.`);
  } else if (hangingValueDelta < 0) {
    score += Math.abs(hangingValueDelta);
    reasons.push('Improves piece safety.');
  }

  const afterDenDistance =
    minDistanceToDen(after, currentPlayer) - minDistanceToDen(after, opponent);
  score += (beforeDenDistance - afterDenDistance) * 7;
  score +=
    (denGuardScore(after, currentPlayer) - denGuardScore(state, currentPlayer)) *
    2;

  if (reasons.length === 0) {
    reasons.push(`Legal positional move: ${moveSummary(state, move)}.`);
  }

  return { move, score: Math.round(score), reasons, risks };
}

export function rankJungleMoves(
  state: JungleState,
  player: number,
  moves: JungleMove[] = legalMoves(state, player),
): JungleMoveEvaluation[] {
  return moves
    .map((move) => evaluateJungleMove(state, player, move))
    .sort((left, right) => right.score - left.score || left.move.id.localeCompare(right.move.id));
}

export function chooseStrategicJungleMove(opts: {
  state: JungleState;
  player: number;
  legalMoves: JungleMove[];
}): JungleMove {
  const best = rankJungleMoves(opts.state, opts.player, opts.legalMoves)[0];
  if (!best) {
    throw new Error('No legal Jungle Chess move is available.');
  }

  return best.move;
}
