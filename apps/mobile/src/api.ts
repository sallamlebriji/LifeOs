/**
 * API client for the mobile app. Mobile uses bearer tokens (no cookies):
 * the access token and the rotating refresh token live in the device keychain
 * (expo-secure-store), never in AsyncStorage.
 */
import { type ApiErrorBody, type AuthResponse } from '@lifeos/shared';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const ACCESS = 'lifeos.access';
const REFRESH = 'lifeos.refresh';

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:4010/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    body: Partial<ApiErrorBody> | undefined,
  ) {
    super(body?.message ?? `Request failed (${status})`);
  }
}

let onSignedOut: (() => void) | null = null;
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}

export async function saveSession(auth: AuthResponse) {
  await SecureStore.setItemAsync(ACCESS, auth.accessToken);
  if (auth.refreshToken) await SecureStore.setItemAsync(REFRESH, auth.refreshToken);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
}

export async function hasSession() {
  return !!(await SecureStore.getItemAsync(REFRESH));
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH);
    if (!refreshToken) return false;
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lifeos-client': 'mobile' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await clearSession();
      return false;
    }
    await saveSession((await res.json()) as AuthResponse);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}, retry = true): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const token = await SecureStore.getItemAsync(ACCESS);
  const res = await fetch(url.toString(), {
    method: init.method ?? 'GET',
    headers: {
      'x-lifeos-client': 'mobile',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, init, false);
    onSignedOut?.();
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => undefined)) as unknown;
  if (!res.ok) throw new ApiError(res.status, body as Partial<ApiErrorBody>);
  return body as T;
}
