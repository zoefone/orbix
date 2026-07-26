import { useState } from 'react';
import { health, login, pair } from '../api';
import { useOrbix } from '../store';

type Tab = 'direct' | 'pairing' | 'relay';

export default function ConnectScreen() {
  const connect = useOrbix(s => s.connect);
  const [tab, setTab] = useState<Tab>('direct');
  const [url, setUrl] = useState(localStorage.getItem('orbix-last-url') || '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved: Array<{ url: string; token: string; machine?: string }> = (() => {
    try { return JSON.parse(localStorage.getItem('orbix-servers') || '[]'); } catch { return []; }
  })();

  function normalizeUrl(u: string): string {
    u = u.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(u)) u = 'http://' + u;
    return u;
  }

  async function doConnect() {
    setBusy(true); setError('');
    try {
      const u = normalizeUrl(url);
      if (!await health(u)) throw new Error('Server unreachable — check the address');
      const profile = tab === 'pairing' ? await pair(u, code.trim()) : await login(u, password);
      // save to server list
      const list = saved.filter(s => s.url !== u);
      list.unshift({ url: u, token: profile.token, machine: profile.machine });
      localStorage.setItem('orbix-servers', JSON.stringify(list.slice(0, 10)));
      localStorage.setItem('orbix-last-url', u);
      connect(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 fade-up">
          <div className="w-[72px] h-[72px] rounded-[22px] bg-zinc-900 dark:bg-zinc-50 mx-auto mb-4 flex items-center justify-center text-3xl text-zinc-50 dark:text-zinc-900 font-bold">◍</div>
          <h1 className="text-[26px] font-bold tracking-tight">Orbix</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1.5">Control Codex · Claude · Cursor from anywhere</p>
        </div>

        <div className="flex bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl p-1 gap-1 mb-4 fade-up">
          {(['direct', 'pairing', 'relay'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold shadow-sm' : 'text-zinc-500 dark:text-zinc-400'}`}>
              {t === 'direct' ? 'Direct' : t === 'pairing' ? 'Pairing' : 'Relay'}
            </button>
          ))}
        </div>

        <div className="space-y-2.5 fade-up">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5">
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide mb-0.5">SERVER ADDRESS</div>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="192.168.1.5:8760"
              className="w-full bg-transparent outline-none font-mono text-[15px] placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
          </div>
          {tab === 'pairing' ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5">
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide mb-0.5">PAIRING CODE</div>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code from `orbix pair`" maxLength={6}
                className="w-full bg-transparent outline-none font-mono text-[15px] tracking-[0.3em] placeholder:tracking-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5">
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide mb-0.5">{tab === 'relay' ? 'RELAY KEY / PASSWORD' : 'PASSWORD / KEY'}</div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••"
                className="w-full bg-transparent outline-none text-[15px] placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
            </div>
          )}
          {error && <div className="text-sm text-red-500 px-1">{error}</div>}
          <button onClick={doConnect} disabled={busy || !url}
            className="w-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 rounded-full py-4 text-base font-semibold hover:opacity-85 transition-opacity disabled:opacity-40">
            {busy ? 'Connecting…' : tab === 'pairing' ? 'Pair' : 'Connect'}
          </button>
        </div>

        {saved.length > 0 && (
          <div className="mt-7 fade-up">
            <div className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mb-2">Saved servers</div>
            <div className="space-y-2">
              {saved.map(s => (
                <button key={s.url} onClick={() => { connect({ url: s.url, token: s.token, machine: s.machine }); }}
                  className="w-full flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-left hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                  <span className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400">⌂</span>
                  <span className="min-w-0">
                    <div className="text-[15px] font-semibold truncate">{s.machine || s.url}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate">{s.url.replace(/^https?:\/\//, '')}</div>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
