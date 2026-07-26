import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentCapabilities, Attachment, CliStatus, NativeSession, PermissionMode, Session, TimelineEvent } from '@orbix/shared';
import { query, type SDKMessage, type SDKUserMessage, type PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { AdapterCallbacks, AdapterEvent, AgentAdapter } from './types.js';
import { clip } from './types.js';

const pexec = promisify(execFile);

function findClaudeBin(): string {
  return process.env.ORBIX_CLAUDE_PATH || join(homedir(), '.local', 'bin', 'claude');
}

function mapPermissionMode(m: PermissionMode): 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' {
  if (m === 'bypass' || m === 'yolo' || m === 'run-everything') return 'bypassPermissions';
  if (m === 'ask') return 'plan';
  return m;
}

function toolKind(name: string): 'shell' | 'read' | 'edit' | 'write' | 'search' | 'mcp' | 'web' | 'other' {
  const n = name.toLowerCase();
  if (n === 'bash' || n.includes('shell') || n.includes('terminal')) return 'shell';
  if (n === 'read' || n.includes('read')) return 'read';
  if (n === 'edit' || n === 'multiedit' || n.includes('edit')) return 'edit';
  if (n === 'write' || n === 'notebookedit') return 'write';
  if (n === 'glob' || n === 'grep' || n.includes('search')) return 'search';
  if (n.includes('web')) return 'web';
  if (n.startsWith('mcp__') || n.includes('mcp')) return 'mcp';
  return 'other';
}

function toolTitle(name: string, input: Record<string, unknown>): { title: string; command?: string; detail?: string } {
  const cmd = typeof input.command === 'string' ? input.command : undefined;
  const file = (input.file_path || input.path || input.pattern) as string | undefined;
  if (name === 'Bash' && cmd) return { title: `Run ${cmd.split('\n')[0].slice(0, 80)}`, command: cmd };
  if (file) return { title: `${name} ${String(file).split('/').pop()}`, detail: String(file) };
  if (typeof input.description === 'string') return { title: input.description.slice(0, 80) };
  return { title: name };
}

interface ClaudeSession {
  input: AsyncQueue<SDKUserMessage>;
  pending: Map<string, { resolve: (r: PermissionResult) => void; input: Record<string, unknown> }>;
  abort: AbortController;
  toolNames: Map<string, { name: string; input: Record<string, unknown> }>;
  assistantText: string;
  msgOpen: boolean;
}

/** Simple async push-queue: push() items, async-iterate them. */
class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((v: IteratorResult<T>) => void)[] = [];
  private done = false;
  push(item: T) {
    const w = this.waiters.shift();
    if (w) w({ value: item, done: false });
    else this.items.push(item);
  }
  close() {
    this.done = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as T, done: true });
  }
  [Symbol.asyncIterator]() {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const it = this.items.shift();
        if (it !== undefined) return Promise.resolve({ value: it, done: false });
        if (this.done) return Promise.resolve({ value: undefined as T, done: true });
        return new Promise(res => this.waiters.push(res));
      },
    };
  }
}

function userMessage(text: string, attachments?: Attachment[]): SDKUserMessage {
  const content: unknown[] = [];
  if (text) content.push({ type: 'text', text });
  for (const a of attachments || []) {
    if (a.mime.startsWith('image/')) {
      content.push({ type: 'text', text: `[Attached image: ${a.name} — local path: ${a.path}]` });
    } else {
      content.push({ type: 'text', text: `[Attached file: ${a.name} — local path: ${a.path}]` });
    }
  }
  return {
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    session_id: '',
  } as unknown as SDKUserMessage;
}

export class ClaudeAdapter implements AgentAdapter {
  kind = 'claude' as const;
  private sessions = new Map<string, ClaudeSession>();
  private cbs = new Map<string, AdapterCallbacks>();

  async detect(): Promise<CliStatus> {
    const bin = findClaudeBin();
    try {
      const { stdout } = await pexec(bin, ['--version'], { timeout: 15000 });
      return { agent: 'claude', installed: true, version: stdout.trim(), path: bin };
    } catch {
      return { agent: 'claude', installed: false, path: bin };
    }
  }

  private emit(sessionId: string, ev: AdapterEvent) {
    this.cbs.get(sessionId)?.emit(sessionId, ev);
  }

  async start(session: Session, cb: AdapterCallbacks, prompt?: string, attachments?: Attachment[]): Promise<void> {
    if (this.sessions.has(session.id)) return;
    this.cbs.set(session.id, cb);
    const state: ClaudeSession = {
      input: new AsyncQueue<SDKUserMessage>(),
      pending: new Map(),
      abort: new AbortController(),
      toolNames: new Map(),
      assistantText: '',
      msgOpen: false,
    };
    this.sessions.set(session.id, state);

    // claude CLI refuses --dangerously-skip-permissions under root; degrade gracefully
    let permMode = session.permissionMode;
    if (permMode === 'bypass' && typeof process.getuid === 'function' && process.getuid() === 0) {
      permMode = 'acceptEdits';
      this.emit(session.id, { type: 'reasoning', text: 'Note: bypass mode is not supported by Claude Code when running as root; using acceptEdits instead.' });
    }

    const opts: Record<string, unknown> = {
      cwd: session.cwd,
      permissionMode: mapPermissionMode(permMode),
      includePartialMessages: true,
      abortController: state.abort,
      settingSources: ['user', 'project', 'local'],
      executable: 'node' as const,
      pathToClaudeCodeExecutable: findClaudeBin(),
      stderr: () => { },
      canUseTool: async (toolName: string, input: Record<string, unknown>, aux: { toolUseID: string }) => {
        const requestId = `claude-${session.id}-${aux.toolUseID}-${Date.now()}`;
        const { title, command, detail } = toolTitle(toolName, input || {});
        this.emit(session.id, { type: 'permission_request', requestId, tool: toolName, title, command, detail: detail || clip(JSON.stringify(input), 600) });
        return new Promise<PermissionResult>((resolve) => {
          state.pending.set(requestId, { resolve, input: input || {} });
        });
      },
    };
    if (session.model) opts.model = session.model;
    if (session.nativeSessionId) opts.resume = session.nativeSessionId;
    if (permMode === 'bypass') opts.allowDangerouslySkipPermissions = true;

    const q = query({ prompt: state.input, options: opts as never });

    if (prompt) {
      this.emit(session.id, { type: 'user_message', text: prompt, attachments });
      state.input.push(userMessage(prompt, attachments));
    }

    // consume events in background
    void (async () => {
      try {
        for await (const msg of q as AsyncIterable<SDKMessage>) {
          this.handleMessage(session, state, msg);
        }
      } catch (err) {
        const msgText = err instanceof Error ? err.message : String(err);
        if (!msgText.toLowerCase().includes('abort')) {
          this.emit(session.id, { type: 'turn_status', state: 'failed', error: clip(msgText, 500) });
          this.emit(session.id, { type: 'session_status', status: 'error' });
        }
      } finally {
        this.sessions.delete(session.id);
      }
    })();
  }

  private handleMessage(session: Session, state: ClaudeSession, msg: SDKMessage) {
    const id = session.id;
    if (msg.type === 'system' && (msg as { subtype?: string }).subtype === 'init') {
      const sid = (msg as { session_id?: string }).session_id;
      if (sid && sid !== session.nativeSessionId) {
        this.emit(id, { type: 'session_status', status: 'idle' });
        // manager picks native id via special field on turn events; use reasoning channel instead
        this.emit(id, { type: 'reasoning', text: `|native:${sid}` });
      }
      return;
    }
    if (msg.type === 'stream_event') {
      const ev = (msg as { event?: Record<string, unknown> }).event || {};
      if (ev.type === 'content_block_delta') {
        const delta = (ev.delta || {}) as { type?: string; text?: string };
        if (delta.type === 'text_delta' && delta.text) {
          state.assistantText += delta.text;
          this.emit(id, { type: 'agent_message', text: state.assistantText, streaming: true });
          state.msgOpen = true;
        }
      } else if (ev.type === 'content_block_start') {
        const cb = (ev.content_block || {}) as { type?: string };
        if (cb.type === 'text') { state.assistantText = ''; }
      }
      return;
    }
    if (msg.type === 'assistant') {
      const m = (msg as { message?: { content?: Array<Record<string, unknown>> } }).message;
      for (const block of m?.content || []) {
        if (block.type === 'tool_use') {
          const name = String(block.name || 'tool');
          const input = (block.input || {}) as Record<string, unknown>;
          const toolId = String(block.id || `t-${Date.now()}`);
          state.toolNames.set(toolId, { name, input });
          const { title, command, detail } = toolTitle(name, input);
          this.emit(id, { type: 'tool_call', toolId, kind: toolKind(name), title, command, detail, status: 'running' });
        } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
          this.emit(id, { type: 'reasoning', text: clip(block.thinking, 1500)! });
        } else if (block.type === 'text' && typeof block.text === 'string') {
          state.assistantText = block.text;
          this.emit(id, { type: 'agent_message', text: block.text, streaming: false });
          state.msgOpen = false;
        }
      }
      return;
    }
    if (msg.type === 'user') {
      const m = (msg as { message?: { content?: unknown } }).message;
      const blocks = Array.isArray(m?.content) ? (m!.content as Array<Record<string, unknown>>) : [];
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          const toolId = String(block.tool_use_id || '');
          const ref = state.toolNames.get(toolId);
          const content = block.content;
          let text = '';
          if (typeof content === 'string') text = content;
          else if (Array.isArray(content)) text = content.map((c) => (c as { text?: string }).text || '').join('\n');
          const isErr = block.is_error === true;
          const patch = extractPatch(ref?.name, ref?.input);
          this.emit(id, {
            type: 'tool_update', toolId, status: isErr ? 'error' : 'done', output: clip(text, 3000),
            ...(patch || {}),
          });
        }
      }
      return;
    }
    if (msg.type === 'result') {
      const r = msg as { subtype?: string; is_error?: boolean; errors?: string[]; result?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }; total_cost_usd?: number; modelUsage?: Record<string, { contextWindow?: number }> };
      const ok = r.subtype === 'success' && !r.is_error;
      if (state.msgOpen) { this.emit(id, { type: 'agent_message', text: state.assistantText, streaming: false }); state.msgOpen = false; }
      if (r.usage) {
        const total = (r.usage.input_tokens || 0) + (r.usage.cache_read_input_tokens || 0) + (r.usage.output_tokens || 0);
        const win = Object.values(r.modelUsage || {})[0]?.contextWindow || 200_000;
        this.emit(id, { type: 'usage', usage: { totalTokens: total, contextWindow: win, percent: Math.round((total / win) * 100), cost: r.total_cost_usd } });
      }
      this.emit(id, { type: 'turn_status', state: ok ? 'completed' : 'failed', error: ok ? undefined : clip((r.errors || []).join('; ') || r.result || 'error', 400) });
      this.emit(id, { type: 'session_status', status: 'idle' });
      return;
    }
  }

  async send(session: Session, text: string, attachments?: Attachment[], _deliver?: 'queue' | 'steer'): Promise<void> {
    const state = this.sessions.get(session.id);
    if (!state) throw new Error('session not running');
    this.emit(session.id, { type: 'user_message', text, attachments });
    this.emit(session.id, { type: 'turn_status', state: 'started' });
    this.emit(session.id, { type: 'session_status', status: 'running' });
    // claude queues messages pushed during a running turn natively
    state.input.push(userMessage(text, attachments));
  }

  async interrupt(session: Session): Promise<void> {
    // claude-agent-sdk: abort kills the process; turn ends as failed/cancelled.
    const state = this.sessions.get(session.id);
    if (state) {
      this.emit(session.id, { type: 'turn_status', state: 'cancelled' });
      this.emit(session.id, { type: 'session_status', status: 'idle' });
    }
  }

  async respondPermission(session: Session, requestId: string, decision: 'allow' | 'allow_session' | 'deny'): Promise<void> {
    const state = this.sessions.get(session.id);
    const entry = state?.pending.get(requestId);
    if (!entry) return;
    state!.pending.delete(requestId);
    this.emit(session.id, { type: 'permission_resolved', requestId, decision });
    if (decision === 'deny') entry.resolve({ behavior: 'deny', message: 'Denied by user via Orbix' });
    else entry.resolve({ behavior: 'allow', updatedInput: entry.input });
  }

  async dispose(session: Session): Promise<void> {
    const state = this.sessions.get(session.id);
    if (state) {
      state.input.close();
      state.abort.abort();
      this.sessions.delete(session.id);
    }
    this.cbs.delete(session.id);
  }

  async capabilities(session?: Session): Promise<AgentCapabilities> {
    // prefer the model already used by the session/native history, then the configured default
    let current = session?.model;
    try {
      const settings = JSON.parse(readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8')) as { env?: Record<string, string> };
      current = current || settings.env?.ANTHROPIC_MODEL;
    } catch { }
    const presets = ['claude-opus-4-8', 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001'];
    const models = [...new Set([current, ...presets].filter(Boolean) as string[])].map(id => ({ id, name: id }));
    return {
      agent: 'claude', models,
      efforts: ['default', 'high'],
      speeds: ['default', 'fast'],
      modes: [],
      permOptions: [
        { id: 'plan', label: 'Plan', description: 'Read-only; proposes a plan first' },
        { id: 'default', label: 'Default', description: 'Asks before tools run' },
        { id: 'acceptEdits', label: 'Auto-edit', description: 'Edits auto-approved' },
        { id: 'bypass', label: 'Bypass', description: 'Skips all permission checks' },
      ],
      slashCommands: [
        { name: 'compact', description: 'Compact the conversation to free context' },
        { name: 'loop', description: 'Schedule recurring work in a loop', needsArgs: true },
        { name: 'btw', description: 'Ask a side question without interrupting', needsArgs: true },
        { name: 'fast', description: 'Toggle fast mode (on supported models)', needsArgs: true },
        { name: 'goal', description: 'Set a goal (trusted workspaces)', needsArgs: true },
        { name: 'plan', description: 'Switch to plan mode' },
      ],
      supportsQueue: true, supportsSteer: false,
    };
  }

  async execCommand(session: Session, command: string, args?: string): Promise<boolean> {
    const cmd = command.replace(/^\//, '').split(' ')[0];
    // claude builtins are interpreted by the CLI itself when sent as text
    const textCommands = ['compact', 'loop', 'btw', 'fast', 'goal', 'summarize', 'side'];
    if (textCommands.includes(cmd)) {
      await this.send(session, `/${cmd}${args ? ' ' + args : ''}`);
      return true;
    }
    return false;
  }

  async applyConfig(): Promise<void> { /* options are re-read per query start */ }

  async readHistory(session: Session, limit = 300): Promise<AdapterEvent[]> {
    const path = findClaudeJsonl(session.nativeSessionId || '');
    if (!path) return [];
    const out: AdapterEvent[] = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim() || out.length >= limit) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'user' && obj.message?.role === 'user' && !obj.isMeta) {
          const c = obj.message.content;
          const blocks = Array.isArray(c) ? c : [];
          const text = typeof c === 'string' ? c : blocks.map((b: { text?: string }) => b.text || '').join(' ').trim();
          // skip tool_result-only user messages
          if (text && !text.startsWith('<')) out.push({ type: 'user_message', text: clip(text, 3000)! });
        } else if (obj.type === 'assistant') {
          for (const b of obj.message?.content || []) {
            if (b.type === 'text' && b.text) out.push({ type: 'agent_message', text: clip(b.text, 8000)!, streaming: false });
            else if (b.type === 'thinking' && b.thinking) out.push({ type: 'reasoning', text: clip(b.thinking, 800)! });
            else if (b.type === 'tool_use') {
              const { title, command } = toolTitle(String(b.name), (b.input || {}) as Record<string, unknown>);
              out.push({ type: 'tool_call', toolId: String(b.id || out.length), kind: toolKind(String(b.name)), title, command, status: 'done' });
            }
          }
        }
      } catch { }
    }
    return out;
  }

  async listNative(): Promise<NativeSession[]> {
    const root = join(homedir(), '.claude', 'projects');
    const out: NativeSession[] = [];
    if (!existsSync(root)) return out;
    for (const proj of readdirSync(root)) {
      const dir = join(root, proj);
      let st;
      try { st = statSync(dir); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.jsonl')) continue;
        try {
          const p = join(dir, f);
          const info = parseClaudeJsonlHead(p);
          if (!info) continue;
          out.push({
            agent: 'claude',
            nativeId: f.replace('.jsonl', ''),
            title: info.title || 'Untitled session',
            cwd: info.cwd || '/' + proj.replace(/^-/, '').replace(/-/g, '/'),
            updatedAt: statSync(p).mtimeMs,
          });
        } catch { }
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  }
}

function extractPatch(name: string | undefined, input: Record<string, unknown> | undefined): { diffPath?: string; diffAdded?: number; diffRemoved?: number; patch?: string } | null {
  if (!name || !input) return null;
  const fp = input.file_path as string | undefined;
  if ((name === 'Edit' || name === 'MultiEdit' || name === 'Write') && fp) {
    const oldS = String(input.old_string || '');
    const newS = String(input.new_string || input.content || '');
    const added = newS ? newS.split('\n').length : 0;
    const removed = oldS ? oldS.split('\n').length : 0;
    const patch = (oldS ? oldS.split('\n').map(l => '- ' + l).join('\n') + '\n' : '') + newS.split('\n').map(l => '+ ' + l).join('\n');
    return { diffPath: fp, diffAdded: added, diffRemoved: removed, patch: clip(patch, 2000) };
  }
  return null;
}

function findClaudeJsonl(sessionId: string): string | null {
  const root = join(homedir(), '.claude', 'projects');
  if (!existsSync(root) || !sessionId) return null;
  for (const proj of readdirSync(root)) {
    const p = join(root, proj, `${sessionId}.jsonl`);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Read the head of a claude session jsonl: find cwd + first real user text */
function parseClaudeJsonlHead(path: string): { title?: string; cwd?: string } | null {
  const fd = readFileSync(path, 'utf8');
  let cwd: string | undefined;
  let title: string | undefined;
  for (const line of fd.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (!cwd && obj.cwd) cwd = obj.cwd;
      if (!title && obj.type === 'user' && obj.message?.role === 'user') {
        const c = obj.message.content;
        const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b: { text?: string }) => b.text || '').join(' ') : '';
        const clean = text.replace(/<[^>]+>/g, '').trim();
        if (clean && !clean.startsWith('Caveat:') && !obj.isMeta) title = clean.slice(0, 80);
      }
      if (cwd && title) break;
    } catch { }
  }
  if (!cwd && !title) return null;
  return { title, cwd };
}
