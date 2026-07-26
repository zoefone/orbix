/**
 * Orbix Relay — NAT-traversal relay.
 *
 * An Orbix server (hub) behind NAT connects OUT to this relay and registers
 * with a key:   wss://relay/register?key=KEY
 * Relay assigns the hub a slug and a public base URL:  https://relay/t/<slug>
 *
 * Clients then use that URL like a normal Orbix server address:
 *   - WS API:   wss://relay/t/<slug>/ws?token=...
 *   - HTTP:     https://relay/t/<slug>/api/...
 *
 * All client traffic is multiplexed over the hub's single control connection:
 *   { t:'open', id, kind:'ws'|'http', ... }  relay -> hub
 *   { t:'msg', id, data }                    both ways (ws frames)
 *   { t:'close', id }                        both ways
 *   { t:'http-res', id, status, headers, bodyB64 }  hub -> relay
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.ORBIX_RELAY_PORT || 8770);
/** shared secret: hubs must present this key to register */
const RELAY_KEY = process.env.ORBIX_RELAY_KEY || randomBytes(8).toString('hex');

interface HubConn {
  ws: WebSocket;
  slug: string;
  streams: Map<string, { kind: 'ws' | 'http'; clientWs?: WebSocket; httpRes?: ServerResponse }>;
}

const hubs = new Map<string, HubConn>();
let streamSeq = 0;

function send(ws: WebSocket, obj: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, hubs: hubs.size }));
    return;
  }

  // client HTTP proxy: /t/<slug>/<path...>
  const m = url.pathname.match(/^\/t\/([\w-]+)\/(.*)$/);
  if (m) {
    const [, slug, rest] = m;
    const hub = hubs.get(slug);
    if (!hub) { res.writeHead(502); res.end('hub offline'); return; }
    const id = `s${++streamSeq}`;
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const bodyB64 = Buffer.concat(chunks).toString('base64');
      hub.streams.set(id, { kind: 'http', httpRes: res });
      console.log(`[relay] http ${req.method} /t/${slug}/${rest} -> hub stream ${id}`);
      send(hub.ws, {
        t: 'open', id, kind: 'http',
        method: req.method, path: '/' + rest + (url.search || ''),
        headers: { 'content-type': req.headers['content-type'] || 'application/octet-stream', authorization: req.headers.authorization || '' },
        bodyB64,
      });
      // timeout guard (stream map entry is removed on http-res or here)
      setTimeout(() => {
        if (hub.streams.has(id)) {
          hub.streams.delete(id);
          try { res.writeHead(504); res.end('timeout'); } catch { }
        }
      }, 120_000);
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // hub registration: /register?key=KEY
  if (url.pathname === '/register') {
    const key = url.searchParams.get('key') || '';
    if (key !== RELAY_KEY) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const slug = randomBytes(4).toString('hex');
      const hub: HubConn = { ws, slug, streams: new Map() };
      hubs.set(slug, hub);
      console.log(`[relay] hub registered: /t/${slug}`);
      send(ws, { t: 'registered', slug });
      ws.on('message', (raw) => handleHubMessage(hub, raw));
      ws.on('close', () => {
        hubs.delete(slug);
        for (const s of hub.streams.values()) {
          try { s.clientWs?.close(); } catch { }
          try { s.httpRes?.writeHead(502); s.httpRes?.end('hub disconnected'); } catch { }
        }
        console.log(`[relay] hub gone: /t/${slug}`);
      });
    });
    return;
  }

  // client WS proxy: /t/<slug>/ws?token=...
  const m = url.pathname.match(/^\/t\/([\w-]+)\/(ws)$/);
  console.log(`[relay] upgrade ${url.pathname} match=${!!m}`);
  if (m) {
    const [, slug, rest] = m;
    const hub = hubs.get(slug);
    console.log(`[relay] ws proxy -> slug=${slug} hub=${!!hub}`);
    if (!hub) { socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const id = `s${++streamSeq}`;
      hub.streams.set(id, { kind: 'ws', clientWs: ws });
      send(hub.ws, { t: 'open', id, kind: 'ws', path: '/' + rest + (url.search || '') });
      ws.on('message', (raw) => send(hub.ws, { t: 'msg', id, data: String(raw) }));
      ws.on('close', () => { hub.streams.delete(id); send(hub.ws, { t: 'close', id }); });
    });
    return;
  }

  socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
  socket.destroy();
});

function handleHubMessage(hub: HubConn, raw: unknown) {
  let msg: { t: string; id: string; data?: string; status?: number; headers?: Record<string, string>; bodyB64?: string };
  try { msg = JSON.parse(String(raw)); } catch { return; }
  const stream = hub.streams.get(msg.id);
  if (!stream) return;
  switch (msg.t) {
    case 'msg':
      if (stream.clientWs && stream.clientWs.readyState === stream.clientWs.OPEN) stream.clientWs.send(msg.data || '');
      break;
    case 'close':
      try { stream.clientWs?.close(); } catch { }
      hub.streams.delete(msg.id);
      break;
    case 'http-res': {
      hub.streams.delete(msg.id);
      const res = stream.httpRes;
      if (!res) break;
      try {
        res.writeHead(msg.status || 200, { 'content-type': msg.headers?.['content-type'] || 'application/octet-stream' });
        res.end(msg.bodyB64 ? Buffer.from(msg.bodyB64, 'base64') : undefined);
      } catch { }
      break;
    }
  }
}

server.listen(PORT, () => {
  console.log('');
  console.log('  ◍ Orbix relay listening on :' + PORT);
  console.log('  Register key: ' + RELAY_KEY);
  console.log('  Hubs connect:  orbix tunnel --relay ws://<this-host>:' + PORT + ' --key <key>');
  console.log('  (set ORBIX_RELAY_KEY / ORBIX_RELAY_PORT to customize)');
  console.log('');
});
