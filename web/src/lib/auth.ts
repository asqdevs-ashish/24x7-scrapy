// Signed session cookies using Web Crypto only, so the same code runs in the
// Edge middleware and in Node route handlers.
//
// Token = base64url(JSON {u, exp}) + "." + base64url(HMAC-SHA256(payload)).
// The HMAC key mixes AUTH_SECRET with the configured credentials, so changing
// the password (or the secret) instantly invalidates every existing session.

export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-leads_session' : 'leads_session';

const encoder = new TextEncoder();

export interface AuthConfig {
  user: string;
  password: string;
  secret: string;
}

export interface Session {
  u: string;
  exp: number; // unix seconds
}

// Returns null when auth is not (correctly) configured – callers must fail closed.
export function getAuthConfig(): AuthConfig | null {
  const user = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!user || !password || !secret || secret.length < 32) return null;
  return { user, password, secret };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmac(key: string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const signingKey = (cfg: AuthConfig) => `${cfg.secret}\u0000${cfg.user}\u0000${cfg.password}`;

// Compares two secrets in constant time regardless of their length by
// comparing their HMACs (equal-length digests).
export async function secretsMatch(cfg: AuthConfig, given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmac(cfg.secret, given), hmac(cfg.secret, expected)]);
  return constantTimeEqual(a, b);
}

export async function createSessionToken(cfg: AuthConfig, user: string): Promise<string> {
  const session: Session = { u: user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  const signature = toBase64Url(await hmac(signingKey(cfg), payload));
  return `${payload}.${signature}`;
}

export async function verifySessionToken(cfg: AuthConfig, token: string | undefined | null): Promise<Session | null> {
  if (!token || token.length > 1024) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  try {
    const expected = await hmac(signingKey(cfg), payload);
    if (!constantTimeEqual(fromBase64Url(signature), expected)) return null;

    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    if (typeof session.u !== 'string' || typeof session.exp !== 'number') return null;
    if (session.exp <= Math.floor(Date.now() / 1000)) return null;
    if (session.u !== cfg.user) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

// Only same-site relative paths are allowed as a post-login redirect target.
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/login') || value.startsWith('/api/')) return '/';
  return value;
}
