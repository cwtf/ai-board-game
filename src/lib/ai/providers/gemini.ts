import { createOpenAICompatibleProvider } from './openai-compatible';

export default createOpenAICompatibleProvider({
  id: 'gemini',
  label: 'Google AI Studio',
  platformUrl: 'https://aistudio.google.com/apikey',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  defaultModel: 'gemini-2.0-flash',
  availableModels: [
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  freeApi: true,
  listModels: true,
});
