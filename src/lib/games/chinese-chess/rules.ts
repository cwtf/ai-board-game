import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  opponentOf,
  type ChineseChessMove,
  type ChineseChessPiece,
  type ChineseChessPlayer,
  type ChineseChessState,
  type Coord,
} from './state';

const directions = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

export function inBounds(coord: Coord): boolean {
  return (
    coord.x >= 0 && coord.x < BOARD_WIDTH && coord.y >= 0 && coord.y < BOARD_HEIGHT
  );
}

export function inPalace(coord: Coord, player: ChineseChessPlayer): boolean {
  const palaceXMin = 3;
  const palaceXMax = 5;
  const palaceYMin = player === 0 ? 7 : 0;
  const palaceYMax = player === 0 ? 9 : 2;
  return (
    coord.x >= palaceXMin &&
    coord.x <= palaceXMax &&
    coord.y >= palaceYMin &&
    coord.y <= palaceYMax
  );
}

export function isRiverCrossed(coord: Coord, player: ChineseChessPlayer): boolean {
  return player === 0 ? coord.y <= 4 : coord.y >= 5;
}

function cloneState(state: ChineseChessState): ChineseChessState {
  return {
    ...state,
    pieces: state.pieces.map((piece) => ({ ...piece })),
  };
}

export function pieceAt(
  state: ChineseChessState,
  coord: Coord,
): ChineseChessPiece | undefined {
  return state.pieces.find(
    (piece) => !piece.captured && piece.x === coord.x && piece.y === coord.y,
  );
}

export function activePieces(
  state: ChineseChessState,
  player?: ChineseChessPlayer,
): ChineseChessPiece[] {
  return state.pieces.filter(
    (piece) => !piece.captured && (player === undefined || piece.owner === player),
  );
}

export function generalFor(
  state: ChineseChessState,
  player: ChineseChessPlayer,
): ChineseChessPiece | undefined {
  return activePieces(state, player).find((piece) => piece.type === 'general');
}

function countPiecesBetween(
  state: ChineseChessState,
  from: Coord,
  to: Coord,
): number {
  if (from.x !== to.x && from.y !== to.y) return 0;
  let count = 0;
  if (from.x === to.x) {
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    for (let y = minY + 1; y < maxY; y++) {
      if (pieceAt(state, { x: from.x, y })) count++;
    }
  } else {
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    for (let x = minX + 1; x < maxX; x++) {
      if (pieceAt(state, { x, y: from.y })) count++;
    }
  }
  return count;
}

function isGeneralFacingGeneral(state: ChineseChessState): boolean {
  const redGeneral = generalFor(state, 0);
  const blackGeneral = generalFor(state, 1);
  if (!redGeneral || !blackGeneral) return false;
  if (redGeneral.x !== blackGeneral.x) return false;
  return countPiecesBetween(state, redGeneral, blackGeneral) === 0;
}

function isInCheck(state: ChineseChessState, player: ChineseChessPlayer): boolean {
  const general = generalFor(state, player);
  if (!general) return false;
  const opponent = opponentOf(player);

  // Check for general facing general
  const oppGeneral = generalFor(state, opponent);
  if (oppGeneral && isGeneralFacingGeneral(state)) {
    return true;
  }

  for (const piece of activePieces(state, opponent)) {
    const attacks = rawAttacksForPiece(state, piece);
    if (attacks.some((coord) => coord.x === general.x && coord.y === general.y)) {
      return true;
    }
  }
  return false;
}

function rawAttacksForPiece(
  state: ChineseChessState,
  piece: ChineseChessPiece,
): Coord[] {
  // Raw attacks without check validation - for check detection
  switch (piece.type) {
    case 'chariot': {
      const result: Coord[] = [];
      for (const dir of directions) {
        let cursor = { x: piece.x + dir.x, y: piece.y + dir.y };
        while (inBounds(cursor)) {
          const occupant = pieceAt(state, cursor);
          if (occupant) {
            if (occupant.owner !== piece.owner) result.push(cursor);
            break;
          }
          result.push(cursor);
          cursor = { x: cursor.x + dir.x, y: cursor.y + dir.y };
        }
      }
      return result;
    }
    case 'cannon': {
      const result: Coord[] = [];
      for (const dir of directions) {
        let cursor = { x: piece.x + dir.x, y: piece.y + dir.y };
        let foundPlatform = false;
        while (inBounds(cursor)) {
          const occupant = pieceAt(state, cursor);
          if (!foundPlatform) {
            if (occupant) {
              foundPlatform = true;
            } else {
              result.push(cursor);
            }
          } else {
            if (occupant) {
              if (occupant.owner !== piece.owner) result.push(cursor);
              break;
            }
          }
          cursor = { x: cursor.x + dir.x, y: cursor.y + dir.y };
        }
      }
      return result;
    }
    case 'horse': {
      const result: Coord[] = [];
      const horseMoves = [
        { dx: 1, dy: 2, lx: 0, ly: 1 },
        { dx: 1, dy: -2, lx: 0, ly: -1 },
        { dx: -1, dy: 2, lx: 0, ly: 1 },
        { dx: -1, dy: -2, lx: 0, ly: -1 },
        { dx: 2, dy: 1, lx: 1, ly: 0 },
        { dx: 2, dy: -1, lx: 1, ly: 0 },
        { dx: -2, dy: 1, lx: -1, ly: 0 },
        { dx: -2, dy: -1, lx: -1, ly: 0 },
      ];
      for (const move of horseMoves) {
        const leg = { x: piece.x + move.lx, y: piece.y + move.ly };
        const dest = { x: piece.x + move.dx, y: piece.y + move.dy };
        if (inBounds(dest) && !pieceAt(state, leg)) {
          const occupant = pieceAt(state, dest);
          if (!occupant || occupant.owner !== piece.owner) {
            result.push(dest);
          }
        }
      }
      return result;
    }
    case 'elephant': {
      const result: Coord[] = [];
      const elephantMoves = [
        { dx: 2, dy: 2, lx: 1, ly: 1 },
        { dx: 2, dy: -2, lx: 1, ly: -1 },
        { dx: -2, dy: 2, lx: -1, ly: 1 },
        { dx: -2, dy: -2, lx: -1, ly: -1 },
      ];
      for (const move of elephantMoves) {
        const eye = { x: piece.x + move.lx, y: piece.y + move.ly };
        const dest = { x: piece.x + move.dx, y: piece.y + move.dy };
        if (inBounds(dest) && !pieceAt(state, eye)) {
          // Elephant cannot cross river
          if (piece.owner === 0 && dest.y < 5) continue;
          if (piece.owner === 1 && dest.y > 4) continue;
          const occupant = pieceAt(state, dest);
          if (!occupant || occupant.owner !== piece.owner) {
            result.push(dest);
          }
        }
      }
      return result;
    }
    case 'advisor': {
      const result: Coord[] = [];
      const advisorMoves = [
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: -1, y: -1 },
      ];
      for (const move of advisorMoves) {
        const dest = { x: piece.x + move.x, y: piece.y + move.y };
        if (inBounds(dest) && inPalace(dest, piece.owner)) {
          const occupant = pieceAt(state, dest);
          if (!occupant || occupant.owner !== piece.owner) {
            result.push(dest);
          }
        }
      }
      return result;
    }
    case 'general': {
      const result: Coord[] = [];
      for (const dir of directions) {
        const dest = { x: piece.x + dir.x, y: piece.y + dir.y };
        if (inBounds(dest) && inPalace(dest, piece.owner)) {
          const occupant = pieceAt(state, dest);
          if (!occupant || occupant.owner !== piece.owner) {
            result.push(dest);
          }
        }
      }
      // Flying general
      const oppGeneral = generalFor(state, opponentOf(piece.owner));
      if (oppGeneral && piece.x === oppGeneral.x) {
        const between = countPiecesBetween(state, piece, oppGeneral);
        if (between === 0) {
          result.push({ x: oppGeneral.x, y: oppGeneral.y });
        }
      }
      return result;
    }
    case 'soldier': {
      const result: Coord[] = [];
      const forwardDir = piece.owner === 0 ? -1 : 1;
      const forward = { x: piece.x, y: piece.y + forwardDir };
      if (inBounds(forward)) {
        const occupant = pieceAt(state, forward);
        if (!occupant || occupant.owner !== piece.owner) {
          result.push(forward);
        }
      }
      if (isRiverCrossed(piece, piece.owner)) {
        for (const side of [
          { x: piece.x + 1, y: piece.y },
          { x: piece.x - 1, y: piece.y },
        ]) {
          if (inBounds(side)) {
            const occupant = pieceAt(state, side);
            if (!occupant || occupant.owner !== piece.owner) {
              result.push(side);
            }
          }
        }
      }
      return result;
    }
  }
}

function destinationsForPiece(
  state: ChineseChessState,
  piece: ChineseChessPiece,
): Coord[] {
  return rawAttacksForPiece(state, piece);
}

export function legalMoves(
  state: ChineseChessState,
  player: number = state.current,
): ChineseChessMove[] {
  if (state.winner !== null) {
    return [];
  }

  const moves: ChineseChessMove[] = [];
  for (const piece of activePieces(state, player as ChineseChessPlayer)) {
    for (const dest of destinationsForPiece(state, piece)) {
      const captured = pieceAt(state, dest);
      // Apply move temporarily to check if it leaves general in check
      const testState = cloneState(state);
      const testPiece = testState.pieces.find(
        (p) => p.id === piece.id && !p.captured,
      );
      if (!testPiece) continue;

      if (captured) {
        const testCaptured = testState.pieces.find(
          (p) => p.id === captured.id && !p.captured,
        );
        if (testCaptured) testCaptured.captured = true;
      }

      testPiece.x = dest.x;
      testPiece.y = dest.y;
      testState.current = opponentOf(testState.current);

      if (!isInCheck(testState, player as ChineseChessPlayer)) {
        moves.push({
          id: `MOVE:${piece.id}:${piece.x},${piece.y}->${dest.x},${dest.y}`,
          pieceId: piece.id,
          from: { x: piece.x, y: piece.y },
          to: dest,
          capturedId: captured?.id,
        });
      }
    }
  }

  return moves;
}

export function currentPlayer(state: ChineseChessState): number {
  return state.current;
}

export function isTerminal(state: ChineseChessState): boolean {
  return state.winner !== null;
}

export function winner(state: ChineseChessState): number | null {
  return state.winner;
}

export function applyMove(
  state: ChineseChessState,
  move: ChineseChessMove,
): ChineseChessState {
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

  next.current = opponentOf(next.current);
  next.turn += 1;

  if (!generalFor(next, next.current)) {
    next.winner = state.current;
    next.isCheck = true;
    return next;
  }

  next.isCheck = isInCheck(next, next.current);

  // Check if opponent is checkmated or stalemated
  const opponentMoves = legalMoves(next);
  if (opponentMoves.length === 0) {
    // Current player before the switch is the winner
    next.winner = state.current;
  }

  return next;
}
