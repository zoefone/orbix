import { ChildProcess, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentCapabilities, Attachment, CliStatus, NativeSession, PermissionMode, Session, TimelineEvent } from '@orbix/shared';
import { JsonRpc } from '../jsonrpc.js';
import type { AdapterCallbacks, AdapterEvent, AgentAdapter } from './types.js';
import { clip } from './types.js';

const pexec = promisify(execFile);

function findCodexBin(): string {
  return process.env.ORBIX_CODEX_PATH || join(homedir(), '.local', 'bin', 'codex');
}

interface CodexSession {
  proc: ChildProcess;
  rpc: JsonRpc;
  threadId?: string;
  agentText: string;
  items: Map<string, string>; // itemId -> type
  turnActive: boolean;
  activeTurnId?: string;
}

/** codex sandbox preset, customisable per session via /sandbox */
function codexPermissionConfig(mode: PermissionMode, sandboxOverride?: string): { approvalPolicy: string; sandbox: string } {
  const fullAccess = mode === 'bypass' || mode === 'yolo' || mode === 'run-everything';
  const sandbox = sandboxOverride || (fullAccess ? 'danger-full-access' : mode === 'plan' || mode === 'ask' ? 'read-only' : 'workspace-write');
  if (fullAccess) return { approvalPolicy: 'never', sandbox };
  switch (mode) {
    case 'plan': case 'ask': return { approvalPolicy: 'untrusted', sandbox };
    default: return { approvalPolicy: 'on-request', sandbox };
  }
}

const sandboxPolicyOf = (sandbox: string) =>
  sandbox === 'read-only' ? { type: 'readOnly' } : sandbox === 'workspace-write' ? { type: 'workspaceWrite' } : { type: 'dangerFullAccess' };

function codexPermOptions() {
  return [
    { id: 'plan', label: 'Read-only', description: 'Agent only reads; nothing runs without you' },
    { id: 'default', label: 'Default', description: 'Ask before commands and edits' },
    { id: 'yolo', label: 'YOLO', description: 'Full access, never asks' },
  ];
}

function codexSlashCommands() {
  return [
    { name: 'goal', description: 'Set a long-running goal for this thread', needsArgs: true },
    { name: 'compact', description: 'Compact the conversation to free context' },
    { name: 'summarize', description: 'Summarize the conversation' },
    { name: 'sandbox', description: 'Change sandbox: read-only / workspace-write / danger-full-access', needsArgs: true },
    { name: 'fast', description: 'Toggle fast service tier' },
    { name: 'plan', description: 'Switch to read-only planning' },
  ];
}

function findCodexRollout(threadId: string): string | null {
  const root = join(homedir(), '.codex', 'sessions');
  if (!existsSync(root) || !threadId) return null;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      const p = join(dir, e);
      try {
        const st = statSync(p);
        if (st.isDirectory()) stack.push(p);
        else if (e.includes(threadId) && e.endsWith('.jsonl')) return p;
      } catch { }
    }
  }
  return null;
}

export class CodexAdapter implements AgentAdapter {
  kind = 'codex' as const;
  private sessions = new Map<string, CodexSession>();
  private cbs = new Map<string, AdapterCallbacks>();

  async detect(): Promise<CliStatus> {
    const bin = findCodexBin();
    try {
      const { stdout } = await pexec(bin, ['--version'], { timeout: 15000 });
      return { agent: 'codex', installed: true, version: stdout.trim(), path: bin };
    } catch {
      return { agent: 'codex', installed: false, path: bin };
    }
  }

  private emit(sessionId: string, ev: AdapterEvent) {
    this.cbs.get(sessionId)?.emit(sessionId, ev);
  }

  async start(session: Session, cb: AdapterCallbacks, prompt?: string, attachments?: Attachment[]): Promise<void> {
    if (this.sessions.has(session.id)) return;
    this.cbs.set(session.id, cb);
    const bin = findCodexBin();
    const proc = spawn(bin, ['app-server'], { cwd: session.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const state: CodexSession = { proc, rpc: new JsonRpc(proc), agentText: '', items: new Map(), turnActive: false };
    this.sessions.set(session.id, state);

    let stderrBuf = '';
    proc.stderr?.on('data', (d) => { stderrBuf = (stderrBuf + d.toString()).slice(-2000); });
    proc.on('exit', (code) => {
      this.emit(session.id, { type: 'session_status', status: 'error' });
      if (code !== 0 && code !== null) this.emit(session.id, { type: 'turn_status', state: 'failed', error: clip(stderrBuf, 400) || `codex app-server exited ${code}` });
      this.sessions.delete(session.id);
    });

    state.rpc.onMessage((msg) => this.handleFrame(session, state, msg));

    await state.rpc.request('initialize', { clientInfo: { name: 'orbix', title: 'Orbix', version: '0.1.0' }, capabilities: {} });
    const perm = codexPermissionConfig(session.permissionMode);
    const params: Record<string, unknown> = { cwd: session.cwd, approvalPolicy: perm.approvalPolicy, sandbox: perm.sandbox };
    if (session.model) params.model = session.model;

    if (session.nativeSessionId) {
      try {
        const res = await state.rpc.request<{ thread?: { id?: string } }>('thread/resume', { threadId: session.nativeSessionId, ...params });
        state.threadId = res?.thread?.id || session.nativeSessionId;
      } catch {
        state.threadId = session.nativeSessionId;
      }
    } else {
      const res = await state.rpc.request<{ thread: { id: string } }>('thread/start', params);
      state.threadId = res.thread.id;
      this.emit(session.id, { type: 'reasoning', text: `|native:${state.threadId}` });
    }

    if (prompt) await this.send(session, prompt, attachments);
  }

  private handleFrame(session: Session, state: CodexSession, msg: Record<string, unknown>) {
    const id = session.id;
    const method = msg.method as string | undefined;
    if (!method) return;

    // server-initiated approval requests
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval' || method === 'item/permissions/requestApproval') {
      const p = (msg.params || {}) as { command?: string; reason?: string; itemId?: string };
      const requestId = `codex-${id}-${String(msg.id)}`;
      this.pendingApprovals.set(requestId, { rpc: state.rpc, msgId: msg.id as number });
      const isCmd = method.includes('commandExecution');
      this.emit(id, {
        type: 'permission_request', requestId,
        tool: isCmd ? 'shell' : 'edit',
        title: isCmd ? `Run ${clip(p.command || '', 70)}` : 'Apply file changes',
        command: p.command || undefined,
        detail: p.reason || undefined,
      });
      this.emit(id, { type: 'session_status', status: 'awaiting_approval' });
      return;
    }

    const params = (msg.params || {}) as Record<string, unknown>;
    switch (method) {
      case 'turn/started': {
        state.turnActive = true;
        const turn = (params.turn || params) as { id?: string };
        state.activeTurnId = turn.id || state.activeTurnId;
        this.emit(id, { type: 'turn_status', state: 'started' });
        this.emit(id, { type: 'session_status', status: 'running' });
        break;
      }
      case 'thread/tokenUsage/updated': {
        const tu = (params.tokenUsage || params) as { total?: { totalTokens?: number }; modelContextWindow?: number | null };
        const total = tu.total?.totalTokens ?? 0;
        const win = tu.modelContextWindow ?? undefined;
        this.emit(id, { type: 'usage', usage: { totalTokens: total, contextWindow: win, percent: win ? Math.round((total / win) * 100) : undefined } });
        break;
      }
      case 'turn/plan/updated': {
        const entries = ((params.plan || params.entries || []) as Array<{ step?: string; content?: string; status?: string }>).map(e => ({
          content: e.step || e.content || '', status: e.status,
        })).filter(e => e.content);
        if (entries.length) this.emit(id, { type: 'plan', entries });
        break;
      }
      case 'turn/completed': {
        state.turnActive = false;
        const status = (params as { status?: string }).status;
        const err = (params as { error?: { message?: string } }).error?.message;
        this.emit(id, { type: 'turn_status', state: status === 'failed' ? 'failed' : 'completed', error: err ? clip(err, 400) : undefined });
        this.emit(id, { type: 'session_status', status: 'idle' });
        break;
      }
      case 'item/agentMessage/delta':
        state.agentText += String((params as { delta?: string }).delta || '');
        this.emit(id, { type: 'agent_message', text: state.agentText, streaming: true });
        break;
      case 'item/reasoning/textDelta':
      case 'item/reasoning/summaryTextDelta':
        this.emit(id, { type: 'reasoning', text: clip(String((params as { delta?: string }).delta || ''), 300)! });
        break;
      case 'item/started': {
        const item = (params.item || {}) as { id?: string; type?: string; command?: string; changes?: unknown[]; server?: string; tool?: string; query?: string };
        if (!item.id) break;
        state.items.set(item.id, item.type || 'other');
        if (item.type === 'commandExecution') {
          this.emit(id, { type: 'tool_call', toolId: item.id, kind: 'shell', title: `Run ${clip(item.command || '', 70)}`, command: item.command, status: 'running' });
        } else if (item.type === 'fileChange') {
          this.emit(id, { type: 'tool_call', toolId: item.id, kind: 'edit', title: 'Apply file changes', status: 'running' });
        } else if (item.type === 'mcpToolCall') {
          this.emit(id, { type: 'tool_call', toolId: item.id, kind: 'mcp', title: `${item.server || 'mcp'}: ${item.tool || ''}`, status: 'running' });
        } else if (item.type === 'webSearch') {
          this.emit(id, { type: 'tool_call', toolId: item.id, kind: 'web', title: `Search ${item.query || ''}`, status: 'running' });
        } else if (item.type === 'agentMessage') {
          state.agentText = '';
        }
        break;
      }
      case 'item/completed': {
        const item = (params.item || {}) as { id?: string; type?: string; text?: string; output?: string; changes?: Array<{ path?: string; diff?: string }>; result?: unknown; status?: string };
        if (!item.id) break;
        if (item.type === 'agentMessage') {
          this.emit(id, { type: 'agent_message', text: item.text ?? state.agentText, streaming: false });
          state.agentText = '';
          break;
        }
        const kind = state.items.get(item.id);
        let patch: string | undefined, diffPath: string | undefined, added = 0, removed = 0;
        if (Array.isArray(item.changes)) {
          patch = item.changes.map(c => c.diff || '').filter(Boolean).join('\n');
          diffPath = item.changes[0]?.path;
          for (const c of item.changes) {
            for (const l of (c.diff || '').split('\n')) {
              if (l.startsWith('+') && !l.startsWith('+++')) added++;
              if (l.startsWith('-') && !l.startsWith('---')) removed++;
            }
          }
        }
        this.emit(id, {
          type: 'tool_update', toolId: item.id,
          status: item.status === 'failed' ? 'error' : 'done',
          output: clip(item.output || (typeof item.result === 'string' ? item.result : ''), 3000),
          diffPath, diffAdded: added || undefined, diffRemoved: removed || undefined, patch: clip(patch, 2000),
        });
        void kind;
        break;
      }
      case 'item/commandExecution/outputDelta':
      case 'item/fileChange/outputDelta': {
        const itemId = String((params as { itemId?: string }).itemId || '');
        const delta = String((params as { delta?: string }).delta || '');
        if (itemId && delta) this.emit(id, { type: 'tool_update', toolId: itemId, output: clip(delta, 2000) });
        break;
      }
    }
  }

  private pendingApprovals = new Map<string, { rpc: JsonRpc; msgId: number }>();

  async send(session: Session, text: string, attachments?: Attachment[], deliver?: 'queue' | 'steer'): Promise<void> {
    const state = this.sessions.get(session.id);
    if (!state?.threadId) throw new Error('session not running');
    this.emit(session.id, { type: 'user_message', text, attachments });
    const input: unknown[] = [{ type: 'text', text, text_elements: [] }];
    for (const a of attachments || []) {
      if (a.mime.startsWith('image/')) input.push({ type: 'localImage', path: a.path });
      else input.push({ type: 'text', text: `[Attached file: ${a.name} — local path: ${a.path}]`, text_elements: [] });
    }
    const sandboxOverride = this.sandboxOverrides.get(session.id);
    const perm = codexPermissionConfig(session.permissionMode, sandboxOverride);

    // inject into the active turn instead of waiting for it to finish
    if (deliver === 'steer' && state.turnActive && state.activeTurnId) {
      try {
        await state.rpc.request('turn/steer', { threadId: state.threadId, input, expectedTurnId: state.activeTurnId });
        return;
      } catch { /* fall through to normal turn */ }
    }
    await state.rpc.request('turn/start', {
      threadId: state.threadId,
      input,
      approvalPolicy: perm.approvalPolicy,
      sandboxPolicy: sandboxPolicyOf(perm.sandbox),
      ...(session.model ? { model: session.model } : {}),
      ...(session.effort ? { effort: session.effort } : {}),
      ...(session.speed ? { serviceTier: session.speed } : {}),
    });
  }

  async interrupt(session: Session): Promise<void> {
    const state = this.sessions.get(session.id);
    if (state?.threadId) {
      try { await state.rpc.request('turn/interrupt', { threadId: state.threadId }); } catch { }
      this.emit(session.id, { type: 'turn_status', state: 'cancelled' });
      this.emit(session.id, { type: 'session_status', status: 'idle' });
    }
  }

  async respondPermission(session: Session, requestId: string, decision: 'allow' | 'allow_session' | 'deny'): Promise<void> {
    const pa = this.pendingApprovals.get(requestId);
    if (!pa) return;
    this.pendingApprovals.delete(requestId);
    const d = decision === 'allow' ? 'accept' : decision === 'allow_session' ? 'acceptForSession' : 'decline';
    pa.rpc.respond(pa.msgId, { decision: d });
    this.emit(session.id, { type: 'permission_resolved', requestId, decision });
    this.emit(session.id, { type: 'session_status', status: 'running' });
  }

  async dispose(session: Session): Promise<void> {
    const state = this.sessions.get(session.id);
    if (state) {
      try { state.proc.kill('SIGTERM'); } catch { }
      this.sessions.delete(session.id);
    }
    this.cbs.delete(session.id);
  }

  // ---- sandbox override per session (/sandbox) ----
  private sandboxOverrides = new Map<string, string>();
  private capsCache: { at: number; caps: AgentCapabilities } | null = null;

  async capabilities(): Promise<AgentCapabilities> {
    if (this.capsCache && Date.now() - this.capsCache.at < 5 * 60_000) return this.capsCache.caps;
    const fallback: AgentCapabilities = {
      agent: 'codex', models: [], efforts: [], speeds: [], modes: [],
      permOptions: codexPermOptions(),
      slashCommands: codexSlashCommands(), supportsQueue: true, supportsSteer: true,
    };
    try {
      const proc = spawn(findCodexBin(), ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
      const rpc = new JsonRpc(proc);
      try {
        await rpc.request('initialize', { clientInfo: { name: 'orbix', title: 'Orbix', version: '0.1.0' }, capabilities: {} }, 15_000);
        const res = await rpc.request<{ data: Array<{ model: string; displayName: string; isDefault?: boolean; hidden?: boolean; supportedReasoningEfforts?: Array<{ reasoningEffort: string }>; serviceTiers?: Array<{ id?: string } | string> }> }>('model/list', {}, 20_000);
        fallback.models = res.data.filter(m => !m.hidden).map(m => ({
          id: m.model, name: m.displayName || m.model, isDefault: m.isDefault,
          efforts: (m.supportedReasoningEfforts || []).map(e => e.reasoningEffort),
          tiers: (m.serviceTiers || []).map(t => typeof t === 'string' ? t : t.id || ''),
        }));
        const def = res.data.find(m => m.isDefault) || res.data[0];
        if (def) {
          fallback.efforts = (def.supportedReasoningEfforts || []).map(e => e.reasoningEffort);
          fallback.speeds = (def.serviceTiers || []).map(t => typeof t === 'string' ? t : t.id || '');
        }
        this.capsCache = { at: Date.now(), caps: fallback };
      } finally { proc.kill('SIGTERM'); }
    } catch { }
    return fallback;
  }

  async execCommand(session: Session, command: string, args?: string): Promise<boolean> {
    const state = this.sessions.get(session.id);
    const cmd = command.replace(/^\//, '').split(' ')[0];
    switch (cmd) {
      case 'goal': {
        if (!state?.threadId) return false;
        await state.rpc.request('thread/goal/set', { threadId: state.threadId, goal: args || '' }).catch(() => { });
        return true;
      }
      case 'compact':
      case 'summarize': {
        if (!state?.threadId) return false;
        await state.rpc.request('thread/compact/start', { threadId: state.threadId }).catch(() => { });
        return true;
      }
      case 'sandbox': {
        const v = (args || '').trim();
        const map: Record<string, string> = { 'read-only': 'read-only', readonly: 'read-only', 'workspace-write': 'workspace-write', workspace: 'workspace-write', 'danger-full-access': 'danger-full-access', full: 'danger-full-access', yolo: 'danger-full-access' };
        if (map[v]) { this.sandboxOverrides.set(session.id, map[v]); return true; }
        return false;
      }
      default:
        return false;
    }
  }

  async applyConfig(): Promise<void> { /* model/effort/speed/sandbox are applied per turn/start */ }

  async readHistory(session: Session, limit = 300): Promise<AdapterEvent[]> {
    const file = findCodexRollout(session.nativeSessionId || '');
    if (!file) return [];
    const out: AdapterEvent[] = [];
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim() || out.length >= limit) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'response_item') continue;
        const p = obj.payload || {};
        if (p.type === 'message' && p.role === 'user') {
          const text = (p.content || []).map((c: { text?: string }) => c.text || '').join(' ').trim();
          if (text && !text.startsWith('<')) out.push({ type: 'user_message', text: clip(text, 3000)! });
        } else if (p.type === 'message' && p.role === 'assistant') {
          const text = (p.content || []).map((c: { text?: string }) => c.text || '').join('').trim();
          if (text) out.push({ type: 'agent_message', text: clip(text, 8000)!, streaming: false });
        } else if (p.type === 'reasoning') {
          const text = (p.summary || []).map((s: { text?: string }) => s.text || '').join('\n') || p.content || '';
          if (text) out.push({ type: 'reasoning', text: clip(String(text), 800)! });
        } else if (p.type === 'local_shell_call' || p.type === 'function_call') {
          const cmd = p.action?.command ? (Array.isArray(p.action.command) ? p.action.command.join(' ') : String(p.action.command)) : p.name || 'shell';
          out.push({ type: 'tool_call', toolId: p.call_id || p.id || String(out.length), kind: 'shell', title: `Run ${clip(String(cmd), 60)}`, command: String(cmd), status: 'done' });
        }
      } catch { }
    }
    return out;
  }

  async listNative(): Promise<NativeSession[]> {
    const root = join(homedir(), '.codex', 'sessions');
    const out: NativeSession[] = [];
    if (!existsSync(root)) return out;
    const walk = (dir: string, depth: number) => {
      if (depth > 4) return;
      let entries: string[];
      try { entries = readdirSync(dir); } catch { return; }
      for (const e of entries) {
        const p = join(dir, e);
        try {
          const st = statSync(p);
          if (st.isDirectory()) walk(p, depth + 1);
          else if (e.startsWith('rollout-') && e.endsWith('.jsonl')) {
            const meta = parseCodexRollout(p);
            if (meta) out.push({ agent: 'codex', nativeId: meta.id, title: meta.title || 'Untitled session', cwd: meta.cwd || '/root', updatedAt: st.mtimeMs });
          }
        } catch { }
      }
    };
    walk(root, 0);
    return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  }
}

function parseCodexRollout(path: string): { id: string; title?: string; cwd?: string } | null {
  try {
    const lines = readFileSync(path, 'utf8').split('\n');
    let id = '', cwd: string | undefined, title: string | undefined;
    for (const line of lines) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (obj.type === 'session_meta') {
        id = obj.payload?.id || obj.payload?.session_id || '';
        cwd = obj.payload?.cwd;
      } else if (!title && obj.type === 'response_item' && obj.payload?.type === 'message' && obj.payload?.role === 'user') {
        const content = obj.payload.content || [];
        const text = content.map((c: { text?: string }) => c.text || '').join(' ').trim();
        // skip injected context blocks (environment_context, user_instructions, AGENTS…)
        if (!text.startsWith('<') && text) title = text.slice(0, 80);
      }
      if (id && title) break;
    }
    return id ? { id, title, cwd } : null;
  } catch { return null; }
}
