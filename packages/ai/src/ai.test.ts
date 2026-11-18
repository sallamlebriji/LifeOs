import { describe, expect, it } from 'vitest';
import { createProvider, extractPlanningIntent, OpenAiProvider, planningSystemPrompt } from './index';
import { AiOutputError, AiProviderError } from './provider';

const ctx = { today: '2026-11-18', weekday: 'Wednesday', timezone: 'Europe/Paris', locale: 'en', openTaskTitles: ['Write report'] };

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const completion = (content: string) => ({
  model: 'test-model',
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});

describe('createProvider', () => {
  it('returns null unless provider, model and key are all set', () => {
    expect(createProvider({})).toBeNull();
    expect(createProvider({ AI_PROVIDER: 'openai', AI_MODEL: 'm' })).toBeNull();
    expect(createProvider({ AI_PROVIDER: 'openai', AI_MODEL: 'm', OPENAI_API_KEY: 'k' })).toBeInstanceOf(OpenAiProvider);
  });
});

describe('OpenAiProvider', () => {
  const valid = JSON.stringify({
    intent: 'create_plan',
    startDate: '2026-11-18',
    endDate: '2026-11-22',
    includeOpenTasks: true,
    taskTitles: ['Write report'],
    activities: [{ title: 'Gym', durationMinutes: 60, sessions: 3, recoveryHours: 24, window: 'personal' }],
    summary: 'Plan the rest of the week with three gym sessions.',
  });

  it('validates structured output and applies schema defaults', async () => {
    const calls: unknown[] = [];
    const provider = new OpenAiProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return reply(200, completion(valid));
      },
    });
    const out = await extractPlanningIntent(provider, ctx, [{ role: 'user', content: 'Gym 3 times this week' }]);
    expect(out.data).toMatchObject({ intent: 'create_plan', activities: [{ title: 'Gym', preferredTimeOfDay: 'ANY' }] });
    expect(out.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    const body = calls[0] as { response_format: { type: string }; messages: Array<{ role: string }> };
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[0]!.role).toBe('system');
  });

  it('retries once with the validation errors, then gives up', async () => {
    let n = 0;
    const provider = new OpenAiProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: async () => reply(200, completion(n++ === 0 ? '{"intent":"create_plan"}' : valid)),
    });
    await expect(extractPlanningIntent(provider, ctx, [{ role: 'user', content: 'x' }])).resolves.toMatchObject({ data: { intent: 'create_plan' } });
    expect(n).toBe(2);

    const bad = new OpenAiProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => reply(200, completion('not json')) });
    await expect(extractPlanningIntent(bad, ctx, [{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(AiOutputError);
  });

  it('backs off on 429/5xx and fails fast on 4xx', async () => {
    let n = 0;
    const flaky = new OpenAiProvider({
      apiKey: 'k',
      model: 'm',
      sleep: async () => {},
      fetchImpl: async () => (n++ < 2 ? reply(503, { error: { message: 'busy' } }) : reply(200, completion(valid))),
    });
    await expect(extractPlanningIntent(flaky, ctx, [{ role: 'user', content: 'x' }])).resolves.toBeDefined();
    expect(n).toBe(3);

    const denied = new OpenAiProvider({ apiKey: 'secret-key', model: 'm', sleep: async () => {}, fetchImpl: async () => reply(401, { error: { message: 'bad key' } }) });
    const err = await extractPlanningIntent(denied, ctx, [{ role: 'user', content: 'x' }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(String((err as Error).message)).not.toContain('secret-key');
  });
});

describe('planningSystemPrompt', () => {
  it('states the rules and lists only task titles', () => {
    const prompt = planningSystemPrompt(ctx);
    expect(prompt).toContain('You do not schedule anything yourself');
    expect(prompt).toContain('- Write report');
    expect(prompt).toContain('2026-11-18');
  });
});
