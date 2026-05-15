import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'mistral',
  label: 'Mistral',
  platformUrl: 'https://console.mistral.ai/api-keys',
  baseUrl: 'https://api.mistral.ai/v1',
  defaultModel: 'mistral-small-latest',
  availableModels: [
    'mistral-small-latest',
    'mistral-medium-latest',
    'mistral-large-latest',
    'ministral-8b-latest',
  ],
  listModels: true,
});
