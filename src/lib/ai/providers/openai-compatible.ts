import {
  AIProviderError,
  type AIProvider,
  type CompleteParams,
  type CompleteResult,
  type ListModelsParams,
} from '../types';

interface OpenAICompatibleOptions {
  id: AIProvider['id'];
  label: string;
  platformUrl?: string;
  defaultModel: string;
  availableModels: string[];
  baseUrl?: string;
  requiresApiKey?: boolean;
  requiresEndpointUrl?: boolean;
  endpointLabel?: string;
  defaultEndpointUrl?: string;
  extraHeaders?: Record<string, string>;
  listModels?: boolean | ((params?: ListModelsParams) => Promise<string[]>);
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

interface ModelListResponse {
  data?: ModelRecord[];
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

type ModelRecord = Record<string, unknown>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function chatCompletionsUrl(baseUrl: string): string {
  const base = trimTrailingSlash(baseUrl);
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

function modelsUrl(baseUrl: string): string {
  const base = trimTrailingSlash(baseUrl);
  if (base.endsWith('/models')) {
    return base;
  }
  if (base.endsWith('/chat/completions')) {
    return `${base.slice(0, -'/chat/completions'.length)}/models`;
  }
  if (base.endsWith('/completions')) {
    return `${base.slice(0, -'/completions'.length)}/models`;
  }
  return `${base}/models`;
}

async function readJson(response: Response): Promise<ChatCompletionResponse> {
  try {
    return (await response.json()) as ChatCompletionResponse;
  } catch {
    return {};
  }
}

function providerError(
  response: Response,
  body: ChatCompletionResponse,
): AIProviderError {
  const message =
    body.error?.message ??
    `Provider request failed with ${response.status} ${response.statusText || 'error'}`;
  return new AIProviderError(message, {
    code: body.error?.code ?? body.error?.type ?? 'provider_error',
    status: response.status,
    raw: body,
  });
}

function mapFetchError(error: unknown): never {
  if (error instanceof DOMException && error.name === 'AbortError') {
    throw new AIProviderError('Request aborted.', {
      code: 'aborted',
      raw: error,
    });
  }

  throw new AIProviderError(
    error instanceof Error ? error.message : 'Network request failed.',
    {
      code: 'network_error',
      raw: error,
    },
  );
}

async function readModelJson(
  response: Response,
): Promise<ModelListResponse | ModelRecord[]> {
  try {
    return (await response.json()) as ModelListResponse | ModelRecord[];
  } catch {
    return {};
  }
}

function modelId(model: ModelRecord): string | undefined {
  return typeof model.id === 'string' ? model.id : undefined;
}

function isLikelyChatModel(model: ModelRecord): boolean {
  const id = modelId(model);
  if (!id) {
    return false;
  }

  const type = typeof model.type === 'string' ? model.type : undefined;
  if (type && !['chat', 'language', 'code'].includes(type)) {
    return false;
  }

  const capabilities =
    model.capabilities && typeof model.capabilities === 'object'
      ? (model.capabilities as Record<string, unknown>)
      : undefined;
  if (capabilities?.completion_chat === false) {
    return false;
  }

  const normalized = id.toLowerCase();
  return ![
    'audio',
    'babbage',
    'dall-e',
    'embedding',
    'image',
    'moderation',
    'rerank',
    'speech',
    'tts',
    'whisper',
  ].some((blocked) => normalized.includes(blocked));
}

export async function listOpenAICompatibleModels(
  options: Pick<
    OpenAICompatibleOptions,
    'baseUrl' | 'defaultEndpointUrl' | 'extraHeaders' | 'label' | 'requiresApiKey'
  >,
  params: ListModelsParams = {},
): Promise<string[]> {
  if ((options.requiresApiKey ?? true) && !params.apiKey) {
    throw new AIProviderError(`${options.label} API key is required.`, {
      code: 'missing_api_key',
    });
  }

  const endpointBase =
    params.endpointUrl ?? options.defaultEndpointUrl ?? options.baseUrl;
  if (!endpointBase) {
    throw new AIProviderError(`${options.label} endpoint URL is required.`, {
      code: 'missing_endpoint_url',
    });
  }

  let response: Response;
  try {
    response = await fetch(modelsUrl(endpointBase), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : {}),
        ...options.extraHeaders,
      },
      signal: params.signal,
    });
  } catch (error) {
    mapFetchError(error);
  }

  const payload = await readModelJson(response);
  if (!response.ok) {
    const body = Array.isArray(payload) ? {} : payload;
    throw new AIProviderError(
      body.error?.message ??
        `${options.label} model list request failed with ${response.status} ${response.statusText || 'error'}`,
      {
        code: body.error?.code ?? body.error?.type ?? 'provider_error',
        status: response.status,
        raw: payload,
      },
    );
  }

  const models = Array.isArray(payload) ? payload : (payload.data ?? []);
  return Array.from(
    new Set(
      models
        .filter(isLikelyChatModel)
        .map(modelId)
        .filter((id): id is string => Boolean(id)),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleOptions,
): AIProvider {
  return {
    id: options.id,
    label: options.label,
    platformUrl: options.platformUrl,
    defaultModel: options.defaultModel,
    availableModels: options.availableModels,
    requiresApiKey: options.requiresApiKey ?? true,
    requiresEndpointUrl: options.requiresEndpointUrl,
    endpointLabel: options.endpointLabel,
    defaultEndpointUrl: options.defaultEndpointUrl,
    listModels:
      typeof options.listModels === 'function'
        ? options.listModels
        : options.listModels
          ? (params = {}) => listOpenAICompatibleModels(options, params)
          : undefined,
    async complete(params: CompleteParams): Promise<CompleteResult> {
      if ((options.requiresApiKey ?? true) && !params.apiKey) {
        throw new AIProviderError(`${options.label} API key is required.`, {
          code: 'missing_api_key',
        });
      }

      const endpointBase =
        params.endpointUrl ?? options.defaultEndpointUrl ?? options.baseUrl;
      if (!endpointBase) {
        throw new AIProviderError(
          `${options.label} endpoint URL is required.`,
          {
            code: 'missing_endpoint_url',
          },
        );
      }

      const messages = [
        ...(params.system
          ? [{ role: 'system' as const, content: params.system }]
          : []),
        ...params.messages,
      ];

      const body = {
        model: params.model,
        messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        response_format:
          params.responseFormat === 'json'
            ? ({ type: 'json_object' } as const)
            : undefined,
      };

      let response: Response;
      try {
        response = await fetch(chatCompletionsUrl(endpointBase), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(params.apiKey
              ? { Authorization: `Bearer ${params.apiKey}` }
              : {}),
            ...options.extraHeaders,
          },
          body: JSON.stringify(body),
          signal: params.signal,
        });
      } catch (error) {
        mapFetchError(error);
      }

      const payload = await readJson(response);
      if (!response.ok) {
        throw providerError(response, payload);
      }

      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new AIProviderError(
          `${options.label} returned no message content.`,
          {
            code: 'empty_response',
            raw: payload,
          },
        );
      }

      return {
        text,
        usage: {
          input: payload.usage?.prompt_tokens ?? 0,
          output: payload.usage?.completion_tokens ?? 0,
        },
        raw: payload,
      };
    },
  };
}
