import { type CookieOptions, type Request, type Response } from 'express';

export const ACCESS_COOKIE = 'lifeos_at';
export const REFRESH_COOKIE = 'lifeos_rt';
/** Refresh cookie is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
/**
 * Non-secret hint ("1") readable by the web app's edge middleware to route
 * signed-in vs signed-out visitors. It grants nothing: the API authorises
 * every request from the access token and server-side session state.
 */
export const SESSION_HINT_COOKIE = 'lifeos_session';

/**
 * Clients identify themselves with this header. Browsers can't send a custom
 * header cross-origin without a CORS preflight (which we restrict), so its
 * presence on cookie-authenticated mutations acts as CSRF protection.
 */
export const CLIENT_HEADER = 'x-lifeos-client';

function base(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax' };
}

export function setAuthCookies(
  res: Response,
  opts: {
    secure: boolean;
    accessToken: string;
    accessExpiresAt: Date;
    refreshToken: string;
    refreshExpiresAt: Date;
  },
) {
  res.cookie(ACCESS_COOKIE, opts.accessToken, {
    ...base(opts.secure),
    path: '/',
    expires: opts.accessExpiresAt,
  });
  res.cookie(REFRESH_COOKIE, opts.refreshToken, {
    ...base(opts.secure),
    path: REFRESH_COOKIE_PATH,
    expires: opts.refreshExpiresAt,
  });
  res.cookie(SESSION_HINT_COOKIE, '1', {
    ...base(opts.secure),
    path: '/',
    expires: opts.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response, secure: boolean) {
  res.clearCookie(ACCESS_COOKIE, { ...base(secure), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(secure), path: REFRESH_COOKIE_PATH });
  res.clearCookie(SESSION_HINT_COOKIE, { ...base(secure), path: '/' });
}

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function isMobileClient(req: Request): boolean {
  return req.header(CLIENT_HEADER) === 'mobile';
}
