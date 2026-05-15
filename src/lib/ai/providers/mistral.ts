import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'mistral',
  label: 'Mistral',
  baseUrl: 'https://api.mistral.ai/v1',
  defaultModel: 'mistral-small-latest',
  availableModels: [
    'mistral-small-latest',
    'mistral-medium-latest',
    'mistral-large-latest',
    'ministral-8b-latest',
  ],
});
