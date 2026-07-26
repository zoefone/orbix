import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OrbixClient, type ServerProfile } from './api';
import type { AgentCapabilities, AgentKind, Attachment, CliStatus, NativeSession, Session, TimelineEvent } from './types';
import type { ThemeMode } from './theme';
import type { Lang } from './i18n';
import { showAlert, updateOngoing, hideOngoing } from './notify';

type ConnStatus = 'connecting' | 'online' | 'offline';
export type SendKey = 'enter' | 'shift-enter' | 'ctrl-enter';

interface OrbixState {
  client: OrbixClient | null;
  profile: ServerProfile | null;
  status: ConnStatus;
  sessions: Session[];
  cliStatus: CliStatus[];
  native: NativeSession[];
  timelines: Record<string, TimelineEvent[]>;
  capabilities: Partial<Record<AgentKind, AgentCapabilities>>;
  theme: ThemeMode;
  lang: Lang;
  sendKey: SendKey;

  connect: (p: ServerProfile) => void;
  disconnect: () => void;
  setTheme: (t: ThemeMode) => void;
  setLang: (l: Lang) => void;
  setSendKey: (k: SendKey) => void;
  refreshSessions: () => Promise<void>;
  refreshNative: () => Promise<void>;
  refreshCli: () => Promise<void>;
  refreshCapabilities: (agent?: AgentKind) => Promise<void>;
  loadTimeline: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, text: string, attachments?: Attachment[]) => Promise<void>;
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
  theme: 'system',
  lang: 'zh',
  sendKey: 'enter',

  setTheme: (t) => {
    set({ theme: t });
    void AsyncStorage.setItem('orbix-theme', t);
  },
  setLang: (l) => {
    set({ lang: l });
    void AsyncStorage.setItem('orbix-lang', l);
  },
  setSendKey: (k) => {
    set({ sendKey: k });
    void AsyncStorage.setItem('orbix-sendkey', k);
  },

  connect: (profile) => {
    get().client?.close();
    const client = new OrbixClient(profile);
    client.onStatus = (status) => {
      set({ status });
      if (status === 'online') {
        void get().refreshSessions();
        void get().refreshCli();
        void updateOngoing('Orbix connected', profile.machine || profile.url);
      } else if (status === 'offline') {
        void updateOngoing('Orbix — reconnecting…', profile.machine || profile.url);
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
        // ongoing status notification tracks the active session
        if (frame.session.status === 'running') {
          void updateOngoing(`${agentLabel(frame.session.agent)} is working…`, frame.session.title, frame.session.id);
        } else if (frame.session.status === 'awaiting_approval') {
          void updateOngoing('Approval needed', frame.session.title, frame.session.id);
        }
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
        void showAlert(frame);
        if (frame.level === 'done' || frame.level === 'error') {
          void updateOngoing('Orbix connected', profile.machine || profile.url);
        }
      }
    });
    client.connect();
    set({ client, profile });
    void AsyncStorage.setItem('orbix-profile', JSON.stringify(profile));
  },

  disconnect: () => {
    get().client?.close();
    void hideOngoing();
    void AsyncStorage.removeItem('orbix-profile');
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

function agentLabel(a: string): string {
  return a === 'codex' ? 'Codex' : a === 'claude' ? 'Claude' : 'Cursor';
}

export async function restoreStoredProfile(): Promise<ServerProfile | null> {
  try {
    const raw = await AsyncStorage.getItem('orbix-profile');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function restoreTheme(): Promise<ThemeMode> {
  try {
    return (await AsyncStorage.getItem('orbix-theme')) as ThemeMode || 'system';
  } catch { return 'system'; }
}

export async function restorePrefs(): Promise<void> {
  try {
    const lang = await AsyncStorage.getItem('orbix-lang');
    if (lang === 'zh' || lang === 'en') useOrbix.getState().setLang(lang);
    const sk = await AsyncStorage.getItem('orbix-sendkey');
    if (sk === 'enter' || sk === 'shift-enter' || sk === 'ctrl-enter') useOrbix.getState().setSendKey(sk);
  } catch { }
}
