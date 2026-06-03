export const BOARD_WIDTH = 9;
export const BOARD_HEIGHT = 10;

export const PIECE_TYPES = [
  'general',
  'advisor',
  'elephant',
  'horse',
  'chariot',
  'cannon',
  'soldier',
] as const;

export type ChineseChessPlayer = 0 | 1;
export type PieceType = (typeof PIECE_TYPES)[number];

export interface Coord {
  x: number;
  y: number;
}

export interface ChineseChessPiece {
  id: string;
  owner: ChineseChessPlayer;
  type: PieceType;
  x: number;
  y: number;
  captured: boolean;
}

export interface ChineseChessMove {
  id: string;
  pieceId: string;
  from: Coord;
  to: Coord;
  capturedId?: string;
}

export interface ChineseChessState {
  seed: string;
  current: ChineseChessPlayer;
  pieces: ChineseChessPiece[];
  turn: number;
  winner: ChineseChessPlayer | null;
  isCheck: boolean;
}

export const pieceLabels: Record<PieceType, { en: string; zhRed: string; zhBlack: string }> = {
  general: { en: 'General', zhRed: '帥', zhBlack: '將' },
  advisor: { en: 'Advisor', zhRed: '仕', zhBlack: '士' },
  elephant: { en: 'Elephant', zhRed: '相', zhBlack: '象' },
  horse: { en: 'Horse', zhRed: '傌', zhBlack: '馬' },
  chariot: { en: 'Chariot', zhRed: '俥', zhBlack: '車' },
  cannon: { en: 'Cannon', zhRed: '炮', zhBlack: '砲' },
  soldier: { en: 'Soldier', zhRed: '兵', zhBlack: '卒' },
};

export const sideName = (player: ChineseChessPlayer): 'Red' | 'Black' =>
  player === 0 ? 'Red' : 'Black';

export const chineseFileRed = (x: number): string => {
  // From Red's right to left: 一, 二, 三, 四, 五, 六, 七, 八, 九
  // x=0 is Red's left, x=8 is Red's right
  const chars = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];
  return chars[x] ?? String(x + 1);
};

export const chineseFileBlack = (x: number): string => {
  // From Black's right to left: 1, 2, 3, 4, 5, 6, 7, 8, 9
  // x=0 is Black's right, x=8 is Black's left
  return String(x + 1);
};

function playerFileLabel(x: number, player: ChineseChessPlayer): string {
  return player === 0 ? chineseFileRed(x) : chineseFileBlack(x);
}

export function formatChineseNotation(
  piece: Pick<ChineseChessPiece, 'owner' | 'type'>,
  from: Coord,
  to: Coord,
): string {
  const label = pieceLabels[piece.type];
  const pieceChar = piece.owner === 0 ? label.zhRed : label.zhBlack;
  const startFile = playerFileLabel(from.x, piece.owner);

  if (from.y === to.y) {
    const destFile = playerFileLabel(to.x, piece.owner);
    return `${pieceChar}${startFile}平${destFile}`;
  }

  const isForward = piece.owner === 0 ? to.y < from.y : to.y > from.y;
  const direction = isForward ? '進' : '退';

  if (piece.type === 'horse' || piece.type === 'elephant' || piece.type === 'advisor') {
    const destFile = playerFileLabel(to.x, piece.owner);
    return `${pieceChar}${startFile}${direction}${destFile}`;
  }

  const steps = Math.abs(to.y - from.y);
  return `${pieceChar}${startFile}${direction}${steps}`;
}

const startingPieces: Array<Omit<ChineseChessPiece, 'captured'>> = [
  // Black pieces (player 1) at top of board
  { id: 'b-general', owner: 1, type: 'general', x: 4, y: 0 },
  { id: 'b-advisor-l', owner: 1, type: 'advisor', x: 3, y: 0 },
  { id: 'b-advisor-r', owner: 1, type: 'advisor', x: 5, y: 0 },
  { id: 'b-elephant-l', owner: 1, type: 'elephant', x: 2, y: 0 },
  { id: 'b-elephant-r', owner: 1, type: 'elephant', x: 6, y: 0 },
  { id: 'b-horse-l', owner: 1, type: 'horse', x: 1, y: 0 },
  { id: 'b-horse-r', owner: 1, type: 'horse', x: 7, y: 0 },
  { id: 'b-chariot-l', owner: 1, type: 'chariot', x: 0, y: 0 },
  { id: 'b-chariot-r', owner: 1, type: 'chariot', x: 8, y: 0 },
  { id: 'b-cannon-l', owner: 1, type: 'cannon', x: 1, y: 2 },
  { id: 'b-cannon-r', owner: 1, type: 'cannon', x: 7, y: 2 },
  { id: 'b-soldier-1', owner: 1, type: 'soldier', x: 0, y: 3 },
  { id: 'b-soldier-2', owner: 1, type: 'soldier', x: 2, y: 3 },
  { id: 'b-soldier-3', owner: 1, type: 'soldier', x: 4, y: 3 },
  { id: 'b-soldier-4', owner: 1, type: 'soldier', x: 6, y: 3 },
  { id: 'b-soldier-5', owner: 1, type: 'soldier', x: 8, y: 3 },

  // Red pieces (player 0) at bottom of board
  { id: 'r-general', owner: 0, type: 'general', x: 4, y: 9 },
  { id: 'r-advisor-l', owner: 0, type: 'advisor', x: 3, y: 9 },
  { id: 'r-advisor-r', owner: 0, type: 'advisor', x: 5, y: 9 },
  { id: 'r-elephant-l', owner: 0, type: 'elephant', x: 2, y: 9 },
  { id: 'r-elephant-r', owner: 0, type: 'elephant', x: 6, y: 9 },
  { id: 'r-horse-l', owner: 0, type: 'horse', x: 1, y: 9 },
  { id: 'r-horse-r', owner: 0, type: 'horse', x: 7, y: 9 },
  { id: 'r-chariot-l', owner: 0, type: 'chariot', x: 0, y: 9 },
  { id: 'r-chariot-r', owner: 0, type: 'chariot', x: 8, y: 9 },
  { id: 'r-cannon-l', owner: 0, type: 'cannon', x: 1, y: 7 },
  { id: 'r-cannon-r', owner: 0, type: 'cannon', x: 7, y: 7 },
  { id: 'r-soldier-1', owner: 0, type: 'soldier', x: 0, y: 6 },
  { id: 'r-soldier-2', owner: 0, type: 'soldier', x: 2, y: 6 },
  { id: 'r-soldier-3', owner: 0, type: 'soldier', x: 4, y: 6 },
  { id: 'r-soldier-4', owner: 0, type: 'soldier', x: 6, y: 6 },
  { id: 'r-soldier-5', owner: 0, type: 'soldier', x: 8, y: 6 },
];

export function init(opts: {
  seed?: string;
  playerCount: number;
  aiPlayerIndices?: number[];
}): ChineseChessState {
  if (opts.playerCount !== 2) {
    throw new RangeError('Chinese Chess supports exactly 2 players.');
  }

  return {
    seed: opts.seed ?? crypto.randomUUID?.() ?? 'chinese-chess',
    current: 0,
    pieces: startingPieces.map((piece) => ({ ...piece, captured: false })),
    turn: 0,
    winner: null,
    isCheck: false,
  };
}

export function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function opponentOf(player: ChineseChessPlayer): ChineseChessPlayer {
  return player === 0 ? 1 : 0;
}
