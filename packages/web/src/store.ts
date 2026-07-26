import { create } from 'zustand';
import type { AgentCapabilities, AgentKind, CliStatus, NativeSession, Session, TimelineEvent } from '@orbix/shared';
import { OrbixClient, type ServerProfile } from './api';

type ConnStatus = 'connecting' | 'online' | 'offline';
export type ThemeMode = 'light' | 'dark' | 'system';

interface OrbixState {
  // connection
  client: OrbixClient | null;
  profile: ServerProfile | null;
  status: ConnStatus;
  connect: (p: ServerProfile) => void;
  disconnect: () => void;

  // data
  sessions: Session[];
  cliStatus: CliStatus[];
  native: NativeSession[];
  timelines: Record<string, TimelineEvent[]>;
  capabilities: Partial<Record<AgentKind, AgentCapabilities>>;
  refreshCapabilities: (agent?: AgentKind) => Promise<void>;
  notifications: Array<{ id: number; level: string; title: string; body: string; sessionId: string; requestId?: string }>;

  // theme
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;

  // i18n + input prefs
  lang: 'zh' | 'en';
  setLang: (l: 'zh' | 'en') => void;
  sendKey: 'enter' | 'shift-enter' | 'ctrl-enter';
  setSendKey: (k: 'enter' | 'shift-enter' | 'ctrl-enter') => void;

  // actions
  refreshSessions: () => Promise<void>;
  refreshNative: () => Promise<void>;
  refreshCli: () => Promise<void>;
  loadTimeline: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, text: string, attachments?: import('@orbix/shared').Attachment[]) => Promise<void>;
}

export const useOrbix = create<OrbixState>((set, get) => ({
  client: null,
  profile: null,
  status: 'offline',
  sessions: [],
  cliStatus: [],
  native: [],
  timelines: {},
  capabilities: {},
  notifications: [],
  theme: (localStorage.getItem('orbix-theme') as ThemeMode) || 'system',
  lang: (localStorage.getItem('orbix-lang') as 'zh' | 'en') || 'zh',
  sendKey: (localStorage.getItem('orbix-sendkey') as 'enter' | 'shift-enter' | 'ctrl-enter') || 'enter',

  setLang: (l) => { localStorage.setItem('orbix-lang', l); set({ lang: l }); },
  setSendKey: (k) => { localStorage.setItem('orbix-sendkey', k); set({ sendKey: k }); },

  setTheme: (t) => {
    localStorage.setItem('orbix-theme', t);
    set({ theme: t });
    applyTheme(t);
  },

  connect: (profile) => {
    get().client?.close();
    const client = new OrbixClient(profile);
    client.onStatus = (status) => {
      set({ status });
      if (status === 'online') {
        void get().refreshSessions();
        void get().refreshCli();
      }
    };
    client.onPush((frame) => {
      const s = get();
      if (frame.push === 'session') {
        const idx = s.sessions.findIndex(x => x.id === frame.session.id);
        const sessions = [...s.sessions];
        if (idx >= 0) sessions[idx] = frame.session; else sessions.unshift(frame.session);
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        set({ sessions });
      } else if (frame.push === 'event') {
        const ev = frame.event;
        const tl = { ...s.timelines };
        const arr = [...(tl[ev.sessionId] || [])];
        const i = arr.findIndex(x => x.id === ev.id);
        if (i >= 0) arr[i] = ev; else arr.push(ev);
        arr.sort((a, b) => a.seq - b.seq);
        tl[ev.sessionId] = arr;
        set({ timelines: tl });
      } else if (frame.push === 'notify') {
        set({ notifications: [...s.notifications.slice(-19), { id: Date.now(), ...frame }] });
      }
    });
    client.connect();
    set({ client, profile });
    localStorage.setItem('orbix-profile', JSON.stringify({ url: profile.url, token: profile.token, machine: profile.machine }));
  },

  disconnect: () => {
    get().client?.close();
    localStorage.removeItem('orbix-profile');
    set({ client: null, profile: null, sessions: [], timelines: {}, status: 'offline' });
  },

  refreshSessions: async () => {
    const c = get().client;
    if (!c) return;
    const sessions = await c.call<Session[]>({ cmd: 'session.list' });
    set({ sessions });
  },

  refreshNative: async () => {
    const c = get().client;
    if (!c) return;
    const native = await c.call<NativeSession[]>({ cmd: 'native.list' });
    set({ native });
  },

  refreshCli: async () => {
    const c = get().client;
    if (!c) return;
    const cliStatus = await c.call<CliStatus[]>({ cmd: 'cli.status' });
    set({ cliStatus });
  },

  refreshCapabilities: async (agent) => {
    const c = get().client;
    if (!c) return;
    try {
      const caps = await c.call<AgentCapabilities[]>({ cmd: 'agent.capabilities', agent });
      const map = { ...get().capabilities };
      for (const cap of caps) map[cap.agent] = cap;
      set({ capabilities: map });
    } catch { }
  },

  loadTimeline: async (sessionId) => {
    const c = get().client;
    if (!c) return;
    const events = await c.call<TimelineEvent[]>({ cmd: 'timeline.list', sessionId, limit: 300 });
    set(s => ({ timelines: { ...s.timelines, [sessionId]: events } }));
  },

  sendMessage: async (sessionId, text, attachments) => {
    const c = get().client;
    if (!c) return;
    await c.call({ cmd: 'message.send', sessionId, text, attachments });
  },
}));

export function applyTheme(t: ThemeMode) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

// react to system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const t = useOrbix.getState().theme;
  if (t === 'system') applyTheme('system');
});
