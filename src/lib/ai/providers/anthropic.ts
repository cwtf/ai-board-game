import {
  AIProviderError,
  type AIProvider,
  type CompleteParams,
  type CompleteResult,
  type ListModelsParams,
} from '../types';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
}

interface AnthropicModelsResponse {
  data?: Array<{
    id?: string;
    type?: string;
  }>;
  error?: {
    type?: string;
    message?: string;
  };
}

function jsonSystem(
  system: string,
  responseFormat: CompleteParams['responseFormat'],
): string {
  if (responseFormat !== 'json') {
    return system;
  }

  return `${system}\n\nRespond only with a valid JSON object. Do not wrap it in Markdown.`;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
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

const anthropic: AIProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  platformUrl: 'https://console.anthropic.com/settings/keys',
  defaultModel: 'claude-sonnet-4-20250514',
  availableModels: [
    'claude-sonnet-4-20250514',
    'claude-opus-4-1-20250805',
    'claude-3-7-sonnet-20250219',
  ],
  requiresApiKey: true,
  async listModels(params: ListModelsParams = {}): Promise<string[]> {
    if (!params.apiKey) {
      throw new AIProviderError('Anthropic API key is required.', {
        code: 'missing_api_key',
      });
    }

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': params.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        signal: params.signal,
      });
    } catch (error) {
      mapFetchError(error);
    }

    const payload = await readJson<AnthropicModelsResponse>(response);
    if (!response.ok) {
      throw new AIProviderError(
        payload.error?.message ?? 'Anthropic model list request failed.',
        {
          code: payload.error?.type ?? 'provider_error',
          status: response.status,
          raw: payload,
        },
      );
    }

    return Array.from(
      new Set(
        (payload.data ?? [])
          .filter((model) => model.type === 'model')
          .map((model) => model.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  },
  async complete(params: CompleteParams): Promise<CompleteResult> {
    if (!params.apiKey) {
      throw new AIProviderError('Anthropic API key is required.', {
        code: 'missing_api_key',
      });
    }

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': params.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: params.model,
          system: jsonSystem(params.system, params.responseFormat),
          messages: params.messages,
          max_tokens: params.maxTokens ?? 1024,
          temperature: params.temperature,
        }),
        signal: params.signal,
      });
    } catch (error) {
      mapFetchError(error);
    }

    const payload = await readJson<AnthropicResponse>(response);
    if (!response.ok) {
      throw new AIProviderError(
        payload.error?.message ?? 'Anthropic request failed.',
        {
          code: payload.error?.type ?? 'provider_error',
          status: response.status,
          raw: payload,
        },
      );
    }

    const text = payload.content?.find((part) => part.type === 'text')?.text;
    if (!text) {
      throw new AIProviderError('Anthropic returned no text content.', {
        code: 'empty_response',
        raw: payload,
      });
    }

    return {
      text,
      usage: {
        input: payload.usage?.input_tokens ?? 0,
        output: payload.usage?.output_tokens ?? 0,
      },
      raw: payload,
    };
  },
};

export default anthropic;
