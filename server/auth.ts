import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'viagem_session';
const SESSION_SECONDS = 12 * 60 * 60;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function passwordMatches(candidate: string, password: string): boolean {
  return timingSafeEqual(digest(candidate), digest(password));
}

function signature(payload: string, password: string): string {
  return createHmac('sha256', digest(`viagem-session-v1\0${password}`)).update(payload).digest('base64url');
}

export function createSessionCookie(password: string, development = false): string {
  const payload = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${randomBytes(18).toString('base64url')}`;
  return `${COOKIE}=${payload}.${signature(payload, password)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${development ? '' : '; Secure'}`;
}

export function clearSessionCookie(development = false): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${development ? '' : '; Secure'}`;
}

export function hasSession(request: Request, password: string): boolean {
  const value = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value || value.length > 300) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  const expiry = Number(parts[0]);
  const now = Math.floor(Date.now() / 1000);
  if (expiry <= now || expiry > now + SESSION_SECONDS + 60) return false;
  const expected = signature(`${parts[0]}.${parts[1]}`, password);
  return passwordMatches(parts[2], expected);
}

export function isSameOrigin(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Bounds both brute-force attempts and memory retained by this warm function. */
export function createLoginLimiter(): (request: Request) => boolean {
  const attempts = new Map<string, { count: number; reset: number }>();
  return (request) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.reset <= now) attempts.delete(key);
    const address = request.headers.get('x-nf-client-connection-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const key = digest(address).toString('hex');
    const current = attempts.get(key);
    if (current && current.count >= 10) return false;
    if (!current && attempts.size >= 500) return false;
    attempts.set(key, { count: (current?.count ?? 0) + 1, reset: current?.reset ?? now + 15 * 60_000 });
    return true;
  };
}
