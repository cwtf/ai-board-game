import { createOpenAICompatibleProvider } from './openai-compatible';
import { AIProviderError } from '../types';

interface OpenRouterModelsResponse {
  data?: Array<{
    id?: string;
    architecture?: {
      output_modalities?: string[];
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

const MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=text';

async function readJson(response: Response): Promise<OpenRouterModelsResponse> {
  try {
    return (await response.json()) as OpenRouterModelsResponse;
  } catch {
    return {};
  }
}

export default createOpenAICompatibleProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  platformUrl: 'https://openrouter.ai/settings/keys',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openai/gpt-4o-mini',
  availableModels: [
    'openai/gpt-4o-mini',
    'anthropic/claude-sonnet-4',
    'google/gemini-2.5-flash',
  ],
  freeApi: true,
  async listModels(params = {}): Promise<string[]> {
    const fetchModels = async (useApiKey: boolean) =>
      fetch(MODELS_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(useApiKey && params.apiKey
            ? { Authorization: `Bearer ${params.apiKey}` }
            : {}),
        },
        signal: params.signal,
      });

    let response: Response;
    try {
      response = await fetchModels(false);
      if ((response.status === 401 || response.status === 403) && params.apiKey) {
        response = await fetchModels(true);
      }
    } catch (error) {
      if (params.apiKey) {
        try {
          response = await fetchModels(true);
        } catch (retryError) {
          throw new AIProviderError(
            retryError instanceof Error
              ? retryError.message
              : 'Network request failed.',
            {
              code: 'network_error',
              raw: retryError,
            },
          );
        }
      } else {
        throw new AIProviderError(
          error instanceof Error ? error.message : 'Network request failed.',
          {
            code: 'network_error',
            raw: error,
          },
        );
      }
    }

    const payload = await readJson(response);
    if (!response.ok) {
      throw new AIProviderError(
        payload.error?.message ?? 'OpenRouter model list request failed.',
        {
          code: payload.error?.code ?? payload.error?.type ?? 'provider_error',
          status: response.status,
          raw: payload,
        },
      );
    }

    return Array.from(
      new Set(
        (payload.data ?? [])
          .filter(
            (model) =>
              !model.architecture?.output_modalities ||
              model.architecture.output_modalities.includes('text'),
          )
          .map((model) => model.id)
          .filter((model): model is string => Boolean(model)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  },
  extraHeaders: {
    'HTTP-Referer': globalThis.location?.origin ?? 'http://localhost:4321',
    'X-Title': 'AI Board Game Platform',
  },
});
