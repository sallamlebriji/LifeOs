import {
  type AiProvider,
  AiOutputError,
  AiProviderError,
  type CompletionRequest,
  type CompletionResult,
  jsonSchemaFor,
  parseStructured,
} from './provider';

export interface OpenAiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests to skip real backoff waits. */
  sleep?: (ms: number) => Promise<void>;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * OpenAI Chat Completions with JSON-schema structured output. Transient errors
 * (429, 5xx, network, timeout) are retried with exponential backoff; an answer
 * that fails validation is retried once with the validation errors appended.
 */
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: OpenAiOptions) {
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async complete<T>(req: CompletionRequest<T>): Promise<CompletionResult<T>> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: req.system },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const usage = { promptTokens: 0, completionTokens: 0 };
    let lastIssues: string[] = [];

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.call(messages, req.schemaName, jsonSchemaFor(req.schema));
      usage.promptTokens += res.usage?.prompt_tokens ?? 0;
      usage.completionTokens += res.usage?.completion_tokens ?? 0;
      const message = res.choices?.[0]?.message;
      if (message?.refusal) throw new AiOutputError('The model declined to answer.', [message.refusal]);
      const text = message?.content ?? '';
      const parsed = parseStructured(req.schema, text);
      if (parsed.ok) return { data: parsed.data, usage, model: res.model ?? this.model, raw: text };
      lastIssues = parsed.issues;
      messages.push({ role: 'assistant', content: text });
      messages.push({
        role: 'user',
        content: `Your previous answer did not match the required JSON schema:\n- ${parsed.issues.join('\n- ')}\nReturn corrected JSON only.`,
      });
    }
    throw new AiOutputError('The AI response could not be validated.', lastIssues);
  }

  private async call(messages: Array<{ role: string; content: string }>, name: string, schema: Record<string, unknown>) {
    const maxRetries = this.opts.maxRetries ?? 2;
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 30_000);
      try {
        const response = await this.fetchImpl(`${this.opts.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0.2,
            response_format: { type: 'json_schema', json_schema: { name, schema, strict: false } },
          }),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
        if (response.ok) return body;
        const retryable = response.status === 429 || response.status >= 500;
        // Never include the API key or request content in errors.
        const error = new AiProviderError(`AI provider error ${response.status}: ${body.error?.message ?? 'request failed'}`, response.status, retryable);
        if (!retryable || attempt >= maxRetries) throw error;
      } catch (err) {
        if (err instanceof AiProviderError && !err.retryable) throw err;
        if (attempt >= maxRetries) {
          throw err instanceof AiProviderError ? err : new AiProviderError('The AI provider could not be reached.', undefined, true);
        }
      } finally {
        clearTimeout(timer);
      }
      await this.sleep(500 * 2 ** attempt);
    }
  }
}
