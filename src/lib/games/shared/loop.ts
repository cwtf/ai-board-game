import type { AIProviderError, ChatMessage } from '@/lib/ai/types';
import { createRng, type Rng } from './rng';
import {
  addUsage,
  createMoveRecord,
  type AIPlayerConfig,
  type GameAdapter,
  type MoveRecord,
} from './types';

type LoopStatus = 'idle' | 'thinking' | 'terminal';

export interface LoopSnapshot<State, Move> {
  state: State;
  status: LoopStatus;
  currentPlayer: number;
  winner: number | null;
  log: MoveRecord<Move>[];
  totalUsage: { input: number; output: number };
  warning?: string;
}

export interface GameLoopOptions<State, Move> {
  adapter: GameAdapter<State, Move>;
  initialState: State;
  aiPlayers:
    | Map<number, AIPlayerConfig<State, Move>>
    | Record<number, AIPlayerConfig<State, Move>>;
  maxRetries?: number;
  rng?: Rng;
}

export interface GameLoop<State, Move> {
  subscribe(
    subscriber: (snapshot: LoopSnapshot<State, Move>) => void,
  ): () => void;
  getSnapshot(): LoopSnapshot<State, Move>;
  setAIPlayers(aiPlayers: GameLoopOptions<State, Move>['aiPlayers']): void;
  clearWarning(): void;
  playHumanMove(move: Move): void;
  step(signal?: AbortSignal): Promise<boolean>;
  runUntilBlocked(signal?: AbortSignal): Promise<void>;
}

function aiConfigFor<State, Move>(
  configs: GameLoopOptions<State, Move>['aiPlayers'],
  player: number,
) {
  return configs instanceof Map ? configs.get(player) : configs[player];
}

function isLocalAIConfig<State, Move>(
  ai: AIPlayerConfig<State, Move>,
): ai is Extract<AIPlayerConfig<State, Move>, { kind: 'local' }> {
  return ai.kind === 'local';
}

function abortError(): Error {
  const error = new Error('AI move aborted.');
  error.name = 'AbortError';
  return error;
}

function providerIdFor<State, Move>(ai?: AIPlayerConfig<State, Move>) {
  return ai && !isLocalAIConfig(ai) ? ai.provider.id : undefined;
}

function isProviderError(error: unknown): error is AIProviderError {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}

function moveId(move: unknown): string | undefined {
  if (!move || typeof move !== 'object' || !('id' in move)) {
    return undefined;
  }

  const id = (move as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

function isLegalHumanMove<Move>(move: Move, legalMoves: Move[]): boolean {
  if (legalMoves.includes(move)) {
    return true;
  }

  const id = moveId(move);
  return Boolean(
    id && legalMoves.some((candidate) => moveId(candidate) === id),
  );
}

export function createGameLoop<State, Move>({
  adapter,
  initialState,
  aiPlayers,
  maxRetries = 3,
  rng = createRng('loop-fallback'),
}: GameLoopOptions<State, Move>): GameLoop<State, Move> {
  let state = initialState;
  let status: LoopStatus = adapter.isTerminal(state) ? 'terminal' : 'idle';
  let warning: string | undefined;
  let currentAIPlayers = aiPlayers;
  const log: MoveRecord<Move>[] = [];
  let totalUsage = { input: 0, output: 0 };
  const subscribers = new Set<(snapshot: LoopSnapshot<State, Move>) => void>();

  function snapshot(): LoopSnapshot<State, Move> {
    return {
      state,
      status,
      currentPlayer: adapter.currentPlayer(state),
      winner: adapter.winner(state),
      log: [...log],
      totalUsage,
      warning,
    };
  }

  function emit() {
    const current = snapshot();
    for (const subscriber of subscribers) {
      subscriber(current);
    }
  }

  function applyMove(opts: {
    move: Move;
    source: 'human' | 'ai' | 'fallback';
    player: number;
    attempts?: number;
    ai?: AIPlayerConfig<State, Move>;
    usage?: { input: number; output: number };
    error?: string;
  }) {
    state = adapter.applyMove(state, opts.move);
    log.push(
      createMoveRecord({
        turn: log.length,
        player: opts.player,
        move: opts.move,
        source: opts.source,
        providerId: providerIdFor(opts.ai),
        model: opts.ai?.model,
        usage: opts.usage,
        attempts: opts.attempts,
        error: opts.error,
      }),
    );
    status = adapter.isTerminal(state) ? 'terminal' : 'idle';
    emit();
  }

  function prepareAndValidateAIMove(
    player: number,
    move: Move,
  ): { ok: true; move: Move } | { ok: false; error: string } {
    const prepared = adapter.prepareAIMove?.(state, player, move) ?? move;
    try {
      adapter.applyMove(state, prepared);
      return { ok: true, move: prepared };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Move could not be applied.',
      };
    }
  }

  async function requestAIMove(
    player: number,
    legalMoves: Move[],
    ai: AIPlayerConfig<State, Move>,
    signal?: AbortSignal,
  ): Promise<{
    move: Move;
    attempts: number;
    usage?: { input: number; output: number };
    error?: string;
  }> {
    const basePayload = adapter.serializeForAI(state, player, legalMoves);
    const messages: ChatMessage[] = [{ role: 'user', content: basePayload }];
    let lastError: string | undefined;
    let requestUsage = { input: 0, output: 0 };

    if (isLocalAIConfig(ai)) {
      if (signal?.aborted) {
        throw abortError();
      }

      const localMove = await ai.chooseMove({
        state,
        player,
        legalMoves,
        signal,
      });
      if (signal?.aborted) {
        throw abortError();
      }

      const prepared = prepareAndValidateAIMove(player, localMove);
      if (prepared.ok) {
        return {
          move: prepared.move,
          attempts: 1,
          usage: requestUsage,
        };
      }

      lastError = prepared.error;
      const fallbackOptions = legalMoves
        .map((move) => prepareAndValidateAIMove(player, move))
        .filter((result): result is { ok: true; move: Move } => result.ok);
      if (fallbackOptions.length === 0) {
        throw new Error(`No applicable fallback move. ${lastError}`);
      }

      return {
        move: fallbackOptions[rng.int(fallbackOptions.length)].move,
        attempts: 1,
        usage: requestUsage,
        error: lastError,
      };
    }

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const result = await ai.provider.complete({
        apiKey: ai.apiKey,
        endpointUrl: ai.endpointUrl,
        model: ai.model,
        system: adapter.systemPrompt(),
        messages,
        responseFormat: 'json',
        temperature: ai.temperature,
        maxTokens: ai.maxTokens,
        signal,
      });

      totalUsage = addUsage(totalUsage, result.usage);
      requestUsage = addUsage(requestUsage, result.usage);
      const parsed = adapter.parseAIMove(result.text, legalMoves);
      if (parsed.ok) {
        const prepared = prepareAndValidateAIMove(player, parsed.move);
        if (prepared.ok) {
          return {
            move: prepared.move,
            attempts: attempt,
            usage: requestUsage,
          };
        }

        lastError = prepared.error;
        messages.push(
          { role: 'assistant' as const, content: result.text },
          {
            role: 'user' as const,
            content: `Invalid move: ${prepared.error}. Return one valid JSON move from the legal move list, including required sub-decisions.`,
          },
        );
        continue;
      }

      lastError = parsed.error;
      messages.push(
        { role: 'assistant' as const, content: result.text },
        {
          role: 'user' as const,
          content: `Invalid move: ${parsed.error}. Return one valid JSON move from the legal move list.`,
        },
      );
    }

    const fallbackOptions = legalMoves
      .map((move) => prepareAndValidateAIMove(player, move))
      .filter((result): result is { ok: true; move: Move } => result.ok);
    if (fallbackOptions.length === 0) {
      throw new Error(
        lastError
          ? `No applicable fallback move after AI errors. ${lastError}`
          : 'No applicable fallback move after AI errors.',
      );
    }

    const fallback = fallbackOptions[rng.int(fallbackOptions.length)].move;
    return {
      move: fallback,
      attempts: maxRetries,
      usage: requestUsage,
      error: lastError ?? 'AI did not return a valid move.',
    };
  }

  return {
    subscribe(subscriber) {
      subscribers.add(subscriber);
      subscriber(snapshot());

      return () => {
        subscribers.delete(subscriber);
      };
    },
    getSnapshot: snapshot,
    setAIPlayers(nextAIPlayers) {
      currentAIPlayers = nextAIPlayers;
      emit();
    },
    clearWarning() {
      warning = undefined;
      emit();
    },
    playHumanMove(move) {
      if (adapter.isTerminal(state)) {
        throw new Error('Cannot play a move after the game has ended.');
      }

      const player = adapter.currentPlayer(state);
      if (aiConfigFor(currentAIPlayers, player)) {
        throw new Error('Current player is controlled by AI.');
      }

      const legalMoves = adapter.legalMoves(state, player);
      if (!isLegalHumanMove(move, legalMoves)) {
        throw new Error('Move is not legal for the current player.');
      }

      warning = undefined;
      applyMove({ move, source: 'human', player });
    },
    async step(signal) {
      if (adapter.isTerminal(state)) {
        status = 'terminal';
        emit();
        return false;
      }

      const player = adapter.currentPlayer(state);
      const ai = aiConfigFor(currentAIPlayers, player);
      if (!ai) {
        status = 'idle';
        emit();
        return false;
      }

      const legalMoves = adapter.legalMoves(state, player);
      if (legalMoves.length === 0) {
        throw new Error(`AI player ${player} has no legal moves.`);
      }

      status = 'thinking';
      warning = undefined;
      emit();

      try {
        const result = await requestAIMove(player, legalMoves, ai, signal);
        warning = result.error
          ? `AI move failed validation; used random legal fallback. ${result.error}`
          : undefined;
        applyMove({
          move: result.move,
          source: result.error ? 'fallback' : 'ai',
          player,
          attempts: result.attempts,
          ai,
          usage: result.usage,
          error: result.error,
        });
        return true;
      } catch (error) {
        status = 'idle';
        warning = isProviderError(error) ? error.message : 'AI move failed.';
        emit();
        throw error;
      }
    },
    async runUntilBlocked(signal) {
      while (await this.step(signal)) {
        if (adapter.isTerminal(state)) {
          break;
        }
      }
    },
  };
}
