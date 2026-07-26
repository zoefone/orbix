import { useEffect, useState } from 'react';
import { useOrbix, applyTheme } from './store';
import ConnectScreen from './screens/ConnectScreen';
import SessionsScreen from './screens/SessionsScreen';
import ChatScreen from './screens/ChatScreen';
import NewSessionScreen from './screens/NewSessionScreen';
import SettingsScreen from './screens/SettingsScreen';
import type { ServerProfile } from './api';

export type Route =
  | { name: 'sessions' }
  | { name: 'chat'; sessionId: string }
  | { name: 'new'; presetAgent?: 'codex' | 'claude' | 'cursor'; presetPrompt?: string }
  | { name: 'settings' };

export interface Nav {
  go: (r: Route) => void;
  back: () => void;
}

export default function App() {
  const { profile, connect, theme } = useOrbix();
  const [route, setRoute] = useState<Route>({ name: 'sessions' });
  const [history, setHistory] = useState<Route[]>([]);

  useEffect(() => { applyTheme(theme); }, [theme]);

  // auto-reconnect with saved profile
  useEffect(() => {
    if (!profile) {
      const saved = localStorage.getItem('orbix-profile');
      if (saved) {
        try { connect(JSON.parse(saved) as ServerProfile); } catch { }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nav: Nav = {
    go: (r) => { setHistory(h => [...h, route]); setRoute(r); },
    back: () => {
      setHistory(h => {
        const nh = [...h];
        const prev = nh.pop();
        setRoute(prev || { name: 'sessions' });
        return nh;
      });
    },
  };

  if (!profile) return <ConnectScreen />;

  switch (route.name) {
    case 'sessions': return <SessionsScreen nav={nav} />;
    case 'chat': return <ChatScreen nav={nav} sessionId={route.sessionId} />;
    case 'new': return <NewSessionScreen nav={nav} presetAgent={route.presetAgent} presetPrompt={route.presetPrompt} />;
    case 'settings': return <SettingsScreen nav={nav} />;
  }
}
