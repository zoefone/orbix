import { useEffect, useMemo, useState } from 'react';
import type { AgentKind, PermissionMode, Session } from '@orbix/shared';
import { useOrbix } from '../store';
import { AgentMark, AgentName, IconBtn } from '../components/ui';
import OptionMenu from '../components/OptionMenu';
import { useT } from '../i18n';
import type { Nav } from '../App';

interface Prefs { model?: string; effort?: string; speed?: string; mode?: string; permissionMode?: PermissionMode }
const loadPrefs = (a: AgentKind): Prefs => { try { return JSON.parse(localStorage.getItem('orbix-prefs-' + a) || '{}'); } catch { return {}; } };
const savePrefs = (a: AgentKind, p: Prefs) => localStorage.setItem('orbix-prefs-' + a, JSON.stringify(p));

export default function NewSessionScreen({ nav, presetAgent, presetPrompt }: { nav: Nav; presetAgent?: AgentKind; presetPrompt?: string }) {
  const { client, refreshSessions, capabilities, refreshCapabilities } = useOrbix();
  const t = useT();
  const [agent, setAgent] = useState<AgentKind>(presetAgent || 'codex');
  const [cwd, setCwd] = useState('/root');
  const [dirList, setDirList] = useState<{ path: string; parent: string; dirs: string[] } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [effort, setEffort] = useState('');
  const [speed, setSpeed] = useState('');
  const [mode, setMode] = useState('');
  const [perm, setPerm] = useState<PermissionMode>('default');
  const [prompt, setPrompt] = useState(presetPrompt || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { void refreshCapabilities(); void loadDir(cwd); }, []);
  useEffect(() => { void refreshCapabilities(agent); }, [agent]);

  // restore per-agent prefs on switch
  useEffect(() => {
    const p = loadPrefs(agent);
    setModel(p.model || '');
    setEffort(p.effort || '');
    setSpeed(p.speed || '');
    setMode(p.mode || '');
    setPerm(p.permissionMode || 'default');
  }, [agent]);

  const caps = capabilities[agent];
  const modelOptions = useMemo(() => {
    const opts = (caps?.models || []).map(m => ({ id: m.id, label: m.name + (m.isDefault ? ' ★' : '') }));
    opts.push({ id: '__custom__', label: t('customModel') });
    return opts;
  }, [caps, t]);

  async function loadDir(path: string) {
    try { setDirList(await client!.call({ cmd: 'fs.list', path })); } catch { }
  }

  async function start() {
    if (!client) return;
    setBusy(true); setError('');
    try {
      const finalModel = model === '__custom__' ? customModel.trim() : model;
      savePrefs(agent, { model: finalModel || undefined, effort: effort || undefined, speed: speed || undefined, mode: mode || undefined, permissionMode: perm });
      const sess = await client.call<Session>({
        cmd: 'session.create', agent, cwd,
        model: finalModel || undefined,
        permissionMode: perm,
        prompt: prompt.trim() || undefined,
      });
      // apply effort/speed/mode via session.update right after creation
      if (effort || speed || mode) {
        await client.call({ cmd: 'session.update', id: sess.id, patch: { effort: effort || undefined, speed: speed || undefined, mode: mode || undefined } });
      }
      await refreshSessions();
      nav.go({ name: 'chat', sessionId: sess.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const permOptions = caps?.permOptions || [];

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-none">
        <IconBtn plain onClick={() => nav.back()}>‹</IconBtn>
        <div className="font-semibold text-[17px]">{t('newSession')}</div>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="text-sm text-zinc-500 dark:text-zinc-400 font-medium pt-2 pb-2">{t('agent')}</div>
        {(['codex', 'claude', 'cursor'] as AgentKind[]).map(a => (
          <button key={a} onClick={() => setAgent(a)}
            className={`w-full flex items-center gap-3.5 bg-white dark:bg-zinc-900 border-[1.5px] rounded-2xl p-4 mb-2.5 text-left transition-colors ${agent === a ? 'border-zinc-900 dark:border-zinc-50' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <AgentMark agent={a} size={44} />
            <span className="flex-1">
              <span className="block text-[16.5px] font-semibold"><AgentName agent={a} /></span>
              <span className="block text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {a === 'codex' ? 'OpenAI · app-server' : a === 'claude' ? 'Anthropic · Agent SDK' : 'ACP · stream-json'}
              </span>
            </span>
            <span className={`w-[22px] h-[22px] rounded-full border-2 flex-none ${agent === a ? 'border-zinc-900 dark:border-zinc-50 bg-zinc-900 dark:bg-zinc-50 shadow-[inset_0_0_0_4px_white] dark:shadow-[inset_0_0_0_4px_#18181B]' : 'border-zinc-300 dark:border-zinc-600'}`} />
          </button>
        ))}

        <div className="text-[13.5px] text-zinc-500 dark:text-zinc-400 font-medium mt-5 mb-2">{t('projectDir')}</div>
        <button onClick={() => setBrowsing(b => !b)}
          className="w-full flex items-center gap-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-left">
          <span className="text-zinc-400">📁</span>
          <span className="flex-1 font-mono text-sm truncate">{cwd}</span>
          <span className="text-zinc-300 dark:text-zinc-600">{browsing ? '⌃' : '›'}</span>
        </button>
        {browsing && dirList && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl mt-2 max-h-56 overflow-y-auto fade-up">
            <button onClick={() => loadDir(dirList.parent)} className="w-full text-left px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-t-2xl">.. (up)</button>
            {dirList.dirs.map(d => (
              <button key={d} onClick={() => loadDir(dirList.path + '/' + d)}
                className="w-full text-left px-4 py-2.5 text-sm font-mono hover:bg-zinc-50 dark:hover:bg-zinc-800">{d}/</button>
            ))}
            <button onClick={() => { setCwd(dirList.path); setBrowsing(false); }}
              className="w-full text-left px-4 py-2.5 text-sm font-semibold text-accent dark:text-accent-dark border-t border-zinc-100 dark:border-zinc-800">{t('useThisDir')} {dirList.path}</button>
          </div>
        )}

        <div className="text-[13.5px] text-zinc-500 dark:text-zinc-400 font-medium mt-5 mb-2">{t('model')}</div>
        <div className="flex gap-2 items-center">
          <OptionMenu
            label={model === '__custom__' ? t('customModel') : (caps?.models.find(m => m.id === model)?.name || model || t('cliDefault'))}
            options={modelOptions}
            value={model}
            onChange={setModel}
          />
          {model === '__custom__' && (
            <input value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="model id…"
              className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-4 py-2 text-sm outline-none" />
          )}
        </div>

        {!!caps?.efforts?.length && (
          <>
            <div className="text-[13.5px] text-zinc-500 dark:text-zinc-400 font-medium mt-5 mb-2">{t('effort')}</div>
            <div className="flex gap-2">
              <OptionMenu label={effort || t('cliDefault')} options={caps.efforts.map(e => ({ id: e, label: e }))} value={effort} onChange={setEffort} />
            </div>
          </>
        )}

        {!!caps?.speeds?.length && (
          <>
            <div className="text-[13.5px] text-zinc-500 dark:text-zinc-400 font-medium mt-5 mb-2">{t('speed')}</div>
            <div className="flex gap-2">
              <OptionMenu label={speed || t('cliDefault')} options={caps.speeds.map(s => ({ id: s, label: s }))} value={speed} onChange={setSpeed} />
            </div>
          </>
        )}

        {!!caps?.modes?.length && (
          <>
            <div className="text-[13.5px] text-zinc-500 dark:text-zinc-400 font-medium mt-5 mb-2">{t('cursorMode')}</div>
            <div className="flex gap-2 flex-wrap">
              {caps.modes.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${mode === m.id || (!mode && m.id === 'agent') ? 'bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:border-zinc-50' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                  {m.name}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="text-[13.5px] text-zinc-500 dark:text-zinc-400 font-medium mt-5 mb-2">{t('permMode')}</div>
        {permOptions.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {permOptions.map(p => (
              <button key={p.id} onClick={() => setPerm(p.id as PermissionMode)} title={p.description}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${perm === p.id ? 'bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:border-zinc-50' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex bg-zinc-100 dark:bg-zinc-800/60 rounded-xl p-1 gap-1">
            {(['plan', 'default', 'acceptEdits', 'bypass'] as PermissionMode[]).map(m => (
              <button key={m} onClick={() => setPerm(m)}
                className={`flex-1 py-2 rounded-[10px] text-[13.5px] font-medium transition-colors ${perm === m ? 'bg-white dark:bg-zinc-900 font-semibold shadow-sm' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {m === 'acceptEdits' ? 'Auto-edit' : m === 'bypass' ? 'YOLO' : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        )}

        <div className="text-[13.5px] text-zinc-500 dark:text-zinc-400 font-medium mt-5 mb-2">{t('initialPrompt')}</div>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={t('describeTask')} rows={4}
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-[15px] outline-none resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />

        {error && <div className="text-sm text-red-500 mt-2">{error}</div>}
        <button onClick={start} disabled={busy}
          className="w-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 rounded-full py-4 text-base font-semibold mt-5 hover:opacity-85 transition-opacity disabled:opacity-40">
          {busy ? t('starting') : t('startSession')}
        </button>
      </div>
    </div>
  );
}
