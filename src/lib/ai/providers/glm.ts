import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'glm',
  label: 'GLM',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  defaultModel: 'glm-5.1',
  availableModels: ['glm-5.1', 'glm-4.7', 'glm-4.7-flash', 'glm-4.6'],
});
