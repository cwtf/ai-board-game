import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'cloudflare',
  label: 'Cloudflare Workers AI',
  platformUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  availableModels: [
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-3.1-8b-instruct',
    '@cf/google/gemma-3-12b-it',
    '@cf/mistral/mistral-7b-instruct-v0.2',
  ],
  requiresEndpointUrl: true,
  endpointLabel: 'Workers AI base URL (replace YOUR_ACCOUNT_ID)',
  defaultEndpointUrl:
    'https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1',
  freeApi: true,
  listModels: true,
});
