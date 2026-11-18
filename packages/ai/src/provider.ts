import { z } from 'zod';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface CompletionRequest<T> {
  system: string;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  /** Name for the JSON schema sent to the provider. */
  schemaName: string;
}

export interface CompletionResult<T> {
  data: T;
  usage: TokenUsage;
  model: string;
  /** Raw text, kept so the conversation can be audited. */
  raw: string;
}

/** A language-model backend that returns JSON validated against a Zod schema. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete<T>(req: CompletionRequest<T>): Promise<CompletionResult<T>>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('No AI provider is configured. Set AI_PROVIDER, AI_MODEL and the provider API key.');
    this.name = 'AiNotConfiguredError';
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** The model answered, but not with valid structured output (after a corrective retry). */
export class AiOutputError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = 'AiOutputError';
  }
}

/** JSON Schema for a Zod schema, as providers expect it. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Parses and validates model text; returns issues for a corrective retry. */
export function parseStructured<T>(schema: z.ZodType<T>, text: string): { ok: true; data: T } | { ok: false; issues: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, issues: ['The response was not valid JSON.'] };
  }
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}
