import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'huggingface',
  label: 'Hugging Face',
  platformUrl: 'https://huggingface.co/settings/tokens',
  baseUrl: 'https://router.huggingface.co/v1',
  defaultModel: 'meta-llama/Llama-3.1-8B-Instruct',
  availableModels: [
    'meta-llama/Llama-3.1-8B-Instruct',
    'meta-llama/Llama-3.3-70B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.3',
    'Qwen/Qwen2.5-72B-Instruct',
  ],
  freeApi: true,
  listModels: true,
});
