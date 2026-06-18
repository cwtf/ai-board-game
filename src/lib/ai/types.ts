export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'together'
  | 'kimi'
  | 'glm'
  | 'qwen'
  | 'llama'
  | 'openrouter'
  | 'ollama'
  | 'gemini'
  | 'cerebras'
  | 'cloudflare'
  | 'huggingface';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface CompleteParams {
  apiKey?: string;
  endpointUrl?: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  responseFormat?: 'text' | 'json';
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface CompleteResult {
  text: string;
  usage?: TokenUsage;
  raw?: unknown;
}

export interface ListModelsParams {
  apiKey?: string;
  endpointUrl?: string;
  signal?: AbortSignal;
}

export interface AIProvider {
  id: ProviderId;
  label: string;
  platformUrl?: string;
  defaultModel: string;
  availableModels: string[];
  requiresApiKey: boolean;
  requiresEndpointUrl?: boolean;
  endpointLabel?: string;
  defaultEndpointUrl?: string;
  freeApi?: boolean;
  listModels?(params?: ListModelsParams): Promise<string[]>;
  complete(params: CompleteParams): Promise<CompleteResult>;
}

export class AIProviderError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly raw?: unknown;

  constructor(
    message: string,
    opts: { code: string; status?: number; raw?: unknown },
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.code = opts.code;
    this.status = opts.status;
    this.raw = opts.raw;
  }
}
