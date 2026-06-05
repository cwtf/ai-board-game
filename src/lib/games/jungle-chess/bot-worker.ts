import { chooseJungleBotMove } from './bot';
import type { JungleMove, JungleState } from './state';

type JungleBotWorkerRequest = {
  state: JungleState;
  player: number;
  legalMoves: JungleMove[];
};

type JungleBotWorkerResponse =
  | { ok: true; move: JungleMove }
  | { ok: false; error: string };

type JungleBotWorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<JungleBotWorkerRequest>) => void,
  ): void;
  postMessage(message: JungleBotWorkerResponse): void;
};

const ctx = globalThis as unknown as JungleBotWorkerScope;

ctx.addEventListener(
  'message',
  (event: MessageEvent<JungleBotWorkerRequest>) => {
    try {
      const move = chooseJungleBotMove(event.data);
      ctx.postMessage({ ok: true, move } satisfies JungleBotWorkerResponse);
    } catch (e) {
      ctx.postMessage({
        ok: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      } satisfies JungleBotWorkerResponse);
    }
  },
);
