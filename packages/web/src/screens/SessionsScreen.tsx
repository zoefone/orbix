import { useEffect, useMemo, useState } from 'react';
import type { AgentKind, Session } from '@orbix/shared';
import { useOrbix } from '../store';
import { AgentMark, Chip, IconBtn, SessionStatusText, StatusDot } from '../components/ui';
import { useT } from '../i18n';
import type { Nav } from '../App';

export default function SessionsScreen({ nav }: { nav: Nav }) {
  const { sessions, status, refreshNative, native, client, sendKey } = useOrbix();
  const t = useT();
  const [filter, setFilter] = useState<AgentKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => { void refreshNative(); }, []);

  const filtered = useMemo(() => {
    let list = sessions.filter(s => !s.archived);
    if (filter !== 'all') list = list.filter(s => s.agent === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.title.toLowerCase().includes(q) || s.project.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, filter, search]);

  const pinned = filtered.filter(s => s.pinned);
  const unpinned = filtered.filter(s => !s.pinned);
  const today = unpinned.filter(s => Date.now() - s.updatedAt < 86400_000);
  const older = unpinned.filter(s => Date.now() - s.updatedAt >= 86400_000);
  const byProject = new Map<string, Session[]>();
  for (const s of older) {
    const arr = byProject.get(s.project) || [];
    arr.push(s);
    byProject.set(s.project, arr);
  }

  const machine = useOrbix(s => s.profile?.machine);

  function quickStart(e?: React.FormEvent) {
    e?.preventDefault();
    if (!prompt.trim()) return;
    const p = prompt.trim();
    setPrompt('');
    nav.go({ name: 'new', presetPrompt: p });
  }

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 flex items-center justify-center font-bold text-sm">◍</div>
          <span className="font-bold text-lg tracking-tight">Orbix</span>
          <StatusDot status={status === 'online' ? 'ok' : 'idle'} pulse={status === 'connecting'} />
          <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{machine}</span>
        </div>
        <div className="flex gap-2">
          <IconBtn title="Search" onClick={() => document.getElementById('orbix-search')?.focus()}>⌕</IconBtn>
          <IconBtn title="Settings" onClick={() => nav.go({ name: 'settings' })}>☰</IconBtn>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <h1 className="text-3xl font-bold tracking-tight py-3">{t('allWorkspaces')}</h1>
        <input id="orbix-search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchSessions')}
          className="w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-xl px-4 py-2.5 text-sm outline-none mb-3 placeholder:text-zinc-400 dark:placeholder:text-zinc-500" />
        <div className="flex gap-2 pb-1 overflow-x-auto">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
          {(['codex', 'claude', 'cursor'] as AgentKind[]).map(a => (
            <Chip key={a} active={filter === a} onClick={() => setFilter(a)}>
              <AgentMark agent={a} size={15} />{a === 'codex' ? 'Codex' : a === 'claude' ? 'Claude' : 'Cursor'}
            </Chip>
          ))}
        </div>

        {pinned.length > 0 && (
          <>
            <div className="text-sm text-zinc-500 dark:text-zinc-400 font-medium pt-5 pb-1">{t('pinned')}</div>
            {pinned.map(s => <SessionRow key={s.id} s={s} onOpen={() => nav.go({ name: 'chat', sessionId: s.id })} t={t} />)}
          </>
        )}
        {today.length > 0 && (
          <>
            <div className="text-sm text-zinc-500 dark:text-zinc-400 font-medium pt-5 pb-1">{t('today')}</div>
            {today.map(s => <SessionRow key={s.id} s={s} onOpen={() => nav.go({ name: 'chat', sessionId: s.id })} t={t} />)}
          </>
        )}
        {[...byProject.entries()].map(([proj, list]) => (
          <div key={proj}>
            <div className="text-sm text-zinc-500 dark:text-zinc-400 font-medium pt-5 pb-1">{proj}</div>
            {list.map(s => <SessionRow key={s.id} s={s} onOpen={() => nav.go({ name: 'chat', sessionId: s.id })} t={t} />)}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center text-zinc-400 dark:text-zinc-500 py-16 text-sm">{t('noSessions')}</div>
        )}

        {native.length > 0 && (
          <>
            <div className="text-sm text-zinc-500 dark:text-zinc-400 font-medium pt-6 pb-1">{t('onThisMachine')}</div>
            {native.slice(0, 12).map(n => (
              <div key={n.agent + n.nativeId} className="flex gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800/60 items-start">
                <AgentMark agent={n.agent} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15.5px] text-zinc-600 dark:text-zinc-300 truncate">{n.title}</div>
                  <div className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-mono truncate">{n.cwd}</div>
                </div>
                <button
                  onClick={async () => {
                    const sess = await client!.call<Session>({ cmd: 'session.import', agent: n.agent, nativeId: n.nativeId, cwd: n.cwd, title: n.title, model: n.model });
                    await useOrbix.getState().refreshSessions();
                    nav.go({ name: 'chat', sessionId: sess.id });
                  }}
                  className="text-[13px] font-semibold text-accent dark:text-accent-dark flex-none mt-1">{t('importAction')}</button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex-none px-4 pb-5 pt-2 bg-gradient-to-t from-zinc-50 dark:from-zinc-950 via-zinc-50 dark:via-zinc-950 to-transparent">
        <form onSubmit={quickStart} className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[26px] p-1.5 pl-2 shadow-sm">
          <button type="button" onClick={() => nav.go({ name: 'new' })}
            className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 flex-none hover:bg-zinc-200 dark:hover:bg-zinc-700">＋</button>
          <input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={t('planAskBuild')}
            onKeyDown={e => {
              const combo = e.shiftKey ? 'shift-enter' : (e.ctrlKey || e.metaKey) ? 'ctrl-enter' : 'enter';
              if (e.key === 'Enter' && combo === sendKey) { e.preventDefault(); quickStart(); }
            }}
            className="flex-1 bg-transparent outline-none text-base px-2 placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
          {prompt.trim() && (
            <button type="submit" className="w-9 h-9 rounded-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 flex items-center justify-center flex-none">↑</button>
          )}
        </form>
      </div>
    </div>
  );
}

function SessionRow({ s, onOpen, t }: { s: Session; onOpen: () => void; t: (k: 'passed' | 'noChanges' | 'imported') => string }) {
  const passed = s.status === 'idle' && (s.diffAdded > 0 || s.diffRemoved > 0);
  return (
    <button onClick={onOpen} className="w-full flex gap-3 py-3.5 border-b border-zinc-100 dark:border-zinc-800/60 items-start text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/40 -mx-2 px-2 rounded-xl transition-colors">
      <AgentMark agent={s.agent} />
      <div className="flex-1 min-w-0">
        <div className="text-[16.5px] font-medium truncate">{s.title}</div>
        <div className="text-[13.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{s.project}</span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          {s.status === 'running' ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-accent dark:bg-accent-dark animate-pulse-dot inline-block" /><SessionStatusText status={s.status} /></>
          ) : s.status === 'awaiting_approval' ? (
            <SessionStatusText status={s.status} />
          ) : passed ? (
            <span className="text-green-600 dark:text-green-500 font-semibold">{t('passed')}</span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">{t('noChanges')}</span>
          )}
          {s.origin === 'imported' && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span className="text-zinc-400">{t('imported')}</span></>}
          {(s.diffAdded > 0 || s.diffRemoved > 0) && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="diff-add font-semibold">+{s.diffAdded}</span>
              <span className="diff-del font-semibold">-{s.diffRemoved}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
