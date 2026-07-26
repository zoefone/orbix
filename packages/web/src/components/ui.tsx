import type { AgentKind, SessionStatus } from '@orbix/shared';
import type { ReactNode } from 'react';

export function AgentMark({ agent, size = 22 }: { agent: AgentKind; size?: number }) {
  const cls = agent === 'codex'
    ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
    : agent === 'claude'
      ? 'bg-zinc-100 text-zinc-900 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700'
      : 'bg-blue-50 text-accent dark:bg-[#16233D] dark:text-accent-dark';
  const label = agent === 'codex' ? 'C' : agent === 'claude' ? '✻' : '◈';
  return (
    <span
      className={`inline-flex items-center justify-center font-bold flex-none ${cls}`}
      style={{ width: size, height: size, borderRadius: size * 0.32, fontSize: size * 0.48 }}
    >{label}</span>
  );
}

export function AgentName({ agent }: { agent: AgentKind }) {
  return <>{agent === 'codex' ? 'Codex' : agent === 'claude' ? 'Claude Code' : 'Cursor Agent'}</>;
}

export function StatusDot({ status, pulse }: { status: SessionStatus | 'ok' | 'idle'; pulse?: boolean }) {
  const color = status === 'running' || status === 'awaiting_approval' ? 'bg-accent dark:bg-accent-dark'
    : status === 'error' ? 'bg-red-500'
      : status === 'ok' ? 'bg-green-500'
        : 'bg-zinc-300 dark:bg-zinc-600';
  return <span className={`w-2 h-2 rounded-full flex-none ${color} ${pulse ? 'animate-pulse-dot' : ''}`} />;
}

export function SessionStatusText({ status }: { status: SessionStatus }) {
  if (status === 'running') return <span className="text-accent dark:text-accent-dark">Working…</span>;
  if (status === 'awaiting_approval') return <span className="text-amber-600 dark:text-amber-400">Needs approval</span>;
  if (status === 'error') return <span className="text-red-500">Error</span>;
  return <span className="text-zinc-500 dark:text-zinc-400">Idle</span>;
}

export function IconBtn({ children, onClick, plain, title }: { children: ReactNode; onClick?: () => void; plain?: boolean; title?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center flex-none transition-colors ${plain
        ? 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
    >{children}</button>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[13.5px] font-medium flex-none transition-colors ${active
        ? 'bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:border-zinc-50'
        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
    >{children}</button>
  );
}

export function PillBtn({ children, onClick, primary, danger }: { children: ReactNode; onClick?: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${primary
        ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-85'
        : danger
          ? 'border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-950'
          : 'border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
    >{children}</button>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
