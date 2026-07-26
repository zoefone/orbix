import type { Attachment, ClientCommand, PushFrame } from './types';

export interface ServerProfile {
  url: string;
  token: string;
  machine?: string;
}

let ridSeq = 0;

export class OrbixClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private pushHandlers = new Set<(f: PushFrame) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  onStatus: ((s: 'connecting' | 'online' | 'offline') => void) | null = null;

  constructor(public profile: ServerProfile) { }

  connect() {
    this.closedByUser = false;
    this.openWs();
  }

  private openWs() {
    this.onStatus?.('connecting');
    const wsUrl = this.profile.url.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(this.profile.token);
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    ws.onopen = () => this.onStatus?.('online');
    ws.onclose = () => {
      this.onStatus?.('offline');
      for (const p of this.pending.values()) p.reject(new Error('connection closed'));
      this.pending.clear();
      if (!this.closedByUser) {
        this.reconnectTimer = setTimeout(() => this.openWs(), 2500);
      }
    };
    ws.onerror = () => { try { ws.close(); } catch { } };
    ws.onmessage = (e) => {
      let msg: { rid?: string; ok?: boolean; data?: unknown; error?: string } & PushFrame;
      try { msg = JSON.parse(String(e.data)); } catch { return; }
      if (msg.rid !== undefined) {
        const p = this.pending.get(msg.rid);
        if (p) {
          this.pending.delete(msg.rid);
          msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error || 'request failed'));
        }
        return;
      }
      if ((msg as PushFrame).push) for (const h of this.pushHandlers) h(msg as PushFrame);
    };
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.ws?.close(); } catch { }
  }

  onPush(h: (f: PushFrame) => void) {
    this.pushHandlers.add(h);
    return () => { this.pushHandlers.delete(h); };
  }

  call<T = unknown>(cmd: ClientCommand): Promise<T> {
    const rid = String(++ridSeq);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(rid, { resolve: resolve as (v: unknown) => void, reject });
      const doSend = () => this.ws?.send(JSON.stringify({ rid, ...cmd }));
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        doSend();
      } else if (this.ws) {
        const ws = this.ws;
        const onOpen = () => { ws.removeEventListener('open', onOpen); if (this.pending.has(rid)) doSend(); };
        ws.addEventListener('open', onOpen);
      }
      setTimeout(() => { if (this.pending.delete(rid)) reject(new Error('timeout')); }, 300_000);
    });
  }

  async upload(files: Array<{ uri: string; name: string; type: string }>): Promise<Attachment[]> {
    const fd = new FormData();
    for (const f of files) {
      fd.append('files', { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
    }
    const res = await fetch(this.profile.url + '/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.profile.token },
      body: fd,
    });
    if (!res.ok) throw new Error('upload failed: ' + res.status);
    const data = await res.json() as { files: Attachment[] };
    return data.files;
  }

  attachmentUrl(a: Attachment): string {
    return this.profile.url + a.url + '?token=' + encodeURIComponent(this.profile.token);
  }
}

export async function login(url: string, password: string): Promise<ServerProfile> {
  const res = await fetch(url + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Invalid password or unreachable server');
  const data = await res.json();
  return { url, token: data.token, machine: data.machine };
}

export async function pair(url: string, code: string): Promise<ServerProfile> {
  const res = await fetch(url + '/api/auth/pair', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error('Invalid or expired pairing code');
  const data = await res.json();
  return { url, token: data.token, machine: data.machine };
}

export async function health(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url + '/api/health', { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}
