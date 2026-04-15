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

export function buildCsrfToken() {
  return randomUUID().replace(/-/g, '');
}

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  reply.setCookie('accessToken', accessToken, {
    ...commonCookieOptions,
    httpOnly: true,
    maxAge: 60 * 15,
  });

  reply.setCookie('refreshToken', refreshToken, {
    ...commonCookieOptions,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  });

  reply.setCookie('csrfToken', buildCsrfToken(), {
    ...commonCookieOptions,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookies(reply: FastifyReply) {
  const clearOptions = {
    path: '/',
    domain: cookieDomain,
    secure: isProduction,
    sameSite: 'strict' as const,
  };

  reply.clearCookie('accessToken', clearOptions);
  reply.clearCookie('refreshToken', clearOptions);
  reply.clearCookie('csrfToken', clearOptions);
}