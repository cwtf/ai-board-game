import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'openai',
  label: 'OpenAI',
  platformUrl: 'https://platform.openai.com/api-keys',
  baseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
  availableModels: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
  listModels: true,
});
