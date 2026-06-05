export const BOARD_WIDTH = 7;
export const BOARD_HEIGHT = 9;

export const PIECE_TYPES = [
  'rat',
  'cat',
  'dog',
  'wolf',
  'leopard',
  'tiger',
  'lion',
  'elephant',
] as const;

export type JunglePlayer = 0 | 1;
export type PieceType = (typeof PIECE_TYPES)[number];
export type Terrain = 'land' | 'water' | 'trap' | 'den';

export interface Coord {
  x: number;
  y: number;
}

export interface JunglePiece {
  id: string;
  owner: JunglePlayer;
  type: PieceType;
  rank: number;
  x: number;
  y: number;
  captured: boolean;
}

export interface JungleMove {
  id: string;
  pieceId: string;
  from: Coord;
  to: Coord;
  capturedId?: string;
}

export interface JungleState {
  seed: string;
  current: JunglePlayer;
  pieces: JunglePiece[];
  turn: number;
  winner: JunglePlayer | null;
  lastMove?: JungleMove;
}

export const pieceLabels: Record<PieceType, { en: string; zh: string; emoji: string }> = {
  rat: { en: 'Rat', zh: '鼠', emoji: '🐀' },
  cat: { en: 'Cat', zh: '猫', emoji: '🐈' },
  dog: { en: 'Dog', zh: '狗', emoji: '🐕' },
  wolf: { en: 'Wolf', zh: '狼', emoji: '🐺' },
  leopard: { en: 'Leopard', zh: '豹', emoji: '🐆' },
  tiger: { en: 'Tiger', zh: '虎', emoji: '🐅' },
  lion: { en: 'Lion', zh: '狮', emoji: '🦁' },
  elephant: { en: 'Elephant', zh: '象', emoji: '🐘' },
};

const startingPieces: Array<Omit<JunglePiece, 'captured'>> = [
  { id: 'b-lion', owner: 1, type: 'lion', rank: 7, x: 0, y: 0 },
  { id: 'b-tiger', owner: 1, type: 'tiger', rank: 6, x: 6, y: 0 },
  { id: 'b-dog', owner: 1, type: 'dog', rank: 3, x: 1, y: 1 },
  { id: 'b-cat', owner: 1, type: 'cat', rank: 2, x: 5, y: 1 },
  { id: 'b-rat', owner: 1, type: 'rat', rank: 1, x: 0, y: 2 },
  { id: 'b-leopard', owner: 1, type: 'leopard', rank: 5, x: 2, y: 2 },
  { id: 'b-wolf', owner: 1, type: 'wolf', rank: 4, x: 4, y: 2 },
  { id: 'b-elephant', owner: 1, type: 'elephant', rank: 8, x: 6, y: 2 },
  { id: 'r-tiger', owner: 0, type: 'tiger', rank: 6, x: 0, y: 8 },
  { id: 'r-lion', owner: 0, type: 'lion', rank: 7, x: 6, y: 8 },
  { id: 'r-cat', owner: 0, type: 'cat', rank: 2, x: 1, y: 7 },
  { id: 'r-dog', owner: 0, type: 'dog', rank: 3, x: 5, y: 7 },
  { id: 'r-elephant', owner: 0, type: 'elephant', rank: 8, x: 0, y: 6 },
  { id: 'r-wolf', owner: 0, type: 'wolf', rank: 4, x: 2, y: 6 },
  { id: 'r-leopard', owner: 0, type: 'leopard', rank: 5, x: 4, y: 6 },
  { id: 'r-rat', owner: 0, type: 'rat', rank: 1, x: 6, y: 6 },
];

export function init(opts: {
  seed?: string;
  playerCount: number;
  aiPlayerIndices?: number[];
}): JungleState {
  if (opts.playerCount !== 2) {
    throw new RangeError('Jungle Chess supports exactly 2 players.');
  }

  return {
    seed: opts.seed ?? crypto.randomUUID?.() ?? 'jungle-chess',
    current: 0,
    pieces: startingPieces.map((piece) => ({ ...piece, captured: false })),
    turn: 0,
    winner: null,
  };
}

export function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function opponentOf(player: JunglePlayer): JunglePlayer {
  return player === 0 ? 1 : 0;
}
