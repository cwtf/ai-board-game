import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'deepseek',
  label: 'DeepSeek',
  platformUrl: 'https://platform.deepseek.com/api_keys',
  baseUrl: 'https://api.deepseek.com',
  defaultModel: 'deepseek-v4-flash',
  availableModels: [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  listModels: true,
});
