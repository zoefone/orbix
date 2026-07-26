import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Attachment, Session, TimelineEvent } from '@orbix/shared';
import { useOrbix } from '../store';
import { AgentMark, fmtSize, IconBtn, PillBtn, SessionStatusText, timeAgo } from '../components/ui';
import OptionMenu from '../components/OptionMenu';
import { useT } from '../i18n';
import type { Nav } from '../App';

/** merge tool_call + tool_update events by toolId for rendering */
interface RenderItem {
  key: string;
  ts: number;
  seq: number;
  kind: 'user' | 'agent' | 'reasoning' | 'tool' | 'permission' | 'turn';
  ev: TimelineEvent;
  tool?: {
    toolId: string; kind: string; title: string; detail?: string; command?: string;
    status: 'running' | 'done' | 'error'; output?: string;
    diffPath?: string; diffAdded?: number; diffRemoved?: number; patch?: string;
  };
  permission?: { requestId: string; tool: string; title: string; detail?: string; command?: string; resolved?: string };
}

function buildItems(events: TimelineEvent[]): RenderItem[] {
  const items: RenderItem[] = [];
  const toolMap = new Map<string, RenderItem>();
  const permMap = new Map<string, RenderItem>();
  for (const ev of events) {
    if (ev.type === 'tool_update') {
      const existing = toolMap.get(ev.toolId);
      if (existing?.tool) {
        Object.assign(existing.tool, {
          status: ev.status ?? existing.tool.status,
          output: ev.output ?? existing.tool.output,
          diffPath: ev.diffPath ?? existing.tool.diffPath,
          diffAdded: ev.diffAdded ?? existing.tool.diffAdded,
          diffRemoved: ev.diffRemoved ?? existing.tool.diffRemoved,
          patch: ev.patch ?? existing.tool.patch,
        });
        existing.seq = ev.seq;
      }
      continue;
    }
    if (ev.type === 'permission_resolved') {
      const p = permMap.get(ev.requestId);
      if (p?.permission) p.permission.resolved = ev.decision;
      continue;
    }
    if (ev.type === 'session_status' || ev.type === 'usage' || ev.type === 'plan') continue;
    const item: RenderItem = {
      key: ev.id, ts: ev.ts, seq: ev.seq,
      kind: ev.type === 'user_message' ? 'user' : ev.type === 'agent_message' ? 'agent' : ev.type === 'reasoning' ? 'reasoning' : ev.type === 'tool_call' ? 'tool' : ev.type === 'permission_request' ? 'permission' : 'turn',
      ev,
    };
    if (ev.type === 'tool_call') {
      item.tool = { toolId: ev.toolId, kind: ev.kind, title: ev.title, detail: ev.detail, command: ev.command, status: ev.status, output: ev.output, diffPath: ev.diffPath, diffAdded: ev.diffAdded, diffRemoved: ev.diffRemoved, patch: ev.patch };
      toolMap.set(ev.toolId, item);
    }
    if (ev.type === 'permission_request') {
      item.permission = { requestId: ev.requestId, tool: ev.tool, title: ev.title, detail: ev.detail, command: ev.command };
      permMap.set(ev.requestId, item);
    }
    items.push(item);
  }
  return items.sort((a, b) => a.seq - b.seq);
}

const SLASH_ALL = ['goal', 'loop', 'plan', 'compact', 'side', 'btw', 'fast', 'sandbox', 'summarize'];

export default function ChatScreen({ nav, sessionId }: { nav: Nav; sessionId: string }) {
  const { sessions, timelines, loadTimeline, sendMessage, client, capabilities, refreshCapabilities, sendKey } = useOrbix();
  const session = sessions.find(s => s.id === sessionId);
  const events = timelines[sessionId] || [];
  const items = useMemo(() => buildItems(events), [events]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashArgs, setSlashArgs] = useState<Record<string, string>>({});
  const [deliver, setDeliver] = useState<'queue' | 'steer'>('queue');
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const t = useT();

  useEffect(() => { void loadTimeline(sessionId); }, [sessionId]);
  useEffect(() => { if (session) void refreshCapabilities(session.agent); }, [session?.agent]);

  useEffect(() => {
    if (stickBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items.length, items[items.length - 1]?.seq]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function pickFiles(files: FileList | null) {
    if (!files?.length || !client) return;
    setUploading(true);
    try {
      const up = await client.upload([...files]);
      setAttachments(a => [...a, ...up]);
    } finally { setUploading(false); }
  }

  async function send(deliverMode?: 'queue' | 'steer') {
    if (!text.trim() && !attachments.length) return;
    const msg = text.trim();
    const att = attachments;
    setText(''); setAttachments([]); setSlashOpen(false);
    stickBottom.current = true;
    await sendMessage(sessionId, msg || '(attachment)', att);
    void deliverMode;
  }

  async function sendWithDeliver() {
    if (!text.trim() && !attachments.length) return;
    const msg = text.trim();
    const att = attachments;
    setText(''); setAttachments([]); setSlashOpen(false);
    stickBottom.current = true;
    if (!client) return;
    await client.call({ cmd: 'message.send', sessionId, text: msg || '(attachment)', attachments: att, deliver: busy ? deliver : 'queue' });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const isEnter = e.key === 'Enter' && !e.nativeEvent.isComposing;
    if (!isEnter) return;
    const combo = e.shiftKey ? 'shift-enter' : (e.ctrlKey || e.metaKey) ? 'ctrl-enter' : 'enter';
    if (combo === sendKey) {
      e.preventDefault();
      void sendWithDeliver();
    } else if (sendKey !== 'enter' && combo === 'enter') {
      // plain enter = newline when sendKey is a combo
      return;
    }
  }

  async function execSlash(cmdName: string) {
    const args = slashArgs[cmdName]?.trim();
    setSlashOpen(false); setText('');
    await client?.call({ cmd: 'command.exec', sessionId, command: cmdName, args });
  }

  const busy = session?.status === 'running' || session?.status === 'awaiting_approval';
  const caps = session ? capabilities[session.agent] : undefined;
  const slashList = useMemo(() => {
    const supported = new Set((caps?.slashCommands || []).map(s => s.name));
    const q = text.startsWith('/') ? text.slice(1).toLowerCase() : '';
    return SLASH_ALL
      .filter(n => supported.size === 0 || supported.has(n))
      .filter(n => !q || n.startsWith(q))
      .map(n => ({ ...(caps?.slashCommands.find(s => s.name === n) || { name: n, description: '' }), name: n }));
  }, [caps, text]);

  const usage = session?.usage;
  const usageLabel = usage
    ? `${usage.percent !== undefined ? usage.percent + '% · ' : ''}${fmtTok(usage.totalTokens)}${usage.contextWindow ? '/' + fmtTok(usage.contextWindow) : ''}${usage.cost ? ` · $${usage.cost.toFixed(4)}` : ''}`
    : null;

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full relative">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/60 flex-none">
        <div className="flex items-center gap-3 min-w-0">
          <IconBtn plain onClick={() => nav.back()}>‹</IconBtn>
          {session && <AgentMark agent={session.agent} size={26} />}
          <div className="min-w-0">
            <div className="font-semibold text-[17px] truncate">{session?.title || 'Session'}</div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate">{session?.project}{session?.model ? ` · ${session.model}` : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session && <SessionStatusText status={session.status} />}
          <IconBtn plain onClick={() => setMenuOpen(m => !m)}>···</IconBtn>
        </div>
      </div>

      {menuOpen && session && <SessionMenu session={session} close={() => setMenuOpen(false)} nav={nav} />}

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4">
        {session?.plan && session.plan.length > 0 && <PlanCard entries={session.plan} />}
        {items.length === 0 && (
          <div className="text-center text-zinc-400 dark:text-zinc-500 py-16 text-sm">
            {session?.origin === 'imported' ? t('importedHint') : t('noMessages')}
          </div>
        )}
        {items.map(item => {
          switch (item.kind) {
            case 'user': return <UserBubble key={item.key} ev={item.ev as Extract<TimelineEvent, { type: 'user_message' }>} />;
            case 'agent': return <AgentMessage key={item.key} ev={item.ev as Extract<TimelineEvent, { type: 'agent_message' }>} />;
            case 'reasoning': return <Reasoning key={item.key} ev={item.ev as Extract<TimelineEvent, { type: 'reasoning' }>} />;
            case 'tool': return <ToolCard key={item.key} tool={item.tool!} />;
            case 'permission': return <ApprovalCard key={item.key} perm={item.permission!} sessionId={sessionId} />;
            case 'turn': return <TurnMeta key={item.key} ev={item.ev as Extract<TimelineEvent, { type: 'turn_status' }>} />;
          }
        })}
        {session?.status === 'running' && <div className="text-[13.5px] text-zinc-400 dark:text-zinc-500 py-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />{t('working')}</div>}
      </div>

      {attachments.length > 0 && (
        <div className="flex-none px-4 flex flex-wrap gap-2">
          {attachments.map(a => (
            <span key={a.id} className="inline-flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-1.5 pr-2.5 py-1.5 text-sm">
              {a.mime.startsWith('image/') && client
                ? <img src={client.attachmentUrl(a)} alt="" className="w-8 h-8 rounded-lg object-cover" />
                : <span className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">📄</span>}
              <span><span className="block font-medium text-[13px] leading-tight">{a.name}</span><span className="text-[11px] text-zinc-400">{fmtSize(a.size)}</span></span>
              <button onClick={() => setAttachments(x => x.filter(y => y.id !== a.id))} className="text-zinc-400 hover:text-zinc-600 ml-1">✕</button>
            </span>
          ))}
        </div>
      )}

      {/* composer */}
      <div className="flex-none px-4 pb-5 pt-1">
        {/* top pills row: usage / model / effort / speed / perm / mode */}
        {session && (
          <div className="flex items-center gap-1.5 pb-2 overflow-x-auto">
            {usageLabel && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/60 text-[11.5px] font-mono text-zinc-500 dark:text-zinc-400 flex-none" title={t('contextUsage')}>
                ⬒ {usageLabel}
              </span>
            )}
            {caps?.models && caps.models.length > 0 && (
              <OptionMenu
                label={caps.models.find(m => m.id === session.model)?.name || session.model || t('cliDefault')}
                options={caps.models.map(m => ({ id: m.id, label: m.name }))}
                value={session.model}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { model: id } })}
              />
            )}
            {caps?.efforts && caps.efforts.length > 0 && (
              <OptionMenu
                label={`${t('effort').toLowerCase()}: ${session.effort || 'default'}`}
                options={caps.efforts.map(e => ({ id: e, label: e }))}
                value={session.effort}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { effort: id } })}
              />
            )}
            {caps?.speeds && caps.speeds.length > 0 && (
              <OptionMenu
                label={`${t('speed').toLowerCase()}: ${session.speed || 'default'}`}
                options={caps.speeds.map(s => ({ id: s, label: s }))}
                value={session.speed}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { speed: id } })}
              />
            )}
            {caps?.permOptions && caps.permOptions.length > 0 && (
              <OptionMenu
                label={caps.permOptions.find(p => p.id === session.permissionMode)?.label || session.permissionMode}
                options={caps.permOptions.map(p => ({ id: p.id, label: p.label, hint: p.description }))}
                value={session.permissionMode}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { permissionMode: id as Session['permissionMode'] } })}
              />
            )}
            {caps?.modes && caps.modes.length > 0 && (
              <OptionMenu
                label={`mode: ${session.mode || 'agent'}`}
                options={caps.modes.map(m => ({ id: m.id, label: m.name, hint: m.description }))}
                value={session.mode}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { mode: id } })}
              />
            )}
          </div>
        )}

        {/* slash palette */}
        {slashOpen && slashList.length > 0 && (
          <div className="mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg p-1.5 max-h-64 overflow-y-auto fade-up">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400">{t('slashTitle')}</div>
            {slashList.map(c => (
              <div key={c.name} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                <button onClick={() => (caps?.slashCommands.find(s => s.name === c.name)?.needsArgs ? null : execSlash(c.name))}
                  className="flex-1 text-left">
                  <span className="text-sm font-medium">/{c.name}</span>
                  <span className="block text-[11.5px] text-zinc-400 truncate">{c.description}</span>
                </button>
                {caps?.slashCommands.find(s => s.name === c.name)?.needsArgs && (
                  <>
                    <input
                      value={slashArgs[c.name] || ''}
                      onChange={e => setSlashArgs(a => ({ ...a, [c.name]: e.target.value }))}
                      placeholder={t('argsHint')}
                      className="w-32 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2 py-1 text-xs outline-none"
                      onKeyDown={e => { if (e.key === 'Enter') void execSlash(c.name); }}
                    />
                    <button onClick={() => execSlash(c.name)} className="text-xs font-semibold text-accent dark:text-accent-dark px-2">{t('runCmd')}</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); void sendWithDeliver(); }} className="flex items-end gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[26px] p-1.5 pl-2 shadow-sm">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => pickFiles(e.target.files)} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 flex-none hover:bg-zinc-200 dark:hover:bg-zinc-700">
            {uploading ? '…' : '＋'}
          </button>
          <textarea
            value={text}
            onChange={e => {
              setText(e.target.value);
              setSlashOpen(e.target.value.startsWith('/'));
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={t('followUp')}
            className="flex-1 bg-transparent outline-none text-base px-2 py-1.5 resize-none max-h-36 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />
          {busy && caps?.supportsSteer && (
            <OptionMenu
              label={deliver === 'steer' ? '⚡ steer' : '⏳ queue'}
              options={[{ id: 'queue', label: '⏳ queue', hint: t('queueTip') }, { id: 'steer', label: '⚡ steer', hint: t('steerTip') }]}
              value={deliver}
              onChange={id => setDeliver(id as 'queue' | 'steer')}
            />
          )}
          {busy && (
            <button type="button" onClick={() => client?.call({ cmd: 'turn.interrupt', sessionId })} title={t('stopBtn')}
              className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950 text-red-500 flex items-center justify-center flex-none">■</button>
          )}
          {(text.trim() || attachments.length > 0) && (
            <button type="submit" className="w-9 h-9 rounded-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 flex items-center justify-center flex-none">↑</button>
          )}
        </form>
      </div>
    </div>
  );
}

function fmtTok(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function UserBubble({ ev }: { ev: Extract<TimelineEvent, { type: 'user_message' }> }) {
  const { client } = useOrbix();
  return (
    <div className="fade-up">
      <div className="bg-zinc-100 dark:bg-zinc-800 rounded-[20px] px-4 py-3 text-[16px] leading-relaxed my-2.5 ml-8 whitespace-pre-wrap">{ev.text}</div>
      {ev.attachments?.map(a => (
        <div key={a.id} className="ml-8 mb-2">
          {a.mime.startsWith('image/') && client ? (
            <img src={client.attachmentUrl(a)} alt={a.name} className="max-w-xs rounded-2xl border border-zinc-200 dark:border-zinc-800" />
          ) : (
            <span className="inline-flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm">📄 {a.name}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function AgentMessage({ ev }: { ev: Extract<TimelineEvent, { type: 'agent_message' }> }) {
  return (
    <div className="my-2.5 fade-up">
      <div className="md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{ev.text || ''}</ReactMarkdown>
        {ev.streaming && <span className="inline-block w-2 h-4 bg-accent dark:bg-accent-dark rounded-sm align-[-2px] animate-blink" />}
      </div>
    </div>
  );
}

function Reasoning({ ev }: { ev: Extract<TimelineEvent, { type: 'reasoning' }> }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className="my-1.5">
      <button onClick={() => setOpen(o => !o)} className="text-[13px] text-zinc-400 dark:text-zinc-500 italic hover:text-zinc-500">
        {open ? '▾' : '▸'} {t('reasoning')}
      </button>
      {open && <div className="text-[13px] text-zinc-400 dark:text-zinc-500 italic border-l-2 border-zinc-200 dark:border-zinc-800 pl-3 mt-1 whitespace-pre-wrap">{ev.text}</div>}
    </div>
  );
}

const TOOL_ICON: Record<string, string> = { shell: '⌘', read: '📄', edit: '✎', write: '✎', search: '⌕', mcp: '⚡', web: '🌐', other: '⚙' };

function ToolCard({ tool }: { tool: NonNullable<RenderItem['tool']> }) {
  const [open, setOpen] = useState(false);
  const hasBody = !!(tool.command || tool.output || tool.patch);
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl my-2 overflow-hidden fade-up">
      <button onClick={() => hasBody && setOpen(o => !o)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left">
        <span className="w-[26px] h-[26px] rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[13px] text-zinc-500 dark:text-zinc-400 flex-none">{TOOL_ICON[tool.kind] || TOOL_ICON.other}</span>
        <span className="text-sm font-medium truncate flex-1">{tool.title}</span>
        {tool.diffAdded !== undefined && <span className="text-xs font-semibold diff-add flex-none">+{tool.diffAdded}</span>}
        {tool.diffRemoved !== undefined && <span className="text-xs font-semibold diff-del flex-none">-{tool.diffRemoved}</span>}
        <span className={`text-xs flex-none ${tool.status === 'error' ? 'text-red-500' : 'text-zinc-400'}`}>
          {tool.status === 'running' ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" /> : tool.status === 'done' ? '✓' : '✗'}
        </span>
        {hasBody && <span className="text-zinc-300 dark:text-zinc-600 text-xs flex-none">{open ? '▾' : '▸'}</span>}
      </button>
      {open && hasBody && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 font-mono text-xs leading-relaxed overflow-x-auto">
          {tool.command && <div className="text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">$ {tool.command}</div>}
          {tool.patch && (
            <div className="mt-1 whitespace-pre-wrap">
              {tool.patch.split('\n').map((l, i) => (
                <div key={i} className={l.startsWith('+ ') || l.startsWith('+') ? 'diff-add' : l.startsWith('- ') || l.startsWith('-') ? 'diff-del' : 'text-zinc-400'}>{l}</div>
              ))}
            </div>
          )}
          {tool.output && <div className="text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap mt-1 max-h-64 overflow-y-auto">{tool.output}</div>}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ perm, sessionId }: { perm: NonNullable<RenderItem['permission']>; sessionId: string }) {
  const { client } = useOrbix();
  const t = useT();
  const resolved = perm.resolved;
  return (
    <div className={`border rounded-2xl p-3.5 my-2.5 fade-up ${resolved ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 opacity-70' : 'border-amber-300 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20'}`}>
      <div className="text-[14.5px] font-semibold flex items-center gap-2">
        ⚠ {resolved ? (resolved === 'deny' ? t('approvalDenied') : t('approvalGranted')) : t('approvalNeeded')}
      </div>
      <div className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">{perm.title}</div>
      {perm.command && <div className="bg-zinc-100 dark:bg-zinc-950 rounded-xl px-3 py-2 font-mono text-[12.5px] mt-2 overflow-x-auto whitespace-pre-wrap">$ {perm.command}</div>}
      {!resolved && (
        <div className="flex gap-2 mt-3">
          <PillBtn primary onClick={() => client?.call({ cmd: 'permission.respond', sessionId, requestId: perm.requestId, decision: 'allow' })}>{t('approve')}</PillBtn>
          <PillBtn onClick={() => client?.call({ cmd: 'permission.respond', sessionId, requestId: perm.requestId, decision: 'allow_session' })}>{t('always')}</PillBtn>
          <PillBtn danger onClick={() => client?.call({ cmd: 'permission.respond', sessionId, requestId: perm.requestId, decision: 'deny' })}>{t('deny')}</PillBtn>
        </div>
      )}
    </div>
  );
}

function TurnMeta({ ev }: { ev: Extract<TimelineEvent, { type: 'turn_status' }> }) {
  const t = useT();
  if (ev.state === 'started') return null;
  return (
    <div className="text-[13.5px] text-zinc-400 dark:text-zinc-500 my-3">
      {ev.state === 'completed' ? `${t('finished')} · ${timeAgo(ev.ts)}` : ev.state === 'cancelled' ? t('cancelled') : `${t('failed')} · ${ev.error || ''}`}
    </div>
  );
}

function PlanCard({ entries }: { entries: Array<{ content: string; status?: string }> }) {
  const [open, setOpen] = useState(true);
  const t = useT();
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 mb-3 fade-up">
      <button onClick={() => setOpen(o => !o)} className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
        {open ? '▾' : '▸'} 📋 {t('planStatus')} ({entries.filter(e => e.status === 'completed').length}/{entries.length})
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {entries.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className={`flex-none mt-0.5 ${e.status === 'completed' ? 'text-green-500' : e.status === 'in_progress' ? 'text-accent' : 'text-zinc-300 dark:text-zinc-600'}`}>
                {e.status === 'completed' ? '✓' : e.status === 'in_progress' ? '◐' : '○'}
              </span>
              <span className={e.status === 'completed' ? 'text-zinc-400 line-through' : ''}>{e.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionMenu({ session, close, nav }: { session: Session; close: () => void; nav: Nav }) {
  const { client, refreshSessions } = useOrbix();
  return (
    <div className="absolute right-4 top-16 z-20 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-2 fade-up">
      <button onClick={async () => { await client?.call({ cmd: 'session.update', id: session.id, patch: { pinned: !session.pinned } }); close(); }}
        className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">{session.pinned ? 'Unpin' : 'Pin'} session</button>
      <button onClick={async () => {
        const title = prompt('Rename session', session.title);
        if (title) await client?.call({ cmd: 'session.update', id: session.id, patch: { title } });
        close();
      }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">Rename</button>
      <button onClick={async () => {
        await client?.call({ cmd: 'session.update', id: session.id, patch: { archived: true } });
        await refreshSessions();
        close(); nav.back();
      }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">Archive</button>
      <button onClick={async () => {
        if (!confirm('Delete this session from Orbix? (CLI history is kept)')) return;
        await client?.call({ cmd: 'session.delete', id: session.id });
        await refreshSessions();
        close(); nav.back();
      }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950">Delete</button>
    </div>
  );
}
