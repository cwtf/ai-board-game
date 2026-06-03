import {
  type ChineseChessMove,
  type ChineseChessPiece,
  type ChineseChessState,
  formatChineseNotation,
  pieceLabels,
} from './state';

export function pieceName(
  pieceId: string,
  state: ChineseChessState,
): string {
  const piece = state.pieces.find((item) => item.id === pieceId);
  if (!piece) {
    return pieceId;
  }

  const label = pieceLabels[piece.type];
  const char = piece.owner === 0 ? label.zhRed : label.zhBlack;
  return `${piece.owner === 0 ? 'Red' : 'Black'} ${char} (${label.en})`;
}

export function pieceChar(piece: Pick<ChineseChessPiece, 'owner' | 'type'>): string {
  const label = pieceLabels[piece.type];
  return piece.owner === 0 ? label.zhRed : label.zhBlack;
}

export function formatChineseChessMove(
  move: ChineseChessMove,
  before?: ChineseChessState,
): string {
  if (!before) {
    const captured = move.capturedId ? ` captures ${move.capturedId}` : '';
    return `${move.pieceId} from ${move.from.x},${move.from.y} to ${move.to.x},${move.to.y}${captured}`;
  }

  const piece = before.pieces.find((p) => p.id === move.pieceId);
  if (!piece) {
    return `${move.pieceId} to ${move.to.x},${move.to.y}`;
  }

  const notation = formatChineseNotation(piece, move.from, move.to);
  const captured = move.capturedId
    ? ` captures ${pieceName(move.capturedId, before)}`
    : '';

  return `${notation}${captured}`;
}

export function coordinateLabel(x: number, y: number): string {
  // Coordinate from Red perspective: files 九...一, ranks 1...10
  const redFiles = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];
  const file = redFiles[x] ?? String(x + 1);
  return `${file}${y + 1}`;
}
