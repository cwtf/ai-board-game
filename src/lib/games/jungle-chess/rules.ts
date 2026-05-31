import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  coordKey,
  opponentOf,
  type Coord,
  type JungleMove,
  type JunglePiece,
  type JunglePlayer,
  type JungleState,
  type Terrain,
} from './state';

const directions = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

const waterSquares = new Set([
  '1,3',
  '2,3',
  '4,3',
  '5,3',
  '1,4',
  '2,4',
  '4,4',
  '5,4',
  '1,5',
  '2,5',
  '4,5',
  '5,5',
]);

const denSquares: Record<JunglePlayer, Coord> = {
  0: { x: 3, y: 8 },
  1: { x: 3, y: 0 },
};

const trapSquares: Record<JunglePlayer, Set<string>> = {
  0: new Set(['2,8', '3,7', '4,8']),
  1: new Set(['2,0', '3,1', '4,0']),
};

function cloneState(state: JungleState): JungleState {
  return {
    ...state,
    pieces: state.pieces.map((piece) => ({ ...piece })),
  };
}

export function inBounds(coord: Coord): boolean {
  return (
    coord.x >= 0 &&
    coord.x < BOARD_WIDTH &&
    coord.y >= 0 &&
    coord.y < BOARD_HEIGHT
  );
}

export function terrainAt(coord: Coord): Terrain {
  const key = coordKey(coord);
  if (waterSquares.has(key)) {
    return 'water';
  }
  if (coord.x === 3 && (coord.y === 0 || coord.y === 8)) {
    return 'den';
  }
  if (trapSquares[0].has(key) || trapSquares[1].has(key)) {
    return 'trap';
  }
  return 'land';
}

export function denOwnerAt(coord: Coord): JunglePlayer | null {
  if (coord.x === denSquares[0].x && coord.y === denSquares[0].y) {
    return 0;
  }
  if (coord.x === denSquares[1].x && coord.y === denSquares[1].y) {
    return 1;
  }
  return null;
}

export function trapOwnerAt(coord: Coord): JunglePlayer | null {
  const key = coordKey(coord);
  if (trapSquares[0].has(key)) {
    return 0;
  }
  if (trapSquares[1].has(key)) {
    return 1;
  }
  return null;
}

export function pieceAt(
  state: JungleState,
  coord: Coord,
): JunglePiece | undefined {
  return state.pieces.find(
    (piece) => !piece.captured && piece.x === coord.x && piece.y === coord.y,
  );
}

export function activePieces(
  state: JungleState,
  player?: JunglePlayer,
): JunglePiece[] {
  return state.pieces.filter(
    (piece) => !piece.captured && (player === undefined || piece.owner === player),
  );
}

function isWater(coord: Coord): boolean {
  return terrainAt(coord) === 'water';
}

function isOwnDen(piece: JunglePiece, coord: Coord): boolean {
  return denOwnerAt(coord) === piece.owner;
}

function effectiveRank(piece: JunglePiece): number {
  const trapOwner = trapOwnerAt(piece);
  return trapOwner !== null && trapOwner !== piece.owner ? 0 : piece.rank;
}

function effectiveRankAt(piece: JunglePiece, coord: Coord): number {
  const trapOwner = trapOwnerAt(coord);
  return trapOwner !== null && trapOwner !== piece.owner ? 0 : piece.rank;
}

function canCapture(
  attacker: JunglePiece,
  defender: JunglePiece,
  destination: Coord,
): boolean {
  if (attacker.owner === defender.owner) {
    return false;
  }

  const attackerInWater = isWater(attacker);
  const defenderInWater = isWater(defender);
  if (attackerInWater !== defenderInWater) {
    return false;
  }

  if (trapOwnerAt(defender) === attacker.owner) {
    return true;
  }

  const attackerRank = effectiveRankAt(attacker, destination);
  const defenderRank = effectiveRank(defender);
  if (attackerRank === 0 && defenderRank > 0) {
    return false;
  }

  if (attacker.type === 'rat' && defender.type === 'elephant') {
    return true;
  }

  if (attacker.type === 'elephant' && defender.type === 'rat') {
    return false;
  }

  return attackerRank >= defenderRank;
}

function moveId(piece: JunglePiece, to: Coord): string {
  return `MOVE:${piece.id}:${piece.x},${piece.y}->${to.x},${to.y}`;
}

function simpleDestination(piece: JunglePiece, delta: Coord): Coord {
  return { x: piece.x + delta.x, y: piece.y + delta.y };
}

function jumpDestination(
  state: JungleState,
  piece: JunglePiece,
  delta: Coord,
): Coord | null {
  if (piece.type !== 'lion' && piece.type !== 'tiger') {
    return null;
  }

  const first = simpleDestination(piece, delta);
  if (!inBounds(first) || !isWater(first)) {
    return null;
  }

  let cursor = first;
  while (inBounds(cursor) && isWater(cursor)) {
    const blocker = pieceAt(state, cursor);
    if (blocker?.type === 'rat') {
      return null;
    }
    cursor = { x: cursor.x + delta.x, y: cursor.y + delta.y };
  }

  return inBounds(cursor) ? cursor : null;
}

function destinationsForPiece(
  state: JungleState,
  piece: JunglePiece,
): Coord[] {
  return directions.flatMap((delta) => {
    const jumped = jumpDestination(state, piece, delta);
    const destination = jumped ?? simpleDestination(piece, delta);
    if (!inBounds(destination) || isOwnDen(piece, destination)) {
      return [];
    }

    const destinationIsWater = isWater(destination);
    if (destinationIsWater && piece.type !== 'rat') {
      return [];
    }

    const occupant = pieceAt(state, destination);
    if (!occupant) {
      return [destination];
    }

    return canCapture(piece, occupant, destination) ? [destination] : [];
  });
}

export function legalMoves(
  state: JungleState,
  player: number = state.current,
): JungleMove[] {
  if (state.winner !== null) {
    return [];
  }

  return activePieces(state, player as JunglePlayer).flatMap((piece) =>
    destinationsForPiece(state, piece).map((to) => ({
      id: moveId(piece, to),
      pieceId: piece.id,
      from: { x: piece.x, y: piece.y },
      to,
      capturedId: pieceAt(state, to)?.id,
    })),
  );
}

export function currentPlayer(state: JungleState): number {
  return state.current;
}

export function isTerminal(state: JungleState): boolean {
  return state.winner !== null;
}

export function winner(state: JungleState): number | null {
  return state.winner;
}

export function applyMove(state: JungleState, move: JungleMove): JungleState {
  if (state.winner !== null) {
    throw new Error('Cannot apply a move to a finished game.');
  }

  const legal = legalMoves(state);
  const legalMove = legal.find((candidate) => candidate.id === move.id);
  if (!legalMove) {
    throw new Error('Move is not legal.');
  }

  const next = cloneState(state);
  const piece = next.pieces.find(
    (candidate) => candidate.id === legalMove.pieceId && !candidate.captured,
  );
  if (!piece) {
    throw new Error('Moving piece is not available.');
  }

  const captured = pieceAt(next, legalMove.to);
  if (captured) {
    captured.captured = true;
  }

  piece.x = legalMove.to.x;
  piece.y = legalMove.to.y;

  const denOwner = denOwnerAt(legalMove.to);
  if (denOwner !== null && denOwner !== piece.owner) {
    next.winner = piece.owner;
  } else if (activePieces(next, opponentOf(piece.owner)).length === 0) {
    next.winner = piece.owner;
  } else {
    next.current = opponentOf(next.current);
  }

  next.turn += 1;
  return next;
}
