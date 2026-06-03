import { chooseStrategicChineseChessMove } from './strategy';
import type { ChineseChessMove, ChineseChessState } from './state';

export function chooseChineseChessBotMove(opts: {
  state: ChineseChessState;
  player: number;
  legalMoves: ChineseChessMove[];
}): ChineseChessMove {
  return chooseStrategicChineseChessMove(opts);
}
