/** Hub-side relay tunnel client: connects out to an Orbix relay and serves local traffic. */
import WebSocket from 'ws';

interface OpenMsg { t: 'open'; id: string; kind: 'ws' | 'http'; method?: string; path: string; headers?: Record<string, string>; bodyB64?: string }
interface MsgMsg { t: 'msg'; id: string; data: string }
interface CloseMsg { t: 'close'; id: string }
type RelayMsg = OpenMsg | MsgMsg | CloseMsg | { t: 'registered'; slug: string };

export interface TunnelHandle {
  publicUrl: string;
  close: () => void;
}

export async function connectRelay(opts: { relay: string; key: string; localPort: number }): Promise<TunnelHandle> {
  const relayBase = opts.relay.replace(/\/+$/, '');
  const wsUrl = `${relayBase}/register?key=${encodeURIComponent(opts.key)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const localStreams = new Map<string, { localWs?: WebSocket }>();
    let closed = false;

    const httpBase = `http://127.0.0.1:${opts.localPort}`;
    const wsBase = `ws://127.0.0.1:${opts.localPort}`;

    const publicBase = relayBase.startsWith('wss') ? 'https' + relayBase.slice(3) : 'http' + relayBase.slice(2);

    ws.on('error', (e) => { if (!closed) reject(e); });
    ws.on('close', () => {
      for (const s of localStreams.values()) { try { s.localWs?.close(); } catch { } }
      localStreams.clear();
    });

    ws.on('message', async (raw) => {
      let msg: RelayMsg;
      try { msg = JSON.parse(String(raw)); } catch { return; }

      if (msg.t === 'registered') {
        closed = true; // promise resolved; further errors handled silently
        resolve({
          publicUrl: `${publicBase}/t/${msg.slug}`,
          close: () => { try { ws.close(); } catch { } },
        });
        return;
      }

      if (msg.t === 'open') {
        if (msg.kind === 'ws') {
          const local = new WebSocket(wsBase + msg.path);
          localStreams.set(msg.id, { localWs: local });
          local.on('message', (data) => send({ t: 'msg', id: msg.id, data: String(data) }));
          local.on('close', () => { localStreams.delete(msg.id); send({ t: 'close', id: msg.id }); });
          local.on('error', () => { localStreams.delete(msg.id); send({ t: 'close', id: msg.id }); });
        } else {
          // http request via local fetch
          console.log(`[tunnel] http ${msg.method} ${msg.path}`);
          try {
            const headers: Record<string, string> = {};
            if (msg.headers?.['content-type']) headers['content-type'] = msg.headers['content-type'];
            if (msg.headers?.authorization) headers.authorization = msg.headers.authorization;
            const res = await fetch(httpBase + msg.path, {
              method: msg.method || 'GET',
              headers,
              body: msg.bodyB64 ? Buffer.from(msg.bodyB64, 'base64') : undefined,
            });
            const buf = Buffer.from(await res.arrayBuffer());
            console.log(`[tunnel] http-res ${msg.id} status ${res.status} bytes ${buf.length}`);
            send({
              t: 'http-res', id: msg.id, status: res.status,
              headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream' },
              bodyB64: buf.toString('base64'),
            });
          } catch (err) {
            console.error('[tunnel] http error', err);
            send({ t: 'http-res', id: msg.id, status: 502, headers: {}, bodyB64: Buffer.from(String(err)).toString('base64') });
          }
        }
        return;
      }

      if (msg.t === 'msg') {
        const s = localStreams.get(msg.id);
        if (s?.localWs && s.localWs.readyState === s.localWs.OPEN) s.localWs.send(msg.data);
        return;
      }
      if (msg.t === 'close') {
        const s = localStreams.get(msg.id);
        localStreams.delete(msg.id);
        try { s?.localWs?.close(); } catch { }
        return;
      }
    });

    function send(obj: unknown) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    }
  });
}

/** cloudflared quick-tunnel: spawns cloudflared binary if available */
export async function connectCloudflared(localPort: number): Promise<TunnelHandle> {
  const { spawn } = await import('node:child_process');
  const proc = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${localPort}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
      if (m) {
        resolve({ publicUrl: m[0], close: () => { try { proc.kill(); } catch { } } });
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', () => reject(new Error('cloudflared not found — install it or use --relay')));
    setTimeout(() => reject(new Error('cloudflared tunnel timeout')), 30_000);
  });
}
