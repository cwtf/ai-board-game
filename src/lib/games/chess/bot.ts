import { chooseStrategicChessMove } from './strategy';
import type { ChessMove, ChessState } from './state';

export interface ChessBotMoveOptions {
  state: ChessState;
  player: number;
  legalMoves: ChessMove[];
  signal?: AbortSignal;
}

export function chooseChessBotMove(opts: ChessBotMoveOptions): ChessMove {
  return chooseStrategicChessMove(opts);
}

function abortError(): Error {
  const error = new Error('AI move aborted.');
  error.name = 'AbortError';
  return error;
}

export async function chooseChessBotMoveAsync(
  opts: ChessBotMoveOptions,
): Promise<ChessMove> {
  if (opts.signal?.aborted) {
    throw abortError();
  }

  if (typeof Worker === 'undefined') {
    await Promise.resolve();
    return chooseChessBotMove(opts);
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./bot-worker.ts', import.meta.url), {
      type: 'module',
    });

    function cleanup() {
      opts.signal?.removeEventListener('abort', handleAbort);
      worker.terminate();
    }

    function handleAbort() {
      cleanup();
      reject(abortError());
    }

    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data;
      cleanup();

      if (
        data &&
        typeof data === 'object' &&
        'ok' in data &&
        data.ok === true &&
        'move' in data
      ) {
        resolve(data.move as ChessMove);
        return;
      }

      reject(
        new Error(
          data &&
            typeof data === 'object' &&
            'error' in data &&
            typeof data.error === 'string'
            ? data.error
            : 'Local chess bot failed to choose a move.',
        ),
      );
    });

    worker.addEventListener('error', (event) => {
      cleanup();
      reject(
        new Error(event.message || 'Local chess bot worker failed to start.'),
      );
    });

    opts.signal?.addEventListener('abort', handleAbort, { once: true });
    worker.postMessage({
      state: opts.state,
      player: opts.player,
      legalMoves: opts.legalMoves,
    });
  });
}
