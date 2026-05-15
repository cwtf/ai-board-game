import {
  AIProviderError,
  type AIProvider,
  type CompleteParams,
  type CompleteResult,
  type ListModelsParams,
} from '../types';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GeminiModelsResponse {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
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

const google: AIProvider = {
  id: 'google',
  label: 'Google Gemini',
  platformUrl: 'https://aistudio.google.com/app/apikey',
  defaultModel: 'gemini-2.5-flash',
  availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  requiresApiKey: true,
  async listModels(params: ListModelsParams = {}): Promise<string[]> {
    if (!params.apiKey) {
      throw new AIProviderError('Google Gemini API key is required.', {
        code: 'missing_api_key',
      });
    }

    let response: Response;
    try {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          method: 'GET',
          headers: {
            'x-goog-api-key': params.apiKey,
          },
          signal: params.signal,
        },
      );
    } catch (error) {
      mapFetchError(error);
    }

    const payload = await readJson<GeminiModelsResponse>(response);
    if (!response.ok) {
      throw new AIProviderError(
        payload.error?.message ?? 'Google Gemini model list request failed.',
        {
          code: payload.error?.status ?? 'provider_error',
          status: response.status,
          raw: payload,
        },
      );
    }

    return Array.from(
      new Set(
        (payload.models ?? [])
          .filter((model) =>
            model.supportedGenerationMethods?.includes('generateContent'),
          )
          .map((model) => model.name?.replace(/^models\//, ''))
          .filter((id): id is string => Boolean(id)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  },
  async complete(params: CompleteParams): Promise<CompleteResult> {
    if (!params.apiKey) {
      throw new AIProviderError('Google Gemini API key is required.', {
        code: 'missing_api_key',
      });
    }

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': params.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: params.system
              ? { parts: [{ text: params.system }] }
              : undefined,
            contents: params.messages.map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
            generationConfig: {
              temperature: params.temperature,
              maxOutputTokens: params.maxTokens,
              responseMimeType:
                params.responseFormat === 'json'
                  ? 'application/json'
                  : undefined,
            },
          }),
          signal: params.signal,
        },
      );
    } catch (error) {
      mapFetchError(error);
    }

    const payload = await readJson<GeminiResponse>(response);
    if (!response.ok) {
      throw new AIProviderError(
        payload.error?.message ?? 'Google Gemini request failed.',
        {
          code: payload.error?.status ?? 'provider_error',
          status: response.status,
          raw: payload,
        },
      );
    }

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('');
    if (!text) {
      throw new AIProviderError('Google Gemini returned no text content.', {
        code: 'empty_response',
        raw: payload,
      });
    }

    return {
      text,
      usage: {
        input: payload.usageMetadata?.promptTokenCount ?? 0,
        output: payload.usageMetadata?.candidatesTokenCount ?? 0,
      },
      raw: payload,
    };
  },
};

export default google;
