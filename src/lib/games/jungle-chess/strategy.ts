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

  // Elephant-rat proximity: the rat is the elephant's unique predator.
  // The 1-ply hangingValue only catches dist=1 threats; this handles dist=2-4.
  const myElephant = activePieces(state, currentPlayer).find((p) => p.type === 'elephant');
  const oppRat = activePieces(state, opponent).find((p) => p.type === 'rat');
  if (myElephant && oppRat) {
    const distBefore = distance(myElephant, oppRat);
    if (distBefore <= 4) {
      const myElephantAfter = activePieces(after, currentPlayer).find((p) => p.type === 'elephant');
      const oppRatAfter = activePieces(after, opponent).find((p) => p.type === 'rat');
      const distAfter =
        myElephantAfter && oppRatAfter ? distance(myElephantAfter, oppRatAfter) : Infinity;
      // Urgency scales with how close the rat already is
      const urgency = ([0, 300, 150, 60, 20] as const)[distBefore] ?? 0;

      if (!oppRatAfter) {
        score += urgency;
        reasons.push('Captures the rat, ending the threat to the elephant.');
      } else if (distAfter > distBefore) {
        score += urgency;
        reasons.push(`Moves elephant to safety (rat was ${distBefore} step${distBefore === 1 ? '' : 's'} away).`);
      } else if (distAfter < distBefore) {
        score -= urgency / 2;
        risks.push('Allows the rat to close in on the elephant.');
      } else if (distBefore <= 2) {
        // Distance unchanged and rat is already dangerous — this move ignores the threat
        score -= urgency;
        risks.push('Does not address the rat threat to the elephant.');
      }
    }
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

  const afterHangingValue = hangingValue(after, currentPlayer);
  const hangingValueDelta = afterHangingValue - beforeHangingValue;
  // Penalise the absolute amount of hanging material after this move, not just the change.
  // Without this, moves that ignore an already-threatened piece score the same as moves
  // that rescue it (delta = 0 in both cases), causing the bot to keep ignoring threats.
  score -= afterHangingValue;
  if (hangingValueDelta > 0) {
    score -= hangingValueDelta;
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

// ---- Minimax / Alpha-Beta Search ----

const SEARCH_DEPTH = 4;
const INF = 1_000_000;

// Fast state transition for search — replicates applyMove logic without the
// legalMoves validation call that applyMove uses.
function fastApplyMove(state: JungleState, move: JungleMove): JungleState {
  const next: JungleState = {
    ...state,
    pieces: state.pieces.map((p) => ({ ...p })),
    turn: state.turn + 1,
    winner: null,
    // current stays as state.current until we determine if there's a winner
  };

  const piece = next.pieces.find((p) => p.id === move.pieceId && !p.captured);
  if (piece) {
    if (move.capturedId) {
      const cap = next.pieces.find((p) => p.id === move.capturedId && !p.captured);
      if (cap) cap.captured = true;
    }
    piece.x = move.to.x;
    piece.y = move.to.y;

    const denOwner = denOwnerAt(move.to);
    if (denOwner !== null && denOwner !== piece.owner) {
      next.winner = piece.owner;
    } else if (activePieces(next, opponentOf(piece.owner)).length === 0) {
      next.winner = piece.owner;
    } else {
      next.current = opponentOf(state.current);
    }
  } else {
    next.current = opponentOf(state.current);
  }

  return next;
}

// Penalty table indexed by Manhattan distance (dist=0 unused; caps at dist=4).
// The rat is the elephant's unique predator — this corrects the horizon effect
// where the search cannot see the rat reaching the elephant beyond depth 4.
const RAT_ELEPHANT_PENALTY = [0, 120, 60, 20, 5] as const;

// Leaf-node evaluation: material balance + den proximity + elephant-rat danger.
// Deliberately avoids legalMoves calls to keep the search fast.
function staticEvaluation(state: JungleState, player: JunglePlayer): number {
  if (state.winner !== null) {
    return state.winner === player ? INF : -INF;
  }

  const opponent = opponentOf(player);
  const myPieces = activePieces(state, player);
  const oppPieces = activePieces(state, opponent);

  if (myPieces.length === 0) return -INF;
  if (oppPieces.length === 0) return INF;

  let score = 0;

  for (const piece of myPieces) score += strategicPieceValue(state, piece);
  for (const piece of oppPieces) score -= strategicPieceValue(state, piece);

  // Den proximity: reward closing the gap to the opponent's den
  const oppDenCoord = opponentDen(player);
  const ownDenCoord = ownDen(player);
  const myMinDist = Math.min(...myPieces.map((p) => distance(p, oppDenCoord)));
  const oppMinDist = Math.min(...oppPieces.map((p) => distance(p, ownDenCoord)));
  score += (oppMinDist - myMinDist) * 10;

  // Elephant-rat proximity: the rat is the only piece that can capture the elephant.
  // Penalise positions where the enemy rat is close, since the elephant cannot fight back.
  const myElephant = myPieces.find((p) => p.type === 'elephant');
  const oppRat = oppPieces.find((p) => p.type === 'rat');
  if (myElephant && oppRat) {
    const dist = distance(myElephant, oppRat);
    if (dist <= 4) score -= RAT_ELEPHANT_PENALTY[dist] ?? 0;
  }
  const oppElephant = oppPieces.find((p) => p.type === 'elephant');
  const myRat = myPieces.find((p) => p.type === 'rat');
  if (oppElephant && myRat) {
    const dist = distance(oppElephant, myRat);
    if (dist <= 4) score += RAT_ELEPHANT_PENALTY[dist] ?? 0;
  }

  // General piece safety: discount pieces that can be immediately captured.
  // legalMoves is cheap in Jungle Chess (no per-move check validation), so calling it
  // here is affordable and corrects the horizon effect for high-value hanging pieces.
  const oppCaptures = new Set(
    legalMoves(state, opponent)
      .map((m) => m.capturedId)
      .filter((id): id is string => id !== undefined),
  );
  const myCaptures = new Set(
    legalMoves(state, player)
      .map((m) => m.capturedId)
      .filter((id): id is string => id !== undefined),
  );
  for (const piece of myPieces) {
    if (oppCaptures.has(piece.id)) score -= strategicPieceValue(state, piece);
  }
  for (const piece of oppPieces) {
    if (myCaptures.has(piece.id)) score += strategicPieceValue(state, piece);
  }

  return score;
}

// Order moves to maximise alpha-beta pruning:
// 1. Immediate den-entry wins
// 2. Captures (MVV-LVA: high-value victim, low-value attacker)
// 3. Everything else
function moveOrderScore(state: JungleState, move: JungleMove, player: JunglePlayer): number {
  if (denOwnerAt(move.to) === opponentOf(player)) return INF;
  if (move.capturedId) {
    const victim = state.pieces.find((p) => p.id === move.capturedId && !p.captured);
    const attacker = state.pieces.find((p) => p.id === move.pieceId && !p.captured);
    if (victim && attacker) {
      return strategicPieceValue(state, victim) * 10 - strategicPieceValue(state, attacker);
    }
    return 0;
  }
  return -INF;
}

function orderMovesForSearch(
  state: JungleState,
  moves: JungleMove[],
  player: JunglePlayer,
): JungleMove[] {
  return [...moves].sort(
    (a, b) => moveOrderScore(state, b, player) - moveOrderScore(state, a, player),
  );
}

function alphaBeta(
  state: JungleState,
  depth: number,
  alpha: number,
  beta: number,
  rootPlayer: JunglePlayer,
): number {
  if (state.winner !== null) {
    return state.winner === rootPlayer ? INF : -INF;
  }

  if (depth === 0) {
    return staticEvaluation(state, rootPlayer);
  }

  const moves = legalMoves(state, state.current);

  if (moves.length === 0) {
    return state.current === rootPlayer ? -INF : INF;
  }

  const ordered = orderMovesForSearch(state, moves, state.current);

  if (state.current === rootPlayer) {
    let best = -INF;
    for (const move of ordered) {
      const score = alphaBeta(fastApplyMove(state, move), depth - 1, alpha, beta, rootPlayer);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = INF;
    for (const move of ordered) {
      const score = alphaBeta(fastApplyMove(state, move), depth - 1, alpha, beta, rootPlayer);
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (alpha >= beta) break;
    }
    return best;
  }
}

export function chooseStrategicJungleMove(opts: {
  state: JungleState;
  player: number;
  legalMoves: JungleMove[];
}): JungleMove {
  const player = opts.player as JunglePlayer;
  const ordered = orderMovesForSearch(opts.state, opts.legalMoves, player);

  if (!ordered.length) {
    throw new Error('No legal Jungle Chess move is available.');
  }

  let bestMove = ordered[0]!;
  let bestScore = -INF - 1;
  let alpha = -INF;

  for (const move of ordered) {
    const score = alphaBeta(
      fastApplyMove(opts.state, move),
      SEARCH_DEPTH - 1,
      alpha,
      INF,
      player,
    );
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      if (score > alpha) alpha = score;
    }
    if (bestScore >= INF) break;
  }

  return bestMove;
}
