import anthropic from './providers/anthropic';
import cerebras from './providers/cerebras';
import cloudflare from './providers/cloudflare';
import deepseek from './providers/deepseek';
import gemini from './providers/gemini';
import glm from './providers/glm';
import google from './providers/google';
import groq from './providers/groq';
import huggingface from './providers/huggingface';
import kimi from './providers/kimi';
import llama from './providers/llama';
import mistral from './providers/mistral';
import ollama from './providers/ollama';
import openai from './providers/openai';
import openrouter from './providers/openrouter';
import qwen from './providers/qwen';
import together from './providers/together';
import type { AIProvider, ProviderId } from './types';

const providers = [
  openai,
  anthropic,
  google,
  gemini,
  deepseek,
  groq,
  cerebras,
  huggingface,
  mistral,
  together,
  kimi,
  glm,
  qwen,
  llama,
  openrouter,
  ollama,
  cloudflare,
] satisfies AIProvider[];

const providerMap = new Map<ProviderId, AIProvider>(
  providers.map((provider) => [provider.id, provider]),
);

export function listProviders(): AIProvider[] {
  return providers;
}

export function getProvider(id: ProviderId): AIProvider {
  const provider = providerMap.get(id);
  if (!provider) {
    throw new Error(`Unknown AI provider: ${id}`);
  }

  return provider;
}

export type {
  AIProvider,
  ChatMessage,
  CompleteParams,
  CompleteResult,
  ListModelsParams,
  ProviderId,
  TokenUsage,
} from './types';
