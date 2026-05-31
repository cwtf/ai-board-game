import { chooseStrategicJungleMove } from './strategy';
import type { JungleMove, JungleState } from './state';

export function chooseJungleBotMove(opts: {
  state: JungleState;
  player: number;
  legalMoves: JungleMove[];
}): JungleMove {
  return chooseStrategicJungleMove(opts);
}
