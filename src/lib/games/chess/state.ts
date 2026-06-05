import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export const BOARD_SIZE = 8;
export const DEFAULT_CHESS_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE_TYPES = [
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
  'king',
] as const;

export type ChessPlayer = 0 | 1;
export type PieceType = (typeof PIECE_TYPES)[number];
export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';
export type ChessColor = Color;
export type ChessSquare = Square;

export interface Coord {
  x: number;
  y: number;
}

export interface ChessPiece {
  id: string;
  owner: ChessPlayer;
  color: ChessColor;
  type: PieceType;
  symbol: PieceSymbol;
  square: ChessSquare;
  x: number;
  y: number;
}

export interface ChessMove {
  id: string;
  from: Coord;
  to: Coord;
  fromSquare: ChessSquare;
  toSquare: ChessSquare;
  piece: PieceType;
  owner: ChessPlayer;
  san: string;
  lan: string;
  flags: string;
  captured?: PieceType;
  promotion?: PromotionPiece;
  isCapture: boolean;
  isPromotion: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
}

export interface ChessMoveInput {
  from: ChessSquare;
  to: ChessSquare;
  promotion?: PieceSymbol;
}

export type ChessStatus =
  | 'active'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move-rule';

export interface ChessState {
  seed: string;
  fen: string;
  pgn: string;
  current: ChessPlayer;
  pieces: ChessPiece[];
  turn: number;
  winner: ChessPlayer | null;
  isCheck: boolean;
  status: ChessStatus;
  moveHistory: ChessMoveInput[];
  lastMove?: ChessMove;
}

export const pieceLabels: Record<
  PieceType,
  { en: string; white: string; black: string; unicodeWhite: string; unicodeBlack: string }
> = {
  pawn: {
    en: 'Pawn',
    white: 'P',
    black: 'p',
    unicodeWhite: '♙',
    unicodeBlack: '♟',
  },
  knight: {
    en: 'Knight',
    white: 'N',
    black: 'n',
    unicodeWhite: '♘',
    unicodeBlack: '♞',
  },
  bishop: {
    en: 'Bishop',
    white: 'B',
    black: 'b',
    unicodeWhite: '♗',
    unicodeBlack: '♝',
  },
  rook: {
    en: 'Rook',
    white: 'R',
    black: 'r',
    unicodeWhite: '♖',
    unicodeBlack: '♜',
  },
  queen: {
    en: 'Queen',
    white: 'Q',
    black: 'q',
    unicodeWhite: '♕',
    unicodeBlack: '♛',
  },
  king: {
    en: 'King',
    white: 'K',
    black: 'k',
    unicodeWhite: '♔',
    unicodeBlack: '♚',
  },
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

const symbolToType: Record<PieceSymbol, PieceType> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const typeToSymbol: Record<PieceType, PieceSymbol> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};

export function playerForColor(color: ChessColor): ChessPlayer {
  return color === 'w' ? 0 : 1;
}

export function colorForPlayer(player: ChessPlayer): ChessColor {
  return player === 0 ? 'w' : 'b';
}

export function opponentOf(player: ChessPlayer): ChessPlayer {
  return player === 0 ? 1 : 0;
}

export function sideName(player: ChessPlayer): 'White' | 'Black' {
  return player === 0 ? 'White' : 'Black';
}

export function pieceTypeForSymbol(symbol: PieceSymbol): PieceType {
  return symbolToType[symbol];
}

export function symbolForPieceType(type: PieceType): PieceSymbol {
  return typeToSymbol[type];
}

export function promotionTypeForSymbol(
  symbol: PieceSymbol | undefined,
): PromotionPiece | undefined {
  if (!symbol || symbol === 'p' || symbol === 'k') {
    return undefined;
  }

  return pieceTypeForSymbol(symbol) as PromotionPiece;
}

export function promotionSymbolForType(
  type: PromotionPiece | undefined,
): PieceSymbol | undefined {
  return type ? symbolForPieceType(type) : undefined;
}

export function squareToCoord(square: ChessSquare): Coord {
  const file = square[0] ?? 'a';
  const rank = Number(square[1] ?? '1');
  return {
    x: Math.max(0, files.indexOf(file as (typeof files)[number])),
    y: BOARD_SIZE - rank,
  };
}

export function coordToSquare(x: number, y: number): ChessSquare {
  const file = files[x] ?? 'a';
  const rank = BOARD_SIZE - y;
  return `${file}${rank}` as ChessSquare;
}

export function coordinateLabel(x: number, y: number): string {
  return coordToSquare(x, y);
}

export function pieceGlyph(piece: Pick<ChessPiece, 'owner' | 'type'>): string {
  const label = pieceLabels[piece.type];
  return piece.owner === 0 ? label.unicodeWhite : label.unicodeBlack;
}

export function pieceName(piece: Pick<ChessPiece, 'owner' | 'type'>): string {
  return `${sideName(piece.owner)} ${pieceLabels[piece.type].en}`;
}

function piecesFromDefaultBoard(): ChessPiece[] {
  return new Chess(DEFAULT_CHESS_FEN)
    .board()
    .flat()
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => {
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
    });
}

export function init(opts: {
  seed?: string;
  playerCount: number;
  aiPlayerIndices?: number[];
}): ChessState {
  if (opts.playerCount !== 2) {
    throw new RangeError('Chess supports exactly 2 players.');
  }

  return {
    seed: opts.seed ?? crypto.randomUUID?.() ?? 'chess',
    fen: DEFAULT_CHESS_FEN,
    pgn: '',
    current: 0,
    pieces: piecesFromDefaultBoard(),
    turn: 0,
    winner: null,
    isCheck: false,
    status: 'active',
    moveHistory: [],
  };
}
