import type {
  AIProvider,
  ChatMessage,
  ProviderId,
  TokenUsage,
} from '@/lib/ai/types';

export interface GameMeta {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  hiddenInformation: boolean;
  estimatedAITurnTokens: number;
  docPath: string;
  videoPath?: string;
}

export interface GameAdapter<State, Move> {
  meta: GameMeta;
  init(opts: {
    seed?: string;
    playerCount: number;
    aiPlayerIndices: number[];
  }): State;
  legalMoves(state: State, player: number): Move[];
  applyMove(state: State, move: Move): State;
  currentPlayer(state: State): number;
  isTerminal(state: State): boolean;
  winner(state: State): number | null;
  systemPrompt(): string;
  serializeForAI(state: State, player: number, legalMoves: Move[]): string;
  prepareAIMove?(state: State, player: number, move: Move): Move;
  parseAIMove(
    response: string,
    legalMoves: Move[],
  ): { ok: true; move: Move } | { ok: false; error: string };
}

export type MoveSource = 'human' | 'ai' | 'fallback';

export interface MoveRecord<Move = unknown> {
  turn: number;
  player: number;
  move: Move;
  source: MoveSource;
  providerId?: ProviderId;
  model?: string;
  usage?: TokenUsage;
  attempts: number;
  error?: string;
  at: string;
}

export interface ProviderAIPlayerConfig {
  kind?: 'provider';
  provider: AIProvider;
  model: string;
  apiKey?: string;
  endpointUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LocalAIPlayerConfig<State = unknown, Move = unknown> {
  kind: 'local';
  label: string;
  model: string;
  chooseMove(opts: {
    state: State;
    player: number;
    legalMoves: Move[];
    signal?: AbortSignal;
  }): Move | Promise<Move>;
}

export type AIPlayerConfig<State = unknown, Move = unknown> =
  | ProviderAIPlayerConfig
  | LocalAIPlayerConfig<State, Move>;

export interface AIMoveRequest {
  system: string;
  messages: ChatMessage[];
  responseFormat: 'json';
}

export function createMoveRecord<Move>(opts: {
  turn: number;
  player: number;
  move: Move;
  source: MoveSource;
  providerId?: ProviderId;
  model?: string;
  usage?: TokenUsage;
  attempts?: number;
  error?: string;
}): MoveRecord<Move> {
  return {
    attempts: opts.attempts ?? 1,
    at: new Date().toISOString(),
    ...opts,
  };
}

export function addUsage(left: TokenUsage, right?: TokenUsage): TokenUsage {
  return {
    input: left.input + (right?.input ?? 0),
    output: left.output + (right?.output ?? 0),
  };
}
