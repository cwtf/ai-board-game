import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'cerebras',
  label: 'Cerebras',
  platformUrl: 'https://cloud.cerebras.ai/platform/api-keys',
  baseUrl: 'https://api.cerebras.ai/v1',
  defaultModel: 'llama-3.3-70b',
  availableModels: [
    'llama-3.3-70b',
    'llama3.1-8b',
    'llama-4-scout-17b-16e-instruct',
  ],
  freeApi: true,
  listModels: true,
});
