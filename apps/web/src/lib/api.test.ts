import { api, ApiError, setUnauthenticatedHandler } from './api';

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  it('sends the CSRF client header and credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: true }));
    await api('/users/me', {}, fetchMock);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/users/me');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-LifeOS-Client']).toBe('web');
  });

  it('refreshes once on 401 and retries the original request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { message: 'expired' }))
      .mockResolvedValueOnce(json(200, {})) // refresh
      .mockResolvedValueOnce(json(200, { value: 42 }));
    const res = await api<{ value: number }>('/my-day', {}, fetchMock);
    expect(res.value).toBe(42);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/auth/refresh');
  });

  it('calls the unauthenticated handler when refresh fails', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { message: 'expired' }))
      .mockResolvedValueOnce(json(401, { message: 'no session' }));
    await expect(api('/my-day', {}, fetchMock)).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('exposes field-level validation issues', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(400, { statusCode: 400, message: 'Validation failed', issues: { email: ['Enter a valid email address'] } }),
    );
    const err = await api('/auth/register', { method: 'POST', body: {}, noRefresh: true }, fetchMock).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).fieldError('email')).toBe('Enter a valid email address');
  });

  it('encodes query parameters and skips undefined ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, {}));
    await api('/my-day', { query: { date: '2026-11-17', other: undefined } }, fetchMock);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/my-day?date=2026-11-17');
  });
});
