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

function endpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/api/chat') ? base : `${base}/api/chat`;
}

async function readJson(response: Response): Promise<OllamaResponse> {
  try {
    return (await response.json()) as OllamaResponse;
  } catch {
    return {};
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
  defaultModel: 'llama3.2',
  availableModels: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5'],
  requiresApiKey: false,
  requiresEndpointUrl: false,
  endpointLabel: 'Ollama URL',
  defaultEndpointUrl: 'http://localhost:11434',
  async complete(params: CompleteParams): Promise<CompleteResult> {
    let response: Response;
    try {
      response = await fetch(
        endpoint(params.endpointUrl ?? 'http://localhost:11434'),
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

    const payload = await readJson(response);
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
