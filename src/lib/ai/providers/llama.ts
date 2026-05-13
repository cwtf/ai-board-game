import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'llama',
  label: 'Llama',
  defaultModel: 'llama-3.1-8b-instruct',
  availableModels: [
    'llama-3.1-8b-instruct',
    'llama-3.3-70b-instruct',
    'meta-llama/llama-3.1-8b-instruct',
  ],
  requiresApiKey: false,
  requiresEndpointUrl: true,
  endpointLabel: 'OpenAI-compatible base URL',
});
