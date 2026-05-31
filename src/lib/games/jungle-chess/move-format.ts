import {
  type JungleMove,
  type JunglePiece,
  type JungleState,
  type PieceType,
} from './state';

export const junglePieceEmoji: Record<PieceType, string> = {
  rat: '🐀',
  cat: '🐈',
  dog: '🐕',
  wolf: '🐺',
  leopard: '🐆',
  tiger: '🐅',
  lion: '🦁',
  elephant: '🐘',
};

function squareName(x: number, y: number): string {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function pieceName(pieceId: string, state: JungleState): string {
  const piece = state.pieces.find((item) => item.id === pieceId);
  if (!piece) {
    return pieceId;
  }

  return `${piece.owner === 0 ? 'Red' : 'Blue'} ${junglePieceEmoji[piece.type]}`;
}

export function pieceEmoji(piece: Pick<JunglePiece, 'type'>): string {
  return junglePieceEmoji[piece.type];
}

export function formatJungleMove(
  move: JungleMove,
  before?: JungleState,
): string {
  const label = before ? pieceName(move.pieceId, before) : move.pieceId;
  const from = squareName(move.from.x, move.from.y);
  const to = squareName(move.to.x, move.to.y);
  const captured = move.capturedId
    ? before
      ? ` captures ${pieceName(move.capturedId, before)}`
      : ` captures ${move.capturedId}`
    : '';

  return `${label} ${from} to ${to}${captured}`;
}

export function coordinateLabel(x: number, y: number): string {
  return squareName(x, y);
}
