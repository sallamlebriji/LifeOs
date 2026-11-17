import { type NextRequest, NextResponse } from 'next/server';

/**
 * Routing convenience only — real authorisation happens in the API on every
 * request. `lifeos_session` is a non-secret hint set alongside the session.
 */
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.get('lifeos_session')?.value === '1';
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));
  const isPublic = isAuthPage || pathname.startsWith('/verify-email');

  if (!hasSession && !isPublic) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL('/today', req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
