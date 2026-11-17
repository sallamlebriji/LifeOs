import { type ApiErrorBody } from '@lifeos/shared';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly issues: Record<string, string[]> | undefined;

  constructor(status: number, body: Partial<ApiErrorBody> | undefined) {
    super(body?.message ?? `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.issues = body?.issues;
  }

  /** First message for a field, for inline form errors. */
  fieldError(field: string): string | undefined {
    return this.issues?.[field]?.[0];
  }
}

type Json = Record<string, unknown> | unknown[];

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Json;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** Skip the automatic refresh-and-retry on 401 (used by auth calls themselves). */
  noRefresh?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh: concurrent 401s share one rotation request. */
export function refreshSession(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  refreshInFlight ??= fetchImpl(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-LifeOS-Client': 'web' },
    body: '{}',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

let onUnauthenticated: () => void = () => {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?next=${next}`);
  }
};

/** Lets tests (and the app shell) customise what happens when a session ends. */
export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

export async function api<T>(path: string, opts: RequestOptions = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const url = new URL(`${BASE}${path}`, 'http://placeholder');
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const target = `${url.pathname}${url.search}`;

  const doFetch = () =>
    fetchImpl(target, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-LifeOS-Client': 'web',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });

  let res = await doFetch();
  if (res.status === 401 && !opts.noRefresh) {
    if (await refreshSession(fetchImpl)) {
      res = await doFetch();
    }
    if (res.status === 401) {
      onUnauthenticated();
    }
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data as Partial<ApiErrorBody> | undefined);
  return data as T;
}
