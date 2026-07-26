import Fastify from 'fastify';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { networkInterfaces } from 'node:os';
import { loadOrInitConfig } from './config.js';
import { newPairingCode } from './auth.js';
import { SessionManager } from './manager.js';
import { registerHttp } from './http.js';
import { WsHub } from './ws.js';
import { connectCloudflared, connectRelay } from './tunnel.js';

const args = process.argv.slice(2);
const cmd = args[0] || 'serve';

async function main() {
  if (cmd === 'pair') return cmdPair();
  if (cmd === 'tunnel') return cmdTunnel(args.slice(1));
  return cmdServe();
}

/** default: run the Orbix server */
async function cmdServe() {
  const { config, initialPassword } = loadOrInitConfig();
  const manager = new SessionManager();

  const app = Fastify({ logger: false, bodyLimit: 110 * 1024 * 1024 });
  await registerHttp(app, config, manager);

  const hub = new WsHub(config, manager);

  await app.listen({ port: config.port, host: config.host });

  const wss = new WebSocketServer({ noServer: true });
  app.server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const token = url.searchParams.get('token') || '';
    wss.handleUpgrade(req, socket, head, (ws) => hub.handleConnection(ws, token));
  });

  const pair = newPairingCode();
  const addr = `http://localhost:${config.port}`;
  const lan = lanAddress(config.port);

  console.log('');
  console.log('  ◍ Orbix server is running');
  console.log('');
  console.log(`  Local:    ${addr}`);
  if (lan) console.log(`  LAN:      ${lan}`);
  console.log(`  Web UI:   ${addr}`);
  console.log(`  Machine:  ${config.machineName}`);
  if (initialPassword) {
    console.log('');
    console.log(`  ┌─ First-run credentials ──────────────`);
    console.log(`  │  Password: ${initialPassword}`);
    console.log(`  └─ (stored hashed in ~/.orbix/config.json; change with ORBIX_PASSWORD)`);
  }
  console.log('');
  console.log(`  Pairing code (10 min): ${pair.code}`);
  try {
    const qr = await QRCode.toString(JSON.stringify({ url: lan || addr, code: pair.code }), { type: 'terminal', small: true });
    console.log(qr);
  } catch { }
  console.log('  CLIs detected:');
  for (const s of await manager.cliStatus()) {
    console.log(`    ${s.installed ? '✓' : '✗'} ${s.agent.padEnd(7)} ${s.installed ? s.version : 'not found'}`);
  }
  console.log('');

  // auto-import native CLI sessions (with history backfill) in the background
  void manager.autoImportAll().then(n => {
    if (n > 0) console.log(`  imported ${n} native session(s)`);
  }).catch(() => { });

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  // Keep the process running
  await new Promise(() => {});
}

/** mint a pairing code against the running local server */
async function cmdPair() {
  const { config } = loadOrInitConfig();
  const res = await fetch(`http://127.0.0.1:${config.port}/api/pair/mint`, { method: 'POST' });
  if (!res.ok) {
    console.error('Could not reach the local Orbix server — is it running? (orbix serve)');
    process.exit(1);
  }
  const { code, expiresAt } = await res.json() as { code: string; expiresAt: number };
  console.log(`Pairing code: ${code}  (valid ${Math.round((expiresAt - Date.now()) / 60000)} min)`);
  try {
    console.log(await QRCode.toString(JSON.stringify({ url: `http://<this-machine>:${config.port}`, code }), { type: 'terminal', small: true }));
  } catch { }
}

/** expose the local server via a relay or cloudflared */
async function cmdTunnel(targs: string[]) {
  const { config } = loadOrInitConfig();
  const relayIdx = targs.indexOf('--relay');
  const keyIdx = targs.indexOf('--key');
  const useCf = targs.includes('--cloudflared');

  if (relayIdx >= 0) {
    const relay = targs[relayIdx + 1];
    const key = keyIdx >= 0 ? targs[keyIdx + 1] : '';
    if (!relay || !key) {
      console.error('usage: orbix tunnel --relay ws(s)://relay-host:8770 --key <relay-key>');
      process.exit(1);
    }
    console.log(`connecting to relay ${relay}…`);
    const handle = await connectRelay({ relay, key, localPort: config.port });
    console.log('');
    console.log(`  ◍ Public URL: ${handle.publicUrl}`);
    console.log('  Use this address (+ your Orbix password) in the app.');
    try { console.log(await QRCode.toString(handle.publicUrl, { type: 'terminal', small: true })); } catch { }
    console.log('\n  tunnel active — Ctrl+C to stop\n');
  } else if (useCf) {
    console.log('starting cloudflared quick tunnel…');
    const handle = await connectCloudflared(config.port);
    console.log('');
    console.log(`  ◍ Public URL: ${handle.publicUrl}`);
    console.log('  Use this address (+ your Orbix password) in the app.');
    try { console.log(await QRCode.toString(handle.publicUrl, { type: 'terminal', small: true })); } catch { }
    console.log('\n  tunnel active — Ctrl+C to stop\n');
  } else {
    console.error('usage: orbix tunnel --relay <url> --key <key>   OR   orbix tunnel --cloudflared');
    process.exit(1);
  }
}

function lanAddress(port: number): string | null {
  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const n of nets[name] || []) {
        if (n.family === 'IPv4' && !n.internal) return `http://${n.address}:${port}`;
      }
    }
  } catch { }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
