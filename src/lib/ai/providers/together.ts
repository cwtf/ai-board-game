import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'together',
  label: 'Together AI',
  platformUrl: 'https://api.together.ai/settings/api-keys',
  baseUrl: 'https://api.together.ai/v1',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  availableModels: [
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'Qwen/Qwen3-235B-A22B-Instruct-2507-tput',
    'deepseek-ai/DeepSeek-V4-Pro',
  ],
  listModels: true,
});
