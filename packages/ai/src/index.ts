import { OpenAiProvider } from './openai';
import { type AiProvider } from './provider';

export * from './provider';
export * from './openai';
export * from './planning';

export interface AiEnv {
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
}

/**
 * Provider from environment, or null when AI isn't configured. Callers must
 * surface "not configured" honestly — there is no fake fallback.
 */
export function createProvider(env: AiEnv): AiProvider | null {
  const provider = (env.AI_PROVIDER ?? '').toLowerCase();
  if (provider === 'openai' && env.OPENAI_API_KEY && env.AI_MODEL) {
    return new OpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.AI_MODEL, baseUrl: env.OPENAI_BASE_URL || undefined });
  }
  return null;
}
