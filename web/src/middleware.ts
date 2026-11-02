import { NextResponse, type NextRequest } from 'next/server';
import { getAuthConfig, SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// Every page and API route requires a valid signed session cookie, except the
// login page and the login endpoint. Fails closed if auth isn't configured.

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login']);
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin fetches from older browsers / curl
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // CSRF defence in depth (the cookie is also SameSite=Lax).
  if (isApi && UNSAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 });
  }

  const cfg = getAuthConfig();
  if (!cfg) {
    const message =
      'Dashboard auth is not configured. Set DASHBOARD_USER, DASHBOARD_PASSWORD and AUTH_SECRET (at least 32 characters).';
    return isApi
      ? NextResponse.json({ error: message }, { status: 500 })
      : new NextResponse(message, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const session = await verifySessionToken(cfg, req.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    // Already signed in → skip the login screen.
    if (session && pathname === '/login') return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  if (session) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search);
  const res = NextResponse.redirect(loginUrl);
  if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE); // expired / tampered
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
