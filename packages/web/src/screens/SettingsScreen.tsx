import { useEffect } from 'react';
import { useOrbix, type ThemeMode } from '../store';
import { IconBtn, StatusDot } from '../components/ui';
import { useT } from '../i18n';
import type { Nav } from '../App';

export default function SettingsScreen({ nav }: { nav: Nav }) {
  const { theme, setTheme, lang, setLang, sendKey, setSendKey, cliStatus, refreshCli, profile, disconnect, status } = useOrbix();
  const t = useT();
  useEffect(() => { void refreshCli(); }, []);

  const statusText = status === 'online' ? t('online') : status === 'offline' ? t('offline') : t('connecting');

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-none">
        <IconBtn plain onClick={() => nav.back()}>‹</IconBtn>
        <div className="font-semibold text-[17px]">{t('settings')}</div>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <SectionLabel>{t('appearance')}</SectionLabel>
        <Group>
          <Row icon="◐" label={t('theme')} right={
            <Seg options={[['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']]} value={theme} onChange={v => setTheme(v as ThemeMode)} />
          } />
          <Row icon="文" label={t('language')} right={
            <Seg options={[['zh', '中文'], ['en', 'EN']]} value={lang} onChange={v => setLang(v as 'zh' | 'en')} />
          } />
          <Row icon="↵" label={t('sendKey')} right={
            <Seg options={[['enter', 'Enter'], ['shift-enter', 'Shift+Enter'], ['ctrl-enter', 'Ctrl+Enter']]} value={sendKey} onChange={v => setSendKey(v as typeof sendKey)} />
          } />
        </Group>

        <SectionLabel>{t('connectedClis')}</SectionLabel>
        <Group>
          {cliStatus.map(c => (
            <Row key={c.agent}
              icon={<span className="font-bold text-[13px]">{c.agent === 'codex' ? 'C' : c.agent === 'claude' ? '✻' : '◈'}</span>}
              label={c.agent === 'codex' ? 'Codex' : c.agent === 'claude' ? 'Claude Code' : 'Cursor Agent'}
              sub={c.installed ? c.version : 'not found'}
              right={<StatusDot status={c.installed ? 'ok' : 'error'} />} />
          ))}
          {cliStatus.length === 0 && <Row label="Detecting…" />}
        </Group>

        <SectionLabel>{t('server')}</SectionLabel>
        <Group>
          <Row icon="⌂" label={profile?.machine || 'server'} sub={profile?.url} right={
            <span className="flex items-center gap-1.5 text-sm text-zinc-500"><StatusDot status={status === 'online' ? 'ok' : 'idle'} />{statusText}</span>
          } />
          <Row icon="☁" label={t('tunnelRelay')} right={<span className="text-sm text-zinc-400">via CLI ›</span>} />
          <button onClick={disconnect} className="w-full text-left">
            <Row icon="⎋" label={<span className="text-red-500">{t('disconnect')}</span>} />
          </button>
        </Group>

        <SectionLabel>{t('about')}</SectionLabel>
        <Group>
          <Row icon="◍" label="Orbix" right={<span className="text-sm text-zinc-400">v0.1.1</span>} />
        </Group>
      </div>
    </div>
  );
}

function Seg({ options, value, onChange }: { options: Array<[string, string]>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5 gap-0.5">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`px-3 py-1.5 rounded-[10px] text-[13px] font-medium transition-colors ${value === id ? 'bg-white dark:bg-zinc-900 font-semibold shadow-sm' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-zinc-500 dark:text-zinc-400 font-medium pt-6 pb-2">{children}</div>;
}
function Group({ children }: { children: React.ReactNode }) {
  return <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/60">{children}</div>;
}
function Row({ icon, label, sub, right }: { icon?: React.ReactNode; label: React.ReactNode; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {icon && <span className="w-[30px] h-[30px] rounded-[9px] bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400 flex-none">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[15.5px] truncate">{label}</div>
        {sub && <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
