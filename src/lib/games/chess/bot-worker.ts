import { chooseStrategicChessMove } from './strategy';
import type { ChessMove, ChessState } from './state';

type ChessBotWorkerRequest = {
  state: ChessState;
  player: number;
  legalMoves: ChessMove[];
};

type ChessBotWorkerResponse =
  | { ok: true; move: ChessMove }
  | { ok: false; error: string };

type ChessBotWorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ChessBotWorkerRequest>) => void,
  ): void;
  postMessage(message: ChessBotWorkerResponse): void;
};

const ctx = globalThis as unknown as ChessBotWorkerScope;

ctx.addEventListener(
  'message',
  (event: MessageEvent<ChessBotWorkerRequest>) => {
    try {
      const move = chooseStrategicChessMove(event.data);
      ctx.postMessage({ ok: true, move } satisfies ChessBotWorkerResponse);
    } catch (error) {
      ctx.postMessage({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Local chess bot failed to choose a move.',
      } satisfies ChessBotWorkerResponse);
    }
  },
);
