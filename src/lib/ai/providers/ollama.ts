import {
  AIProviderError,
  type AIProvider,
  type CompleteParams,
  type CompleteResult,
} from '../types';

interface OllamaResponse {
  message?: {
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

interface OllamaModelsResponse {
  models?: {
    name?: string;
    model?: string;
  }[];
  error?: string;
}

function endpoint(baseUrl: string, path: 'chat' | 'tags'): string {
  let base = baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/api/chat') || base.endsWith('/api/tags')) {
    base = base.slice(0, base.lastIndexOf('/'));
  }

  if (base.endsWith('/api')) {
    return `${base}/${path}`;
  }

  return `${base}/api/${path}`;
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

const ollama: AIProvider = {
  id: 'ollama',
  label: 'Ollama',
  platformUrl: 'https://ollama.com/library',
  defaultModel: 'llama3.2',
  availableModels: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5'],
  requiresApiKey: false,
  requiresEndpointUrl: false,
  endpointLabel: 'Ollama URL',
  defaultEndpointUrl: 'http://localhost:11434',
  async listModels(params = {}): Promise<string[]> {
    let response: Response;
    try {
      response = await fetch(
        endpoint(params.endpointUrl ?? 'http://localhost:11434', 'tags'),
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal: params.signal,
        },
      );
    } catch (error) {
      mapFetchError(error);
    }

    const payload = await readJson<OllamaModelsResponse>(response);
    if (!response.ok) {
      throw new AIProviderError(
        payload.error ?? 'Ollama model list request failed.',
        {
          code: 'provider_error',
          status: response.status,
          raw: payload,
        },
      );
    }

    const models = (payload.models ?? [])
      .map((model) => model.model ?? model.name)
      .filter((model): model is string => Boolean(model));

    return Array.from(new Set(models));
  },
  async complete(params: CompleteParams): Promise<CompleteResult> {
    let response: Response;
    try {
      response = await fetch(
        endpoint(params.endpointUrl ?? 'http://localhost:11434', 'chat'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: params.model,
            messages: [
              ...(params.system
                ? [{ role: 'system' as const, content: params.system }]
                : []),
              ...params.messages,
            ],
            stream: false,
            format: params.responseFormat === 'json' ? 'json' : undefined,
            options: {
              temperature: params.temperature,
            },
          }),
          signal: params.signal,
        },
      );
    } catch (error) {
      mapFetchError(error);
    }

    const payload = await readJson<OllamaResponse>(response);
    if (!response.ok) {
      throw new AIProviderError(payload.error ?? 'Ollama request failed.', {
        code: 'provider_error',
        status: response.status,
        raw: payload,
      });
    }

    const text = payload.message?.content;
    if (!text) {
      throw new AIProviderError('Ollama returned no message content.', {
        code: 'empty_response',
        raw: payload,
      });
    }

    return {
      text,
      usage: {
        input: payload.prompt_eval_count ?? 0,
        output: payload.eval_count ?? 0,
      },
      raw: payload,
    };
  },
};

export default ollama;
