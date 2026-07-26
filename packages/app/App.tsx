import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import notifee, { EventType, type Event } from '@notifee/react-native';
import { useOrbix, restoreStoredProfile, restoreTheme, restorePrefs } from './src/store';
import { darkTheme, lightTheme } from './src/theme';
import { setupNotifications, handleNotificationEvent } from './src/notify';
import ConnectScreen from './src/screens/ConnectScreen';
import SessionsScreen from './src/screens/SessionsScreen';
import ChatScreen from './src/screens/ChatScreen';
import NewSessionScreen from './src/screens/NewSessionScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type RootStackParamList = {
  Sessions: undefined;
  Chat: { sessionId: string };
  NewSession: { presetPrompt?: string } | undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { profile, connect, theme } = useOrbix();
  const systemDark = useColorScheme() === 'dark';
  const [ready, setReady] = useState(false);
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  const t = useMemo(() => {
    const dark = theme === 'dark' || (theme === 'system' && systemDark);
    return dark ? darkTheme : lightTheme;
  }, [theme, systemDark]);

  useEffect(() => {
    void (async () => {
      await setupNotifications();
      const savedTheme = await restoreTheme();
      useOrbix.getState().setTheme(savedTheme);
      await restorePrefs();
      const profile = await restoreStoredProfile();
      if (profile) connect(profile);
      setReady(true);
    })();
  }, []);

  // notification taps -> navigate to chat; action buttons -> respond
  useEffect(() => {
    const unsub = notifee.onForegroundEvent(async (event: Event) => {
      if (event.type === EventType.PRESS) {
        const sessionId = event.detail.notification?.data?.sessionId as string | undefined;
        if (sessionId && navRef.current) navRef.current.navigate('Chat', { sessionId });
      } else {
        await handleNotificationEvent(event);
      }
    });
    // cold start from notification
    void notifee.getInitialNotification().then((initial) => {
      const sessionId = initial?.notification?.data?.sessionId as string | undefined;
      if (sessionId && navRef.current) {
        setTimeout(() => navRef.current?.navigate('Chat', { sessionId }), 500);
      }
    });
    return unsub;
  }, []);

  if (!ready) return null;

  const navTheme = t.dark ? {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: t.bg, card: t.bg, text: t.ink, border: t.line, primary: t.accent },
  } : {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: t.bg, card: t.bg, text: t.ink, border: t.line, primary: t.accent },
  };

  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      <StatusBar barStyle={t.dark ? 'light-content' : 'dark-content'} backgroundColor={t.bg} />
      {!profile ? (
        <ConnectScreen theme={t} />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
          <Stack.Screen name="Sessions">{() => <SessionsScreen theme={t} />}</Stack.Screen>
          <Stack.Screen name="Chat">{() => <ChatScreen theme={t} />}</Stack.Screen>
          <Stack.Screen name="NewSession">{() => <NewSessionScreen theme={t} />}</Stack.Screen>
          <Stack.Screen name="Settings">{() => <SettingsScreen theme={t} />}</Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
