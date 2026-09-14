import { createHash, randomBytes } from 'crypto';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import type { Prisma } from '@prisma/client';

export const randomSecret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('base64url');
export const isSecret = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export class GoogleAuthError extends Error { constructor(public code: string) { super(code); } }
export function googleConfig() {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REDIRECT_URI: redirectUri, FRONTEND_URL: frontend, JWT_SECRET: jwtSecret } = process.env;
  if (!clientId || !clientSecret || !redirectUri || !frontend || !jwtSecret) throw new GoogleAuthError('auth.googleUnavailable');
  const callback = new URL(redirectUri), origin = new URL(frontend);
  const safe = (url: URL) => url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost' && process.env.NODE_ENV !== 'production');
  if (!safe(callback) || !safe(origin) || callback.username || callback.password || origin.username || origin.password ||
      callback.pathname !== '/auth/google/callback' || callback.search || callback.hash || origin.pathname !== '/' || origin.search || origin.hash) throw new GoogleAuthError('auth.googleUnavailable');
  return { clientId, clientSecret, redirectUri, frontend: origin.origin, backend: callback.origin, jwtSecret, secure: callback.protocol === 'https:' };
}
export function authorizationUrl(state: string, nonce: string, verifier: string) {
  const c = googleConfig();
  return new OAuth2Client(c.clientId, c.clientSecret, c.redirectUri).generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, nonce,
    code_challenge: digest(verifier), code_challenge_method: CodeChallengeMethod.S256 });
}
export function validateGoogleClaims(p: any, nonce: string, clientId: string) {
  if (!p || !['accounts.google.com', 'https://accounts.google.com'].includes(p.iss) || p.aud !== clientId ||
      (p.azp !== undefined && p.azp !== clientId) || typeof p.exp !== 'number' || p.exp <= Date.now()/1000 || p.nonce !== nonce ||
      typeof p.sub !== 'string' || !p.sub || p.sub.length > 255) throw new GoogleAuthError('auth.googleInvalid');
  if (p.email_verified !== true || typeof p.email !== 'string' || p.email.length > 254) throw new GoogleAuthError('auth.googleEmail');
  const parts = p.email.split('@'), local = parts[0], domain = parts[1] || '';
  if (parts.length !== 2 || local.length > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
      local.startsWith('.') || local.endsWith('.') || local.includes('..') || !domain.includes('.') ||
      !domain.split('.').every((label: string) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) throw new GoogleAuthError('auth.googleEmail');
  return { subject: p.sub as string, email: p.email as string,
    firstName: typeof p.given_name === 'string' ? p.given_name.trim().slice(0,100) : '',
    lastName: typeof p.family_name === 'string' ? p.family_name.trim().slice(0,100) : '' };
}
export async function readGoogleIdentity(code: string, verifier: string, nonce: string) {
  const c = googleConfig(), client = new OAuth2Client(c.clientId, c.clientSecret, c.redirectUri);
  const { tokens } = await client.getToken({ code, codeVerifier: verifier, redirect_uri: c.redirectUri });
  if (!tokens.id_token) throw new GoogleAuthError('auth.googleInvalid');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: c.clientId });
  return validateGoogleClaims(ticket.getPayload(), nonce, c.clientId);
}

export async function resolveGoogleUser(tx: Prisma.TransactionClient, identity: Awaited<ReturnType<typeof readGoogleIdentity>>) {
  const key = { provider: 'GOOGLE', issuer: 'https://accounts.google.com', subject: identity.subject };
  const existing = await tx.externalIdentity.findUnique({ where: { provider_issuer_subject: key }, include: { user: true } });
  if (existing) {
    if (existing.user.role !== 'CLIENT') throw new GoogleAuthError('auth.googleRole');
    return existing.user;
  }
  const canonicalEmail = identity.email.toLowerCase();
  if (await tx.user.findUnique({ where: { canonicalEmail } })) throw new GoogleAuthError('auth.googleCollision');
  return tx.user.create({ data: { email: identity.email, canonicalEmail, password: null, firstName: identity.firstName, lastName: identity.lastName,
    role: 'CLIENT', externalIdentities: { create: key } } });
}
