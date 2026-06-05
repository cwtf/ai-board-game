import {
  coordinateLabel,
  pieceGlyph,
  pieceLabels,
  pieceName,
  type ChessMove,
  type ChessPiece,
  type ChessState,
} from './state';

export { coordinateLabel, pieceGlyph };

export function chessPieceName(
  pieceId: string,
  state: ChessState,
): string {
  const piece = state.pieces.find((item) => item.id === pieceId);
  return piece ? pieceName(piece) : pieceId;
}

export function capturedPieceText(move: ChessMove): string {
  return move.captured ? pieceLabels[move.captured].en : '';
}

export function formatChessMove(move: ChessMove): string {
  const capture = move.captured ? ` captures ${pieceLabels[move.captured].en}` : '';
  const promotion = move.promotion
    ? ` promotes to ${pieceLabels[move.promotion].en}`
    : '';
  const special = [
    move.isCastle ? 'castles' : '',
    move.isEnPassant ? 'en passant' : '',
    move.isCheckmate ? 'checkmate' : move.isCheck ? 'check' : '',
  ].filter(Boolean);
  const suffix = special.length ? ` (${special.join(', ')})` : '';

  return `${move.san}: ${pieceLabels[move.piece].en} ${move.fromSquare}-${move.toSquare}${capture}${promotion}${suffix}`;
}

export function formatPieceList(pieces: ChessPiece[]): string {
  return pieces.length
    ? pieces.map((piece) => pieceGlyph(piece)).join(' ')
    : '-';
}
