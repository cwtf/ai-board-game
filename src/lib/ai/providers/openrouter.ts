import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openai/gpt-4o-mini',
  availableModels: [
    'openai/gpt-4o-mini',
    'anthropic/claude-sonnet-4',
    'google/gemini-2.5-flash',
  ],
  extraHeaders: {
    'HTTP-Referer': globalThis.location?.origin ?? 'http://localhost:4321',
    'X-Title': 'AI Board Game Platform',
  },
});
