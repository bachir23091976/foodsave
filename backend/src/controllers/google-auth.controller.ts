import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { authorizationUrl, digest, googleConfig, GoogleAuthError, isSecret, randomSecret, readGoogleIdentity, resolveGoogleUser } from '../lib/google-auth';

const fail = (res: Response, error: unknown) => res.status(400).json({ message: error instanceof GoogleAuthError ? error.code : 'auth.googleUnavailable' });
const cookieName = (state: string) => `fs_google_${digest(state).slice(0,16)}`;
const validOrigin = (req: Request) => { if (req.get('origin') !== googleConfig().frontend) throw new GoogleAuthError('auth.googleInvalid'); };
const active = (record: any) => record && record.expiresAt > new Date();

export async function googleStart(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const config = googleConfig(); validOrigin(req);
    const { challenge, locale } = req.body || {};
    if (!isSecret(challenge) || !['fr','en'].includes(locale) || Object.keys(req.body).some(k => !['challenge','locale'].includes(k))) throw new GoogleAuthError('auth.googleInvalid');
    const state = randomSecret(), browser = randomSecret();
    await prisma.googleAuthTransaction.create({ data: { stateHash: digest(state), browserHash: digest(browser), nonce: randomSecret(), pkceVerifier: randomSecret(),
      frontendChallenge: challenge, locale, expiresAt: new Date(Date.now()+10*60*1000) } });
    // First-party navigation establishes a Lax cookie before leaving for Google.
    res.json({ url: `${config.backend}/auth/google/authorize?state=${state}&binding=${browser}` });
  } catch (error) { fail(res,error); }
}

export async function googleAuthorize(req: Request, res: Response) {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    const c = googleConfig(), { state, binding } = req.query;
    if (!isSecret(state) || !isSecret(binding)) throw new GoogleAuthError('auth.googleInvalid');
    const record = await prisma.googleAuthTransaction.findUnique({ where: { stateHash: digest(state) } });
    if (!active(record) || record!.browserHash !== digest(binding)) throw new GoogleAuthError('auth.googleInvalid');
    const claim = await prisma.googleAuthTransaction.updateMany({ where: { id: record!.id, authorizedAt: null, consumedAt: null, expiresAt: { gt: new Date() } }, data: { authorizedAt: new Date() } });
    if (claim.count !== 1) throw new GoogleAuthError('auth.googleInvalid');
    res.cookie(cookieName(state), binding, { httpOnly: true, secure: c.secure, sameSite: 'lax', path: '/auth/google/callback', maxAge: 10*60*1000 });
    res.redirect(authorizationUrl(state,record!.nonce,record!.pkceVerifier));
  } catch(error) { fail(res,error); }
}

export async function googleCallback(req: Request, res: Response) {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    const config = googleConfig(), { state, code, error: providerError } = req.query;
    if (!isSecret(state)) throw new GoogleAuthError('auth.googleInvalid');
    const binding = (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName(state)+'='))?.split('=')[1];
    if (!isSecret(binding)) throw new GoogleAuthError('auth.googleInvalid');
    const record = await prisma.googleAuthTransaction.findUnique({ where: { stateHash: digest(state) } });
    if (!active(record) || !record!.authorizedAt || record!.browserHash !== digest(binding)) throw new GoogleAuthError('auth.googleInvalid');
    const claim = await prisma.googleAuthTransaction.updateMany({ where: { id: record!.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (claim.count !== 1) throw new GoogleAuthError('auth.googleInvalid');
    let userId: string | null = null, errorCode: string | null = null;
    try {
      if (providerError) throw new GoogleAuthError(providerError === 'access_denied' ? 'auth.googleCancelled' : 'auth.googleUnavailable');
      if (typeof code !== 'string' || !code || code.length > 4096) throw new GoogleAuthError('auth.googleInvalid');
      const identity = await readGoogleIdentity(code,record!.pkceVerifier,record!.nonce);
      const user = await prisma.$transaction(tx=>resolveGoogleUser(tx,identity));
      userId = user.id;
    } catch(error: any) { errorCode = error instanceof GoogleAuthError ? error.code : error?.code === 'P2002' ? 'auth.googleCollision' : 'auth.googleUnavailable'; }
    const handoff = randomSecret();
    await prisma.googleAuthTransaction.update({ where: { id: record!.id }, data: { userId, errorCode, handoffHash: digest(handoff), nonce: '', pkceVerifier: '' } });
    res.clearCookie(cookieName(state),{ path: '/auth/google/callback', secure: config.secure, sameSite: 'lax' });
    res.redirect(`${config.frontend}/auth/google/complete#handoff=${handoff}`);
  } catch(error) { fail(res,error); }
}

export async function googleComplete(req: Request, res: Response) {
  res.set('Cache-Control','no-store');
  try {
    const config = googleConfig(); validOrigin(req);
    const { handoff, verifier } = req.body || {};
    if (!isSecret(handoff) || !isSecret(verifier) || Object.keys(req.body).some(k => !['handoff','verifier'].includes(k))) throw new GoogleAuthError('auth.googleInvalid');
    const result = await prisma.$transaction(async tx => {
      const record = await tx.googleAuthTransaction.findUnique({ where: { handoffHash: digest(handoff) } });
      if (!active(record) || record!.frontendChallenge !== digest(verifier) || !record!.consumedAt) throw new GoogleAuthError('auth.googleInvalid');
      const claim = await tx.googleAuthTransaction.updateMany({ where: { id: record!.id, completedAt: null, expiresAt: { gt: new Date() } }, data: { completedAt: new Date() } });
      if (claim.count !== 1) throw new GoogleAuthError('auth.googleInvalid');
      if (record!.errorCode) return { message: record!.errorCode, locale: record!.locale };
      const user = await tx.user.findUnique({ where: { id: record!.userId || '' } });
      if (!user || user.role !== 'CLIENT') return { message: 'auth.googleRole', locale: record!.locale };
      return { token: jwt.sign({ userId: user.id, role: user.role, authVersion: user.authVersion },config.jwtSecret,{ expiresIn: '7d' }), locale: record!.locale };
    });
    res.status('token' in result ? 200 : 400).json(result);
  } catch(error) { fail(res,error); }
}
