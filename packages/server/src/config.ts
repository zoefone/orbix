import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ORBIX_HOME = process.env.ORBIX_HOME || join(homedir(), '.orbix');
export const DATA_DIR = join(ORBIX_HOME, 'data');
export const UPLOAD_DIR = join(ORBIX_HOME, 'uploads');
const CONFIG_PATH = join(ORBIX_HOME, 'config.json');

export interface OrbixConfig {
  port: number;
  host: string;
  /** scrypt hash "salt:hash" hex */
  passwordHash: string;
  /** random server secret for token signing */
  secret: string;
  machineName: string;
  createdAt: number;
}

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

export function verifyPassword(cfg: OrbixConfig, pw: string): boolean {
  const [salt, hash] = cfg.passwordHash.split(':');
  if (!salt || !hash) return false;
  const test = scryptSync(pw, salt, 32);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && timingSafeEqual(test, ref);
}

export function loadOrInitConfig(): { config: OrbixConfig; initialPassword?: string } {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(UPLOAD_DIR, { recursive: true });
  if (existsSync(CONFIG_PATH)) {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as OrbixConfig;
    // env overrides
    config.port = Number(process.env.ORBIX_PORT || config.port);
    config.host = process.env.ORBIX_HOST || config.host;
    if (process.env.ORBIX_PASSWORD) {
      config.passwordHash = hashPassword(process.env.ORBIX_PASSWORD);
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
    }
    return { config };
  }
  const initialPassword = process.env.ORBIX_PASSWORD || randomBytes(6).toString('base64url').slice(0, 9);
  const config: OrbixConfig = {
    port: Number(process.env.ORBIX_PORT || 8760),
    host: process.env.ORBIX_HOST || '0.0.0.0',
    passwordHash: hashPassword(initialPassword),
    secret: randomBytes(32).toString('hex'),
    machineName: process.env.ORBIX_NAME || createHash('md5').update(homedir()).digest('hex').slice(0, 6),
    createdAt: Date.now(),
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  return { config, initialPassword };
}
