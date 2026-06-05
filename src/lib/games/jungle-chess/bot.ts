import { chooseStrategicJungleMove } from './strategy';
import type { JungleMove, JungleState } from './state';

export interface JungleBotMoveOptions {
  state: JungleState;
  player: number;
  legalMoves: JungleMove[];
  signal?: AbortSignal;
}

export function chooseJungleBotMove(opts: JungleBotMoveOptions): JungleMove {
  return chooseStrategicJungleMove(opts);
}

function abortError(): Error {
  const error = new Error('AI move aborted.');
  error.name = 'AbortError';
  return error;
}

export async function chooseJungleBotMoveAsync(
  opts: JungleBotMoveOptions,
): Promise<JungleMove> {
  if (opts.signal?.aborted) {
    throw abortError();
  }

  if (typeof Worker === 'undefined') {
    await Promise.resolve();
    return chooseJungleBotMove(opts);
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
        resolve(data.move as JungleMove);
        return;
      }

      reject(
        new Error(
          data &&
            typeof data === 'object' &&
            'error' in data &&
            typeof data.error === 'string'
            ? data.error
            : 'Local jungle bot failed to choose a move.',
        ),
      );
    });

    worker.addEventListener('error', (event) => {
      cleanup();
      reject(
        new Error(event.message || 'Local jungle bot worker failed to start.'),
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
