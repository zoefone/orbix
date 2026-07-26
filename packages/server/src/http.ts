import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { OrbixConfig } from './config.js';
import { UPLOAD_DIR, verifyPassword } from './config.js';
import { issueToken, newPairingCode, redeemPairingCode, verifyToken } from './auth.js';
import type { SessionManager } from './manager.js';

export function authGuard(cfg: OrbixConfig) {
  return (req: FastifyRequest): string | null => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query as { token?: string }).token;
    if (token && verifyToken(cfg, token)) return token;
    return null;
  };
}

interface UploadMeta { id: string; name: string; size: number; mime: string; path: string; url: string }
const uploadIndex = new Map<string, UploadMeta>();

export async function registerHttp(app: FastifyInstance, cfg: OrbixConfig, manager: SessionManager) {
  const guard = authGuard(cfg);

  await app.register(fastifyMultipart, { limits: { fileSize: 100 * 1024 * 1024, files: 10 } });

  app.get('/api/health', async () => ({ ok: true, name: 'orbix', version: '0.1.0', machine: cfg.machineName }));

  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body || {}) as { password?: string };
    if (!body.password || !verifyPassword(cfg, body.password)) {
      return reply.code(401).send({ error: 'invalid password' });
    }
    return { token: issueToken(cfg), machine: cfg.machineName };
  });

  app.post('/api/auth/pair', async (req, reply) => {
    const body = (req.body || {}) as { code?: string };
    if (!body.code || !redeemPairingCode(body.code)) {
      return reply.code(401).send({ error: 'invalid or expired pairing code' });
    }
    return { token: issueToken(cfg), machine: cfg.machineName };
  });

  // generate a pairing code: allowed from localhost (CLI `orbix pair`) or with auth token
  app.post('/api/pair/mint', async (req, reply) => {
    const ip = req.ip;
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocal && !guard(req)) return reply.code(401).send({ error: 'unauthorized' });
    const p = newPairingCode();
    return { code: p.code, expiresAt: p.expiresAt };
  });

  app.post('/api/upload', async (req, reply) => {
    if (!guard(req)) return reply.code(401).send({ error: 'unauthorized' });
    const out: UploadMeta[] = [];
    for await (const part of req.files()) {
      const id = randomBytes(8).toString('hex');
      const safeName = basename(part.filename || 'file').replace(/[^\w.\- ]/g, '_').slice(0, 120);
      const path = join(UPLOAD_DIR, `${id}-${safeName}`);
      await pipeline(part.file, createWriteStream(path));
      const size = statSync(path).size;
      const meta: UploadMeta = { id, name: safeName, size, mime: part.mimetype || 'application/octet-stream', path, url: `/api/uploads/${id}` };
      uploadIndex.set(id, meta);
      out.push(meta);
    }
    return { files: out };
  });

  app.get('/api/uploads/:id', async (req, reply) => {
    if (!guard(req)) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    let meta = uploadIndex.get(id);
    if (!meta) {
      // rebuild from disk (survives restart)
      const f = readdirSync(UPLOAD_DIR).find(x => x.startsWith(id + '-'));
      if (!f) return reply.code(404).send({ error: 'not found' });
      const path = join(UPLOAD_DIR, f);
      meta = { id, name: f.slice(id.length + 1), size: statSync(path).size, mime: guessMime(f), path, url: `/api/uploads/${id}` };
      uploadIndex.set(id, meta);
    }
    reply.header('content-type', meta.mime);
    return reply.send(readFileSync(meta.path));
  });

  // ---- web static (built web app lives at ../web/dist) ----
  const webDist = resolve(process.cwd(), '..', 'web', 'dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }
}

/** browse server directories for the new-session picker */
export async function browseDir(path?: string) {
  const target = path ? resolve(path) : homedir();
  const entries = await readdir(target, { withFileTypes: true });
  const dirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map(e => e.name)
    .sort()
    .slice(0, 200);
  return { path: target, parent: resolve(target, '..'), dirs, home: homedir() };
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', json: 'application/json' };
  return map[ext] || 'application/octet-stream';
}
