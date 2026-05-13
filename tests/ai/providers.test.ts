import { afterEach, describe, expect, it, vi } from 'vitest';
import { listProviders } from '@/lib/ai';
import { AIProviderError, type AIProvider } from '@/lib/ai/types';

const openAiLikeProviders = new Set([
  'openai',
  'deepseek',
  'kimi',
  'glm',
  'qwen',
  'llama',
  'openrouter',
]);

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: init?.status ?? 200,
    statusText: init?.statusText,
  });
}

function successPayload(provider: AIProvider): unknown {
  if (provider.id === 'anthropic') {
    return {
      content: [{ type: 'text', text: '{"ok":true}' }],
      usage: { input_tokens: 4, output_tokens: 2 },
    };
  }

  if (provider.id === 'google') {
    return {
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
    };
  }

  if (provider.id === 'ollama') {
    return {
      message: { content: '{"ok":true}' },
      prompt_eval_count: 4,
      eval_count: 2,
    };
  }

  return {
    choices: [{ message: { content: '{"ok":true}' } }],
    usage: { prompt_tokens: 4, completion_tokens: 2 },
  };
}

function errorPayload(provider: AIProvider): unknown {
  if (provider.id === 'anthropic') {
    return { error: { type: 'authentication_error', message: 'bad key' } };
  }

  if (provider.id === 'google') {
    return { error: { status: 'UNAUTHENTICATED', message: 'bad key' } };
  }

  if (provider.id === 'ollama') {
    return { error: 'model missing' };
  }

  return { error: { code: 'bad_key', message: 'bad key' } };
}

function completeParams(provider: AIProvider) {
  return {
    apiKey: provider.requiresApiKey ? 'test-key' : undefined,
    endpointUrl:
      provider.id === 'llama'
        ? 'http://localhost:8080/v1'
        : provider.defaultEndpointUrl,
    model: provider.defaultModel,
    system: 'Reply in JSON.',
    messages: [{ role: 'user' as const, content: 'Reply with {"ok":true}' }],
    responseFormat: 'json' as const,
    temperature: 0,
    maxTokens: 64,
  };
}

describe('AI providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const provider of listProviders()) {
    describe(provider.label, () => {
      it('returns JSON text and token usage from a successful response', async () => {
        const fetchMock = vi
          .fn()
          .mockResolvedValue(jsonResponse(successPayload(provider)));
        vi.stubGlobal('fetch', fetchMock);

        const result = await provider.complete(completeParams(provider));

        expect(JSON.parse(result.text)).toEqual({ ok: true });
        expect(result.usage).toEqual({ input: 4, output: 2 });
        expect(fetchMock).toHaveBeenCalledOnce();
      });

      it('maps provider HTTP errors', async () => {
        vi.stubGlobal(
          'fetch',
          vi
            .fn()
            .mockResolvedValue(
              jsonResponse(errorPayload(provider), { status: 401 }),
            ),
        );

        await expect(
          provider.complete(completeParams(provider)),
        ).rejects.toMatchObject({
          name: 'AIProviderError',
          status: 401,
        });
      });

      it('maps aborts', async () => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
        );

        await expect(
          provider.complete(completeParams(provider)),
        ).rejects.toMatchObject({
          name: 'AIProviderError',
          code: 'aborted',
        });
      });
    });
  }

  it('uses OpenAI-compatible chat completion endpoints where expected', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    for (const provider of listProviders().filter((item) =>
      openAiLikeProviders.has(item.id),
    )) {
      await provider.complete(completeParams(provider));
    }

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('https://api.openai.com/v1/chat/completions');
    expect(urls).toContain('https://api.deepseek.com/chat/completions');
    expect(urls).toContain('https://api.moonshot.ai/v1/chat/completions');
    expect(urls).toContain(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    );
    expect(urls).toContain(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
    expect(urls).toContain('http://localhost:8080/v1/chat/completions');
    expect(urls).toContain('https://openrouter.ai/api/v1/chat/completions');
  });

  it('throws typed missing credential errors before fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listProviders()[0].complete({
        ...completeParams(listProviders()[0]),
        apiKey: '',
      }),
    ).rejects.toBeInstanceOf(AIProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
