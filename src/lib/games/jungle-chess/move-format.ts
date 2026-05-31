import { pieceLabels, type JungleMove, type JungleState } from './state';

function squareName(x: number, y: number): string {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function pieceName(pieceId: string, state: JungleState): string {
  const piece = state.pieces.find((item) => item.id === pieceId);
  if (!piece) {
    return pieceId;
  }

  return `${piece.owner === 0 ? 'Red' : 'Blue'} ${pieceLabels[piece.type].en}`;
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
