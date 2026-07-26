import { ChildProcess, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AgentCapabilities, Attachment, CliStatus, NativeSession, PermissionMode, Session, TimelineEvent } from '@orbix/shared';
import { JsonRpc } from '../jsonrpc.js';
import type { AdapterCallbacks, AdapterEvent, AgentAdapter } from './types.js';
import { clip } from './types.js';

const pexec = promisify(execFile);
const require = createRequire(import.meta.url);

function findAgentBin(): string {
  return process.env.ORBIX_CURSOR_PATH || join(homedir(), '.local', 'bin', 'agent');
}

interface CursorSession {
  proc?: ChildProcess;
  rpc?: JsonRpc;
  acpSessionId?: string;
  agentText: string;
  /** fallback mode: one-shot `agent -p` per message */
  fallback: boolean;
  busy: boolean;
}

function acpToolKind(kind?: string): 'shell' | 'read' | 'edit' | 'write' | 'search' | 'mcp' | 'web' | 'other' {
  switch ((kind || '').toLowerCase()) {
    case 'execute': case 'shell': case 'bash': return 'shell';
    case 'read': return 'read';
    case 'edit': return 'edit';
    case 'write': return 'write';
    case 'search': return 'search';
    case 'fetch': case 'web': return 'web';
    default: return 'other';
  }
}

export class CursorAdapter implements AgentAdapter {
  kind = 'cursor' as const;
  private sessions = new Map<string, CursorSession>();
  private cbs = new Map<string, AdapterCallbacks>();
  private pendingPerms = new Map<string, { rpc: JsonRpc; msgId: number | string; options: Array<{ optionId: string; kind?: string }> }>();

  async detect(): Promise<CliStatus> {
    const bin = findAgentBin();
    try {
      const { stdout } = await pexec(bin, ['--version'], { timeout: 15000 });
      return { agent: 'cursor', installed: true, version: stdout.trim(), path: bin };
    } catch {
      return { agent: 'cursor', installed: false, path: bin };
    }
  }

  private emit(sessionId: string, ev: AdapterEvent) {
    this.cbs.get(sessionId)?.emit(sessionId, ev);
  }

  async start(session: Session, cb: AdapterCallbacks, prompt?: string, attachments?: Attachment[]): Promise<void> {
    if (this.sessions.has(session.id)) return;
    this.cbs.set(session.id, cb);
    const state: CursorSession = { agentText: '', fallback: false, busy: false };
    this.sessions.set(session.id, state);

    try {
      await this.startAcp(session, state);
    } catch (err) {
      // ACP unavailable — fall back to one-shot print mode
      state.fallback = true;
      this.emit(session.id, { type: 'reasoning', text: `ACP unavailable, using print-mode fallback (${err instanceof Error ? err.message : String(err)})` });
    }
    if (prompt) await this.send(session, prompt, attachments);
  }

  private async startAcp(session: Session, state: CursorSession): Promise<void> {
    const bin = findAgentBin();
    const proc = spawn(bin, ['acp'], { cwd: session.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderrBuf = '';
    proc.stderr?.on('data', (d) => { stderrBuf = (stderrBuf + d.toString()).slice(-2000); });
    state.proc = proc;
    state.rpc = new JsonRpc(proc);

    proc.on('exit', () => {
      if (!state.fallback) {
        this.emit(session.id, { type: 'session_status', status: 'error' });
        this.emit(session.id, { type: 'turn_status', state: 'failed', error: clip(stderrBuf, 300) || 'agent acp exited' });
      }
      this.sessions.delete(session.id);
    });

    state.rpc.onMessage((msg) => this.handleAcpFrame(session, state, msg));

    await state.rpc.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'orbix', version: '0.1.0' },
    }, 30_000);

    // new session, or attach to an existing cursor chat
    if (session.nativeSessionId) {
      try {
        await state.rpc.request('session/load', { sessionId: session.nativeSessionId, cwd: session.cwd, mcpServers: [] }, 30_000);
        state.acpSessionId = session.nativeSessionId;
      } catch {
        const res = await state.rpc.request<AcpNewSessionResponse>('session/new', { cwd: session.cwd, mcpServers: [] }, 30_000);
        state.acpSessionId = res.sessionId;
        this.cacheSessionInfo(res);
      }
    } else {
      const res = await state.rpc.request<AcpNewSessionResponse>('session/new', { cwd: session.cwd, mcpServers: [] }, 30_000);
      state.acpSessionId = res.sessionId;
      this.cacheSessionInfo(res);
      this.emit(session.id, { type: 'reasoning', text: `|native:${state.acpSessionId}` });
    }
    this.emit(session.id, { type: 'session_status', status: 'idle' });
  }

  private sessionInfoCache: { models: Array<{ modelId: string; name: string }>; modes: Array<{ id: string; name: string; description?: string }>; at: number } | null = null;
  private cacheSessionInfo(res: AcpNewSessionResponse) {
    const models = res.models?.availableModels?.map(m => ({ modelId: m.modelId, name: m.name || m.modelId })) || [];
    const modes = res.modes?.availableModes || [];
    if (models.length || modes.length) this.sessionInfoCache = { models, modes, at: Date.now() };
  }

  private handleAcpFrame(session: Session, state: CursorSession, msg: Record<string, unknown>) {
    const id = session.id;
    const method = msg.method as string | undefined;
    if (!method) return;

    if (method === 'session/request_permission') {
      const p = (msg.params || {}) as { toolCall?: { title?: string; rawInput?: { command?: string } }; options?: Array<{ optionId: string; name?: string; kind?: string }> };
      const requestId = `cursor-${id}-${String(msg.id)}`;
      const options = p.options || [];
      if (session.permissionMode === 'bypass') {
        // auto-approve in bypass mode
        const allow = options.find(o => o.kind === 'allow_once') || options[0];
        if (allow) {
          state.rpc!.respond(msg.id as number, { outcome: { outcome: 'selected', optionId: allow.optionId } });
          return;
        }
      }
      this.pendingPerms.set(requestId, { rpc: state.rpc!, msgId: msg.id as number, options });
      this.emit(id, {
        type: 'permission_request', requestId,
        tool: 'shell',
        title: p.toolCall?.title || 'Permission requested',
        command: p.toolCall?.rawInput?.command,
      });
      this.emit(id, { type: 'session_status', status: 'awaiting_approval' });
      return;
    }

    if (method === 'session/update') {
      const p = (msg.params || {}) as { update?: Record<string, unknown> };
      const u = p.update || {};
      const kind = u.sessionUpdate as string;
      switch (kind) {
        case 'agent_message_chunk': {
          const content = (u.content || {}) as { type?: string; text?: string };
          if (content.text) {
            state.agentText += content.text;
            this.emit(id, { type: 'agent_message', text: state.agentText, streaming: true });
          }
          break;
        }
        case 'agent_thought_chunk': {
          const content = (u.content || {}) as { text?: string };
          if (content.text) this.emit(id, { type: 'reasoning', text: clip(content.text, 300)! });
          break;
        }
        case 'tool_call': {
          const toolId = String(u.toolCallId || `t-${Date.now()}`);
          const title = String(u.title || 'tool');
          const rawInput = (u.rawInput || {}) as { command?: string; path?: string };
          this.emit(id, {
            type: 'tool_call', toolId,
            kind: acpToolKind(u.kind as string),
            title, command: rawInput.command, detail: rawInput.path,
            status: 'running',
          });
          break;
        }
        case 'tool_call_update': {
          const toolId = String(u.toolCallId || '');
          const statusMap: Record<string, 'running' | 'done' | 'error'> = { completed: 'done', failed: 'error', in_progress: 'running', pending: 'running' };
          const content = u.content;
          let output: string | undefined;
          if (Array.isArray(content)) {
            output = content.map(c => {
              const cc = c as { type?: string; content?: { text?: string }; text?: string };
              return cc.text || cc.content?.text || '';
            }).join('\n');
          }
          const rawOutput = typeof u.rawOutput === 'string' ? u.rawOutput : undefined;
          this.emit(id, {
            type: 'tool_update', toolId,
            status: statusMap[String(u.status)] || 'done',
            output: clip(output || rawOutput, 3000),
          });
          break;
        }
        case 'plan': {
          const entries = (u.entries || []) as Array<{ content?: string; status?: string }>;
          const list = entries.map(e => ({ content: e.content || '', status: e.status })).filter(e => e.content);
          if (list.length) this.emit(id, { type: 'plan', entries: list });
          break;
        }
        case 'usage_update': {
          const used = (u.used ?? u.totalTokens ?? 0) as number;
          const size = (u.size ?? u.contextWindow ?? 0) as number;
          this.emit(id, { type: 'usage', usage: { totalTokens: used, contextWindow: size || undefined, percent: size ? Math.round((used / size) * 100) : undefined } });
          break;
        }
      }
      return;
    }
  }

  async send(session: Session, text: string, attachments?: Attachment[], _deliver?: 'queue' | 'steer'): Promise<void> {
    const state = this.sessions.get(session.id);
    if (!state) throw new Error('session not running');
    this.emit(session.id, { type: 'user_message', text, attachments });

    const attachNote = (attachments || []).map(a => `[Attached ${a.mime.startsWith('image/') ? 'image' : 'file'}: ${a.name} — local path: ${a.path}]`).join('\n');
    const fullText = attachNote ? `${text}\n\n${attachNote}` : text;

    if (state.fallback) return this.sendFallback(session, state, fullText);

    state.agentText = '';
    state.busy = true;
    this.emit(session.id, { type: 'turn_status', state: 'started' });
    this.emit(session.id, { type: 'session_status', status: 'running' });
    try {
      const prompt: unknown[] = [{ type: 'text', text: fullText }];
      await state.rpc!.request('session/prompt', { sessionId: state.acpSessionId, prompt }, 600_000);
      if (state.agentText) this.emit(session.id, { type: 'agent_message', text: state.agentText, streaming: false });
      this.emit(session.id, { type: 'turn_status', state: 'completed' });
    } catch (err) {
      this.emit(session.id, { type: 'turn_status', state: 'failed', error: clip(err instanceof Error ? err.message : String(err), 400) });
    } finally {
      state.busy = false;
      this.emit(session.id, { type: 'session_status', status: 'idle' });
    }
  }

  /** fallback: one-shot `agent -p --output-format stream-json [--resume id]` */
  private async sendFallback(session: Session, state: CursorSession, text: string): Promise<void> {
    const bin = findAgentBin();
    const args = ['-p', text, '--output-format', 'stream-json', '--trust'];
    if (session.nativeSessionId) args.push('--resume', session.nativeSessionId);
    if (session.permissionMode === 'bypass' || session.permissionMode === 'acceptEdits') args.push('--force');
    if (session.permissionMode === 'plan') args.push('--mode', 'plan');
    if (session.model) args.push('--model', session.model);

    this.emit(session.id, { type: 'turn_status', state: 'started' });
    this.emit(session.id, { type: 'session_status', status: 'running' });
    state.busy = true;

    const proc = spawn(bin, args, { cwd: session.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let errBuf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(line); } catch { continue; }
        this.handleFallbackLine(session, obj);
      }
    });
    proc.stderr.on('data', (d) => { errBuf = (errBuf + d.toString()).slice(-1500); });
    proc.on('exit', (code) => {
      state.busy = false;
      if (code === 0) {
        this.emit(session.id, { type: 'turn_status', state: 'completed' });
        this.emit(session.id, { type: 'session_status', status: 'idle' });
      } else {
        this.emit(session.id, { type: 'turn_status', state: 'failed', error: clip(errBuf, 400) || `exit ${code}` });
        this.emit(session.id, { type: 'session_status', status: 'error' });
      }
    });
  }

  private handleFallbackLine(session: Session, obj: Record<string, unknown>) {
    const id = session.id;
    const t = obj.type as string;
    if (t === 'assistant') {
      const m = (obj.message || {}) as { content?: Array<{ type?: string; text?: string }> };
      const text = (m.content || []).map(c => c.text || '').join('');
      if (text) this.emit(id, { type: 'agent_message', text, streaming: false });
    } else if (t === 'tool_call') {
      const subtype = obj.subtype as string;
      const callId = String(obj.call_id || `t-${Date.now()}`);
      if (subtype === 'started') {
        const name = Object.keys(obj).find(k => k.endsWith('ToolCall'));
        this.emit(id, {
          type: 'tool_call', toolId: callId,
          kind: name?.toLowerCase().includes('write') || name?.toLowerCase().includes('edit') ? 'edit' : name?.toLowerCase().includes('read') ? 'read' : 'shell',
          title: name?.replace('ToolCall', '') || 'tool',
          detail: name ? clip(JSON.stringify(obj[name]), 200) : undefined,
          status: 'running',
        });
      } else {
        this.emit(id, { type: 'tool_update', toolId: callId, status: 'done', output: clip(JSON.stringify(obj.result || ''), 1500) });
      }
    } else if (t === 'system' && obj.subtype === 'init') {
      const sid = obj.session_id as string | undefined;
      if (sid) this.emit(id, { type: 'reasoning', text: `|native:${sid}` });
    } else if (t === 'result') {
      const r = obj as { is_error?: boolean; result?: string };
      if (r.is_error) this.emit(id, { type: 'turn_status', state: 'failed', error: clip(r.result, 300) });
    }
  }

  async interrupt(session: Session): Promise<void> {
    const state = this.sessions.get(session.id);
    if (state && !state.fallback && state.rpc) {
      try { await state.rpc.request('session/cancel', { sessionId: state.acpSessionId }, 10_000); } catch { }
    }
    this.emit(session.id, { type: 'turn_status', state: 'cancelled' });
    this.emit(session.id, { type: 'session_status', status: 'idle' });
  }

  async respondPermission(session: Session, requestId: string, decision: 'allow' | 'allow_session' | 'deny'): Promise<void> {
    const pa = this.pendingPerms.get(requestId);
    if (!pa) return;
    this.pendingPerms.delete(requestId);
    const wanted = decision === 'deny'
      ? (pa.options.find(o => o.kind === 'reject_once') || pa.options.find(o => (o.kind || '').includes('reject')))
      : decision === 'allow_session'
        ? (pa.options.find(o => o.kind === 'allow_always') || pa.options.find(o => o.kind === 'allow_once'))
        : pa.options.find(o => o.kind === 'allow_once');
    const opt = wanted || pa.options[0];
    if (opt) pa.rpc.respond(pa.msgId, { outcome: { outcome: 'selected', optionId: opt.optionId } });
    else pa.rpc.respond(pa.msgId, { outcome: { outcome: 'cancelled' } });
    this.emit(session.id, { type: 'permission_resolved', requestId, decision });
    this.emit(session.id, { type: 'session_status', status: 'running' });
  }

  async dispose(session: Session): Promise<void> {
    const state = this.sessions.get(session.id);
    if (state?.proc) { try { state.proc.kill('SIGTERM'); } catch { } }
    this.sessions.delete(session.id);
    this.cbs.delete(session.id);
  }

  async capabilities(): Promise<AgentCapabilities> {
    // probe a short-lived ACP session for models/modes (cheap, local)
    if (!this.sessionInfoCache || Date.now() - this.sessionInfoCache.at > 10 * 60_000) {
      try {
        const bin = findAgentBin();
        const proc = spawn(bin, ['acp'], { cwd: homedir(), stdio: ['pipe', 'pipe', 'pipe'] });
        const rpc = new JsonRpc(proc);
        try {
          await rpc.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'orbix', version: '0.1.0' } }, 20_000);
          const res = await rpc.request<AcpNewSessionResponse>('session/new', { cwd: homedir(), mcpServers: [] }, 20_000);
          this.cacheSessionInfo(res);
        } finally { proc.kill('SIGTERM'); }
      } catch { }
    }
    const info = this.sessionInfoCache;
    return {
      agent: 'cursor',
      models: info?.models.map(m => ({ id: m.modelId, name: m.name })) || [],
      efforts: [],
      speeds: ['default', 'fast'],
      modes: info?.modes.map(m => ({ id: m.id, name: m.name, description: m.description })) || [
        { id: 'agent', name: 'Agent' }, { id: 'plan', name: 'Plan' }, { id: 'ask', name: 'Ask' },
      ],
      permOptions: [
        { id: 'ask', label: 'Ask', description: 'Read-only Q&A, no edits' },
        { id: 'default', label: 'Default', description: 'Asks before commands run' },
        { id: 'run-everything', label: 'Run Everything', description: 'Force-allows all commands' },
      ],
      slashCommands: [
        { name: 'btw', description: 'Side question without disrupting the main chat', needsArgs: true },
        { name: 'fast', description: 'Toggle fast mode' },
        { name: 'summarize', description: 'Summarize the conversation to reduce context' },
        { name: 'plan', description: 'Switch to plan mode' },
      ],
      supportsQueue: true, supportsSteer: false,
    };
  }

  async execCommand(session: Session, command: string, args?: string): Promise<boolean> {
    const state = this.sessions.get(session.id);
    const cmd = command.replace(/^\//, '').split(' ')[0];
    if (cmd === 'plan' && state?.rpc && state.acpSessionId) {
      await state.rpc.request('session/set_mode', { sessionId: state.acpSessionId, modeId: 'plan' }, 15_000).catch(() => { });
      return true;
    }
    // these are interpreted by cursor when sent as prompt text
    if (['btw', 'fast', 'summarize', 'side', 'loop', 'goal', 'compact', 'sandbox'].includes(cmd)) {
      await this.send(session, `/${cmd}${args ? ' ' + args : ''}`);
      return true;
    }
    return false;
  }

  async applyConfig(session: Session): Promise<void> {
    const state = this.sessions.get(session.id);
    if (!state?.rpc || !state.acpSessionId) return;
    if (session.model) {
      await state.rpc.request('session/set_model', { sessionId: state.acpSessionId, modelId: session.model }, 15_000).catch(() => { });
    }
    if (session.mode) {
      await state.rpc.request('session/set_mode', { sessionId: state.acpSessionId, modeId: session.mode }, 15_000).catch(() => { });
    }
    if (session.speed === 'fast' || session.speed === 'max') {
      await state.rpc.request('session/set_config_option', { sessionId: state.acpSessionId, configId: session.speed === 'max' ? 'maxMode' : 'fastMode', value: true }, 15_000).catch(() => { });
    }
  }

  async readHistory(session: Session, limit = 300): Promise<AdapterEvent[]> {
    const out: AdapterEvent[] = [];
    const dbPath = findCursorStore(session.nativeSessionId || '');
    if (!dbPath) return out;
    try {
      const SQL = await loadSql();
      const db = new SQL.Database(new Uint8Array(readFileSync(dbPath)));
      const rows = db.exec('SELECT data FROM blobs');
      db.close();
      for (const row of rows) {
        for (const [val] of row.values) {
          if (out.length >= limit) break;
          // sql.js returns BLOB as Uint8Array, TEXT as string
          const text = typeof val === 'string' && /^[0-9a-f]+$/i.test(val) && !val.startsWith('{')
            ? Buffer.from(val, 'hex').toString('utf8')
            : Buffer.from(val as Uint8Array).toString('utf8');
          if (!text.startsWith('{')) continue;
          try {
            const msg = JSON.parse(text) as { role?: string; content?: unknown };
            const content = msg.content;
            const plain = typeof content === 'string' ? content
              : Array.isArray(content) ? content.map(c => (c as { text?: string }).text || '').join(' ') : '';
            // skip injected context blobs (user_info / environment etc.)
            if (plain.startsWith('<user_info>') || msg.role === 'system') continue;
            const cleaned = plain.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (!cleaned) continue;
            if (msg.role === 'user') out.push({ type: 'user_message', text: clip(cleaned, 3000)! });
            else if (msg.role === 'assistant') out.push({ type: 'agent_message', text: clip(cleaned, 8000)!, streaming: false });
          } catch { }
        }
      }
    } catch { }
    return out;
  }

  async listNative(): Promise<NativeSession[]> {
    const root = join(homedir(), '.cursor', 'chats');
    const out: NativeSession[] = [];
    if (!existsSync(root)) return out;
    let SQL: SqlJs | null = null;
    for (const ws of safeReaddir(root)) {
      const wsDir = join(root, ws);
      if (!isDir(wsDir)) continue;
      for (const chatId of safeReaddir(wsDir)) {
        const dir = join(wsDir, chatId);
        const metaPath = join(dir, 'meta.json');
        const dbPath = join(dir, 'store.db');
        if (!existsSync(metaPath) || !existsSync(dbPath)) continue;
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { cwd?: string; updatedAtMs?: number };
          if (!SQL) SQL = await loadSql();
          const info = readCursorStoreMeta(SQL, dbPath);
          out.push({
            agent: 'cursor',
            nativeId: chatId,
            title: info?.name || 'Untitled session',
            cwd: meta.cwd || '/root',
            model: info?.lastUsedModel,
            updatedAt: meta.updatedAtMs || statSync(dbPath).mtimeMs,
          });
        } catch { }
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  }
}

function safeReaddir(p: string): string[] { try { return readdirSync(p); } catch { return []; } }
function isDir(p: string): boolean { try { return statSync(p).isDirectory(); } catch { return false; } }

function findCursorStore(chatId: string): string | null {
  const root = join(homedir(), '.cursor', 'chats');
  if (!existsSync(root) || !chatId) return null;
  for (const ws of safeReaddir(root)) {
    const p = join(root, ws, chatId, 'store.db');
    if (existsSync(p)) return p;
  }
  return null;
}

interface AcpNewSessionResponse {
  sessionId: string;
  models?: { availableModels?: Array<{ modelId: string; name?: string }>; currentModelId?: string };
  modes?: { availableModes?: Array<{ id: string; name: string; description?: string }>; currentModeId?: string };
}

type SqlJs = { Database: new (data: Uint8Array) => { exec: (sql: string) => Array<{ values: unknown[][] }>; close: () => void } };

async function loadSql(): Promise<SqlJs> {
  const initSqlJs = (await import('sql.js')).default;
  // sql.js main resolves to dist/sql-wasm.js; wasm files live next to it
  const mainPath = require.resolve('sql.js');
  const SQL = await initSqlJs({ locateFile: (f: string) => join(dirname(mainPath), f) });
  return SQL as unknown as SqlJs;
}

function readCursorStoreMeta(SQL: SqlJs, dbPath: string): { name?: string; lastUsedModel?: string } | null {
  try {
    const db = new SQL.Database(new Uint8Array(readFileSync(dbPath)));
    const res = db.exec("SELECT value FROM meta WHERE key='0' LIMIT 1");
    db.close();
    const hex = res[0]?.values[0]?.[0] as string | undefined;
    if (!hex) return null;
    const json = JSON.parse(Buffer.from(hex, 'hex').toString('utf8'));
    return { name: json.name, lastUsedModel: json.lastUsedModel };
  } catch { return null; }
}
