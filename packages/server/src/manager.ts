import { randomBytes } from 'node:crypto';
import type { AgentKind, Attachment, NativeSession, PermissionMode, Session, SessionStatus, TimelineEvent } from '@orbix/shared';
import { projectName } from '@orbix/shared';
import { Store } from './store.js';
import type { AdapterCallbacks, AdapterEvent, AgentAdapter } from './adapters/types.js';
import { ClaudeAdapter } from './adapters/claude.js';
import { CodexAdapter } from './adapters/codex.js';
import { CursorAdapter } from './adapters/cursor.js';

const newId = () => randomBytes(8).toString('hex');

type PushFn = (frame: { push: 'session'; session: Session } | { push: 'event'; event: TimelineEvent } | { push: 'notify'; level: 'info' | 'approval' | 'done' | 'error'; sessionId: string; title: string; body: string; requestId?: string }) => void;

export class SessionManager {
  private adapters: Record<AgentKind, AgentAdapter>;
  /** live (started) sessions */
  private live = new Set<string>();
  private store = new Store();
  private pushHandlers = new Set<PushFn>();

  constructor() {
    this.adapters = { claude: new ClaudeAdapter(), codex: new CodexAdapter(), cursor: new CursorAdapter() };
  }

  onPush(fn: PushFn): () => void {
    this.pushHandlers.add(fn);
    return () => { this.pushHandlers.delete(fn); };
  }

  private push(frame: Parameters<PushFn>[0]) {
    for (const fn of this.pushHandlers) { try { fn(frame); } catch { } }
  }

  cliStatus() {
    return Promise.all([this.adapters.claude.detect(), this.adapters.codex.detect(), this.adapters.cursor.detect()]);
  }

  listSessions(): Session[] { return this.store.listSessions(); }

  getSession(id: string): Session | undefined { return this.store.getSession(id); }

  listEvents(sessionId: string, beforeSeq?: number, limit?: number) {
    return this.store.listEvents(sessionId, beforeSeq, limit);
  }

  async listNative(agent?: AgentKind): Promise<NativeSession[]> {
    const kinds: AgentKind[] = agent ? [agent] : ['claude', 'codex', 'cursor'];
    const known = new Set(this.store.listSessions().map(s => `${s.agent}:${s.nativeSessionId}`));
    const all: NativeSession[] = [];
    for (const k of kinds) {
      try { all.push(...await this.adapters[k].listNative()); } catch { }
    }
    return all.filter(n => !known.has(`${n.agent}:${n.nativeId}`)).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private makeCallbacks(sessionId: string): AdapterCallbacks {
    return {
      emit: (sid, ev) => this.handleAdapterEvent(sessionId, ev),
    };
  }

  // ---- streaming agent_message merge (one event id per turn, ~150ms throttle) ----
  private streaming = new Map<string, { id: string; text: string; lastFlush: number; timer?: NodeJS.Timeout }>();

  private handleStreamingMessage(sessionId: string, text: string) {
    let st = this.streaming.get(sessionId);
    if (!st) {
      st = { id: newId(), text: '', lastFlush: 0 };
      this.streaming.set(sessionId, st);
    }
    st.text = text;
    if (Date.now() - st.lastFlush > 150) {
      this.emitStreaming(sessionId, st, true);
    } else if (!st.timer) {
      st.timer = setTimeout(() => {
        const cur = this.streaming.get(sessionId);
        if (cur) { cur.timer = undefined; this.emitStreaming(sessionId, cur, true); }
      }, 160);
    }
  }

  private emitStreaming(sessionId: string, st: { id: string; text: string; lastFlush: number }, streaming: boolean) {
    st.lastFlush = Date.now();
    const ev: TimelineEvent = { id: st.id, sessionId, seq: this.store.nextSeq(sessionId), ts: Date.now(), type: 'agent_message', text: st.text, streaming };
    this.store.appendEvent(ev);
    this.push({ push: 'event', event: ev });
  }

  private flushStreamingMessage(sessionId: string, text: string) {
    const st = this.streaming.get(sessionId);
    if (st?.timer) clearTimeout(st.timer);
    this.streaming.delete(sessionId);
    const ev: TimelineEvent = {
      id: st?.id || newId(), sessionId, seq: this.store.nextSeq(sessionId), ts: Date.now(),
      type: 'agent_message', text: text || st?.text || '', streaming: false,
    };
    this.store.appendEvent(ev);
    this.push({ push: 'event', event: ev });
  }

  // ---- reasoning merge: consecutive reasoning events fold into one block ----
  private reasoning = new Map<string, { id: string; text: string; lastFlush: number }>();

  private handleReasoning(sessionId: string, text: string) {
    let st = this.reasoning.get(sessionId);
    if (!st) {
      st = { id: newId(), text: '', lastFlush: 0 };
      this.reasoning.set(sessionId, st);
    }
    st.text = st.text + text;
    if (Date.now() - st.lastFlush < 400) return; // throttle
    st.lastFlush = Date.now();
    const ev: TimelineEvent = { id: st.id, sessionId, seq: this.store.nextSeq(sessionId), ts: Date.now(), type: 'reasoning', text: st.text };
    this.store.appendEvent(ev);
    this.push({ push: 'event', event: ev });
  }

  private flushReasoning(sessionId: string) {
    const st = this.reasoning.get(sessionId);
    if (!st) return;
    this.reasoning.delete(sessionId);
    const ev: TimelineEvent = { id: st.id, sessionId, seq: this.store.nextSeq(sessionId), ts: Date.now(), type: 'reasoning', text: st.text };
    this.store.appendEvent(ev);
    this.push({ push: 'event', event: ev });
  }

  private handleAdapterEvent(sessionId: string, ev: AdapterEvent) {
    const session = this.store.getSession(sessionId);
    if (!session) return;

    // capture native session id passed through reasoning back-channel
    if (ev.type === 'reasoning' && ev.text.startsWith('|native:')) {
      const nid = ev.text.slice('|native:'.length).trim();
      if (nid && nid !== session.nativeSessionId) {
        session.nativeSessionId = nid;
        session.updatedAt = Date.now();
        this.store.saveSession(session);
        this.push({ push: 'session', session });
      }
      return;
    }

    // streaming agent_message: merge deltas into one event id per turn, throttled
    if (ev.type === 'agent_message' && ev.streaming) {
      this.handleStreamingMessage(sessionId, ev.text);
      return;
    }
    if (ev.type === 'agent_message' && !ev.streaming) {
      this.flushStreamingMessage(sessionId, ev.text);
      return;
    }
    // merge consecutive reasoning events into one growing block
    if (ev.type === 'reasoning') {
      this.handleReasoning(sessionId, ev.text);
      return;
    }
    this.flushReasoning(sessionId);

    const full: TimelineEvent = {
      ...ev,
      id: newId(),
      sessionId,
      seq: this.store.nextSeq(sessionId),
      ts: Date.now(),
    } as TimelineEvent;
    this.store.appendEvent(full);
    this.push({ push: 'event', event: full });

    // maintain session status/diff/title
    let changed = false;
    if (ev.type === 'session_status') {
      if (session.status !== ev.status) { session.status = ev.status; changed = true; }
    } else if (ev.type === 'turn_status') {
      if (ev.state === 'started' && session.status !== 'running') { session.status = 'running'; changed = true; }
      if (ev.state === 'completed' || ev.state === 'failed' || ev.state === 'cancelled') {
        if (session.status !== 'idle') {
          session.status = ev.state === 'failed' ? 'error' : 'idle';
          if (ev.error) session.lastError = ev.error;
          changed = true;
        }
      }
      if (ev.state === 'completed' || ev.state === 'failed') {
        this.push({ push: 'notify', level: ev.state === 'completed' ? 'done' : 'error', sessionId, title: `${ev.state === 'completed' ? '✓ Task finished' : '✕ Task failed'} — ${session.title}`, body: session.project });
      }
    } else if (ev.type === 'permission_request') {
      session.status = 'awaiting_approval'; changed = true;
      this.push({ push: 'notify', level: 'approval', sessionId, title: `⚠ Approval needed — ${session.title}`, body: ev.title, requestId: ev.requestId });
    } else if (ev.type === 'permission_resolved') {
      if (session.status === 'awaiting_approval') { session.status = 'running'; changed = true; }
    } else if (ev.type === 'usage') {
      session.usage = ev.usage; changed = true;
      this.store.appendEvent({ ...ev, id: newId(), sessionId, seq: this.store.nextSeq(sessionId), ts: Date.now() } as TimelineEvent);
    } else if (ev.type === 'plan') {
      session.plan = ev.entries; changed = true;
    } else if (ev.type === 'tool_update') {
      if (typeof ev.diffAdded === 'number') { session.diffAdded += ev.diffAdded; changed = true; }
      if (typeof ev.diffRemoved === 'number') { session.diffRemoved += ev.diffRemoved; changed = true; }
    } else if (ev.type === 'user_message' && session.title === 'New session') {
      session.title = ev.text.split('\n')[0].slice(0, 60) || session.title;
      changed = true;
    }
    if (changed) {
      session.updatedAt = Date.now();
      this.store.saveSession(session);
      this.push({ push: 'session', session });
    }
  }

  async createSession(opts: { agent: AgentKind; cwd: string; model?: string; permissionMode: PermissionMode; prompt?: string; attachments?: Attachment[] }): Promise<Session> {
    const session: Session = {
      id: newId(),
      agent: opts.agent,
      title: opts.prompt ? opts.prompt.split('\n')[0].slice(0, 60) : 'New session',
      cwd: opts.cwd,
      project: projectName(opts.cwd),
      model: opts.model,
      permissionMode: opts.permissionMode,
      status: 'idle',
      origin: 'created',
      pinned: false,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      diffAdded: 0,
      diffRemoved: 0,
    };
    this.store.saveSession(session);
    this.push({ push: 'session', session });
    await this.ensureStarted(session.id, opts.prompt, opts.attachments);
    return this.store.getSession(session.id)!;
  }

  async importSession(opts: { agent: AgentKind; nativeId: string; cwd: string; title?: string; model?: string }): Promise<Session> {
    const existing = this.store.listSessions().find(s => s.agent === opts.agent && s.nativeSessionId === opts.nativeId);
    if (existing) return existing;
    const session: Session = {
      id: newId(),
      agent: opts.agent,
      title: (opts.title || 'Imported session').slice(0, 60),
      cwd: opts.cwd,
      project: projectName(opts.cwd),
      model: opts.model,
      permissionMode: 'default',
      status: 'idle',
      nativeSessionId: opts.nativeId,
      origin: 'imported',
      pinned: false,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      diffAdded: 0,
      diffRemoved: 0,
    };
    this.store.saveSession(session);
    this.push({ push: 'session', session });
    return session;
  }

  /** start the backing CLI process if not live (resume semantics via nativeSessionId) */
  private async ensureStarted(sessionId: string, prompt?: string, attachments?: Attachment[]) {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error('session not found');
    if (this.live.has(sessionId)) return;
    const adapter = this.adapters[session.agent];
    session.status = 'idle';
    this.live.add(sessionId);
    try {
      await adapter.start(session, this.makeCallbacks(sessionId), prompt, attachments);
    } catch (err) {
      this.live.delete(sessionId);
      session.status = 'error';
      session.lastError = err instanceof Error ? err.message : String(err);
      this.store.saveSession(session);
      this.push({ push: 'session', session });
      throw err;
    }
  }

  async sendMessage(sessionId: string, text: string, attachments?: Attachment[], deliver?: 'queue' | 'steer') {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error('session not found');
    await this.ensureStarted(sessionId);
    await this.adapters[session.agent].send(session, text, attachments, deliver);
  }

  async execCommand(sessionId: string, command: string, args?: string) {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error('session not found');
    const adapter = this.adapters[session.agent];
    await this.ensureStarted(sessionId);
    const handled = await adapter.execCommand(session, command, args);
    if (!handled) {
      // fall back: send as a normal text message (CLIs interpret "/cmd" natively)
      await adapter.send(session, `/${command}${args ? ' ' + args : ''}`);
    }
  }

  async capabilities(agent?: AgentKind) {
    const kinds: AgentKind[] = agent ? [agent] : ['codex', 'claude', 'cursor'];
    const out = [];
    for (const k of kinds) {
      try { out.push(await this.adapters[k].capabilities()); } catch { }
    }
    return out;
  }

  /** import every native session that isn't known yet (with history backfill) */
  async autoImportAll(): Promise<number> {
    let count = 0;
    for (const agent of ['codex', 'claude', 'cursor'] as AgentKind[]) {
      let natives: NativeSession[] = [];
      try {
        natives = await this.adapters[agent].listNative();
      } catch {
        continue;
      }
      const byNative = new Map(this.store.listSessions().filter(s => s.agent === agent && s.nativeSessionId).map(s => [s.nativeSessionId!, s]));
      for (const n of natives) {
        if (!n.nativeId) continue;
        try {
          const existing = byNative.get(n.nativeId);
          if (existing) {
            // already imported — backfill if its timeline lacks real content
            await this.backfillHistory(existing.id);
            continue;
          }
          const sess = await this.importSession({ agent, nativeId: n.nativeId, cwd: n.cwd, title: n.title, model: n.model });
          await this.backfillHistory(sess.id);
          count++;
        } catch { }
      }
    }
    return count;
  }

  /** fill an imported session's timeline from the CLI's native transcript */
  async backfillHistory(sessionId: string): Promise<number> {
    const session = this.store.getSession(sessionId);
    if (!session?.nativeSessionId) return 0;
    // skip if the timeline already has meaningful content (user/agent messages)
    const existing = this.store.listEvents(sessionId, undefined, 100);
    const hasContent = existing.some(e => e.type === 'user_message' || e.type === 'agent_message');
    if (hasContent) return 0;
    const events = await this.adapters[session.agent].readHistory(session, 300);
    let n = 0;
    for (const ev of events) {
      const full = { ...ev, id: newId(), sessionId, seq: this.store.nextSeq(sessionId), ts: session.createdAt + n } as TimelineEvent;
      this.store.appendEvent(full);
      n++;
    }
    if (n > 0) this.push({ push: 'session', session });
    return n;
  }

  async interrupt(sessionId: string) {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error('session not found');
    if (this.live.has(sessionId)) await this.adapters[session.agent].interrupt(session);
    else {
      session.status = 'idle';
      this.store.saveSession(session);
      this.push({ push: 'session', session });
    }
  }

  async respondPermission(sessionId: string, requestId: string, decision: 'allow' | 'allow_session' | 'deny') {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error('session not found');
    await this.adapters[session.agent].respondPermission(session, requestId, decision);
  }

  async updateSession(id: string, patch: Partial<Pick<Session, 'title' | 'pinned' | 'archived' | 'permissionMode' | 'model' | 'effort' | 'speed' | 'mode'>>): Promise<Session> {
    const session = this.store.getSession(id);
    if (!session) throw new Error('session not found');
    const configChanged = patch.model !== undefined || patch.effort !== undefined || patch.speed !== undefined || patch.mode !== undefined || patch.permissionMode !== undefined;
    Object.assign(session, patch);
    session.updatedAt = Date.now();
    this.store.saveSession(session);
    this.push({ push: 'session', session });
    if (configChanged && this.live.has(id)) {
      try { await this.adapters[session.agent].applyConfig(session); } catch { }
    }
    return session;
  }

  async deleteSession(id: string) {
    const session = this.store.getSession(id);
    if (session && this.live.has(id)) {
      await this.adapters[session.agent].dispose(session);
      this.live.delete(id);
    }
    this.store.deleteSession(id);
  }

  /** re-attach a stored session (after server restart or on demand) */
  async attach(id: string) {
    await this.ensureStarted(id);
  }

  async shutdown() {
    for (const id of [...this.live]) {
      const s = this.store.getSession(id);
      if (s) { try { await this.adapters[s.agent].dispose(s); } catch { } }
    }
    this.live.clear();
  }

  isLive(id: string) { return this.live.has(id); }
}
