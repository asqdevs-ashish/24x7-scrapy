import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSessionToken, getAuthConfig, secretsMatch, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { checkLoginRate, clearLoginAttempts, recordFailedLogin } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clientKey(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  const cfg = getAuthConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'Authentication is not configured on the server (DASHBOARD_USER, DASHBOARD_PASSWORD, AUTH_SECRET ≥ 32 chars).' },
      { status: 500 },
    );
  }

  const key = clientKey(req);
  const rate = checkLoginRate(key);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }

  const { username, password } = parsed.data;
  const [userOk, passOk] = await Promise.all([
    secretsMatch(cfg, username, cfg.user),
    secretsMatch(cfg, password, cfg.password),
  ]);

  if (!userOk || !passOk) {
    recordFailedLogin(key);
    await sleep(500 + Math.random() * 400); // flatten timing, slow down guessing
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  clearLoginAttempts(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(cfg, cfg.user), sessionCookieOptions());
  return res;
}
