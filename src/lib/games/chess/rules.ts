import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import {
  coordToSquare,
  DEFAULT_CHESS_FEN,
  pieceTypeForSymbol,
  playerForColor,
  promotionSymbolForType,
  promotionTypeForSymbol,
  squareToCoord,
  type ChessMove,
  type ChessMoveInput,
  type ChessPiece,
  type ChessPlayer,
  type ChessState,
  type ChessStatus,
  type Coord,
} from './state';

export function inBounds(coord: Coord): boolean {
  return coord.x >= 0 && coord.x < 8 && coord.y >= 0 && coord.y < 8;
}

function moveInput(move: ChessMove): ChessMoveInput {
  return {
    from: move.fromSquare,
    to: move.toSquare,
    promotion: promotionSymbolForType(move.promotion),
  };
}

function moveId(move: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return `MOVE:${move.from}${move.to}${move.promotion ?? ''}`;
}

function chessFromState(state: ChessState): Chess {
  if (state.moveHistory.length === 0) {
    return new Chess(state.fen || DEFAULT_CHESS_FEN);
  }

  const chess = new Chess(DEFAULT_CHESS_FEN);
  for (const move of state.moveHistory) {
    chess.move(move);
  }
  return chess;
}

function statusFor(chess: Chess): ChessStatus {
  if (chess.isCheckmate()) {
    return 'checkmate';
  }
  if (chess.isStalemate()) {
    return 'stalemate';
  }
  if (chess.isInsufficientMaterial()) {
    return 'insufficient-material';
  }
  if (chess.isThreefoldRepetition()) {
    return 'threefold-repetition';
  }
  if (chess.isDrawByFiftyMoves()) {
    return 'fifty-move-rule';
  }
  if (chess.isDraw()) {
    return 'draw';
  }
  return 'active';
}

function winnerFor(chess: Chess): ChessPlayer | null {
  if (!chess.isCheckmate()) {
    return null;
  }

  return chess.turn() === 'w' ? 1 : 0;
}

function pieceFromBoardItem(item: {
  square: Square;
  type: PieceSymbol;
  color: 'w' | 'b';
}): ChessPiece {
  const coord = squareToCoord(item.square);
  const owner = playerForColor(item.color);
  const type = pieceTypeForSymbol(item.type);
  return {
    id: `${item.color}-${item.type}-${item.square}`,
    owner,
    color: item.color,
    type,
    symbol: item.type,
    square: item.square,
    x: coord.x,
    y: coord.y,
  };
}

function piecesFor(chess: Chess): ChessPiece[] {
  return chess
    .board()
    .flat()
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map(pieceFromBoardItem);
}

function appMoveFromChessMove(move: Move): ChessMove {
  const from = squareToCoord(move.from);
  const to = squareToCoord(move.to);
  const owner = playerForColor(move.color);
  const flags = [
    move.isBigPawn() ? 'b' : '',
    move.isCapture() || move.isEnPassant() ? 'c' : '',
    move.isEnPassant() ? 'e' : '',
    move.isPromotion() ? 'p' : '',
    move.isKingsideCastle() ? 'k' : '',
    move.isQueensideCastle() ? 'q' : '',
  ].join('');
  return {
    id: moveId(move),
    from,
    to,
    fromSquare: move.from,
    toSquare: move.to,
    piece: pieceTypeForSymbol(move.piece),
    owner,
    san: move.san,
    lan: move.lan,
    flags,
    captured: move.captured ? pieceTypeForSymbol(move.captured) : undefined,
    promotion: promotionTypeForSymbol(move.promotion),
    isCapture: move.isCapture() || move.isEnPassant(),
    isPromotion: move.isPromotion(),
    isCastle: move.isKingsideCastle() || move.isQueensideCastle(),
    isEnPassant: move.isEnPassant(),
    isCheck: move.san.includes('+') || move.san.includes('#'),
    isCheckmate: move.san.includes('#'),
  };
}

function stateFromChess(opts: {
  seed: string;
  chess: Chess;
  moveHistory: ChessMoveInput[];
  lastMove?: ChessMove;
}): ChessState {
  return {
    seed: opts.seed,
    fen: opts.chess.fen(),
    pgn: opts.chess.pgn(),
    current: playerForColor(opts.chess.turn()),
    pieces: piecesFor(opts.chess),
    turn: opts.moveHistory.length,
    winner: winnerFor(opts.chess),
    isCheck: opts.chess.isCheck(),
    status: statusFor(opts.chess),
    moveHistory: opts.moveHistory,
    lastMove: opts.lastMove,
  };
}

export function hydrateState(state: ChessState): ChessState {
  return stateFromChess({
    seed: state.seed,
    chess: chessFromState(state),
    moveHistory: [...state.moveHistory],
    lastMove: state.lastMove,
  });
}

export function activePieces(
  state: ChessState,
  player?: ChessPlayer,
): ChessPiece[] {
  return hydrateState(state).pieces.filter(
    (piece) => player === undefined || piece.owner === player,
  );
}

export function pieceAt(
  state: ChessState,
  coord: Coord,
): ChessPiece | undefined {
  if (!inBounds(coord)) {
    return undefined;
  }

  return hydrateState(state).pieces.find(
    (piece) => piece.x === coord.x && piece.y === coord.y,
  );
}

export function legalMoves(
  state: ChessState,
  player: number = state.current,
): ChessMove[] {
  const hydrated = hydrateState(state);
  if (hydrated.winner !== null || hydrated.status !== 'active') {
    return [];
  }
  if (player !== hydrated.current) {
    return [];
  }

  return chessFromState(hydrated)
    .moves({ verbose: true })
    .map(appMoveFromChessMove);
}

export function legalMovesForSquare(
  state: ChessState,
  square: Square,
): ChessMove[] {
  return legalMoves(state).filter((move) => move.fromSquare === square);
}

export function currentPlayer(state: ChessState): number {
  return hydrateState(state).current;
}

export function isTerminal(state: ChessState): boolean {
  const hydrated = hydrateState(state);
  return hydrated.winner !== null || hydrated.status !== 'active';
}

export function winner(state: ChessState): number | null {
  return hydrateState(state).winner;
}

export function applyMove(state: ChessState, move: ChessMove): ChessState {
  const current = hydrateState(state);
  if (isTerminal(current)) {
    throw new Error('Cannot apply a move to a finished game.');
  }

  const legal = legalMoves(current);
  const legalMove = legal.find((candidate) => candidate.id === move.id);
  if (!legalMove) {
    throw new Error('Move is not legal.');
  }

  const chess = chessFromState(current);
  const applied = chess.move({
    from: legalMove.fromSquare,
    to: legalMove.toSquare,
    promotion: promotionSymbolForType(legalMove.promotion),
  });
  const lastMove = appMoveFromChessMove(applied);

  return stateFromChess({
    seed: current.seed,
    chess,
    moveHistory: [...current.moveHistory, moveInput(legalMove)],
    lastMove,
  });
}

export function moveFromSquares(
  state: ChessState,
  from: Coord,
  to: Coord,
  promotion: PieceSymbol = 'q',
): ChessMove | undefined {
  const fromSquare = coordToSquare(from.x, from.y);
  const toSquare = coordToSquare(to.x, to.y);
  return legalMoves(state).find(
    (move) =>
      move.fromSquare === fromSquare &&
      move.toSquare === toSquare &&
      (!move.promotion || promotionSymbolForType(move.promotion) === promotion),
  );
}
