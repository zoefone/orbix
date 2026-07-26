import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.js';
import { Session, TimelineEvent } from '@orbix/shared';

const SESS_DIR = join(DATA_DIR, 'sessions');
const TL_DIR = join(DATA_DIR, 'timelines');

function atomicWrite(path: string, data: string) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export class Store {
  private sessions = new Map<string, Session>();
  private seqs = new Map<string, number>();

  constructor() {
    mkdirSync(SESS_DIR, { recursive: true });
    mkdirSync(TL_DIR, { recursive: true });
    for (const f of readdirSync(SESS_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const s = Session.parse(JSON.parse(readFileSync(join(SESS_DIR, f), 'utf8')));
        this.sessions.set(s.id, s);
      } catch { /* skip corrupt */ }
    }
    // restore seq counters from timeline tails
    for (const id of this.sessions.keys()) {
      this.seqs.set(id, this.readLastSeq(id));
    }
  }

  private tlPath(id: string) { return join(TL_DIR, `${id}.jsonl`); }

  private readLastSeq(id: string): number {
    const p = this.tlPath(id);
    if (!existsSync(p)) return 0;
    const lines = readFileSync(p, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try { const ev = JSON.parse(lines[i]) as TimelineEvent; if (typeof ev.seq === 'number') return ev.seq; } catch { }
    }
    return 0;
  }

  listSessions(): Session[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getSession(id: string): Session | undefined { return this.sessions.get(id); }

  saveSession(s: Session) {
    this.sessions.set(s.id, s);
    atomicWrite(join(SESS_DIR, `${s.id}.json`), JSON.stringify(s, null, 2));
  }

  deleteSession(id: string) {
    this.sessions.delete(id);
    try { renameSync(join(SESS_DIR, `${id}.json`), join(SESS_DIR, `${id}.json.deleted`)); } catch { }
  }

  nextSeq(sessionId: string): number {
    const n = (this.seqs.get(sessionId) || 0) + 1;
    this.seqs.set(sessionId, n);
    return n;
  }

  appendEvent(ev: TimelineEvent) {
    appendFileSync(this.tlPath(ev.sessionId), JSON.stringify(ev) + '\n');
  }

  /** list events oldest-first; dedupe by id keeping the latest seq; then take the last `limit` */
  listEvents(sessionId: string, beforeSeq?: number, limit = 200): TimelineEvent[] {
    const p = this.tlPath(sessionId);
    if (!existsSync(p)) return [];
    const lines = readFileSync(p, 'utf8').trim().split('\n');
    const byId = new Map<string, TimelineEvent>();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as TimelineEvent;
        if (beforeSeq !== undefined && ev.seq >= beforeSeq) continue;
        byId.set(ev.id, ev); // later lines overwrite -> keeps max seq
      } catch { }
    }
    return [...byId.values()].sort((a, b) => a.seq - b.seq).slice(-limit);
  }
}
