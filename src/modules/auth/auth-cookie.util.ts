import { FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { env } from '@/shared/config/env';

const isProduction = env.NODE_ENV === 'production';
const cookieDomain = env.COOKIE_DOMAIN || undefined;

const commonCookieOptions = {
  path: '/',
  domain: cookieDomain,
  secure: isProduction,
  sameSite: 'strict' as const,
};

function serializeCookie(
  name: string,
  value: string,
  options: {
    path: string;
    domain?: string;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    httpOnly?: boolean;
    maxAge?: number;
  },
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path}`);

  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

  return parts.join('; ');
}

function setCookieHeader(reply: FastifyReply, cookieValue: string) {
  const existing = reply.getHeader('Set-Cookie');
  if (!existing) {
    reply.header('Set-Cookie', [cookieValue]);
    return;
  }

  if (Array.isArray(existing)) {
    reply.header('Set-Cookie', [...existing, cookieValue]);
    return;
  }

  reply.header('Set-Cookie', [String(existing), cookieValue]);
}

function clearCookieHeader(name: string) {
  return serializeCookie(name, '', {
    path: '/',
    domain: cookieDomain,
    secure: isProduction,
    sameSite: 'strict',
    httpOnly: true,
    maxAge: 0,
  });
}

export function buildCsrfToken() {
  return randomUUID().replace(/-/g, '');
}

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  setCookieHeader(reply, serializeCookie('accessToken', accessToken, {
    ...commonCookieOptions,
    httpOnly: true,
    maxAge: 60 * 15,
  }));

  setCookieHeader(reply, serializeCookie('refreshToken', refreshToken, {
    ...commonCookieOptions,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  }));

  setCookieHeader(reply, serializeCookie('csrfToken', buildCsrfToken(), {
    ...commonCookieOptions,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 7,
  }));
}

export function clearAuthCookies(reply: FastifyReply) {
  setCookieHeader(reply, clearCookieHeader('accessToken'));
  setCookieHeader(reply, clearCookieHeader('refreshToken'));
  setCookieHeader(reply, clearCookieHeader('csrfToken'));
}

export function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookiePart of cookies) {
    const [rawKey, ...rawValueParts] = cookiePart.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawValueParts.join('=')) || null;
    }
  }

  return null;
}