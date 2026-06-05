import { chooseStrategicChessMove } from './strategy';
import type { ChessMove, ChessState } from './state';

export function chooseChessBotMove(opts: {
  state: ChessState;
  player: number;
  legalMoves: ChessMove[];
}): ChessMove {
  return chooseStrategicChessMove(opts);
}
