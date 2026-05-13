import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'kimi',
  label: 'Kimi',
  baseUrl: 'https://api.moonshot.ai/v1',
  defaultModel: 'kimi-k2.5',
  availableModels: ['kimi-k2.5', 'kimi-k2-turbo-preview', 'kimi-k2-thinking'],
});
