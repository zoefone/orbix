import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { OrbixConfig } from './config.js';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function issueToken(cfg: OrbixConfig, days = 180): string {
  const payload = b64u(JSON.stringify({ iat: Date.now(), exp: Date.now() + days * 86400_000, v: 1 }));
  const sig = createHmac('sha256', cfg.secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(cfg: OrbixConfig, token: string): boolean {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return false;
  const expect = createHmac('sha256', cfg.secret).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof obj.exp === 'number' && obj.exp > Date.now();
  } catch { return false; }
}

// ---- pairing codes (short-lived, in-memory) ----
let pairing: { code: string; expiresAt: number } | null = null;

export function newPairingCode(): { code: string; expiresAt: number } {
  pairing = { code: String(randomInt(0, 1000000)).padStart(6, '0'), expiresAt: Date.now() + 10 * 60_000 };
  return pairing;
}

export function redeemPairingCode(code: string): boolean {
  if (!pairing || pairing.expiresAt < Date.now()) return false;
  const ok = pairing.code === code.trim();
  if (ok) pairing = null; // one-shot
  return ok;
}
