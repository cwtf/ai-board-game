import anthropic from './providers/anthropic';
import deepseek from './providers/deepseek';
import glm from './providers/glm';
import google from './providers/google';
import kimi from './providers/kimi';
import llama from './providers/llama';
import ollama from './providers/ollama';
import openai from './providers/openai';
import openrouter from './providers/openrouter';
import qwen from './providers/qwen';
import type { AIProvider, ProviderId } from './types';

const providers = [
  openai,
  anthropic,
  google,
  deepseek,
  kimi,
  glm,
  qwen,
  llama,
  openrouter,
  ollama,
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
  ProviderId,
  TokenUsage,
} from './types';
