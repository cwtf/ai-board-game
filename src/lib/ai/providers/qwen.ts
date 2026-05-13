import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'qwen',
  label: 'Qwen',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  defaultModel: 'qwen-plus',
  availableModels: ['qwen-plus', 'qwen-flash', 'qwen-max', 'qwen3-coder-next'],
});
