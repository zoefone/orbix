import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { health, login, pair, type ServerProfile } from '../api';
import { useOrbix } from '../store';
import { useT } from '../i18n';
import type { Theme } from '../theme';

type Tab = 'direct' | 'pairing' | 'relay';

export default function ConnectScreen({ theme }: { theme: Theme }) {
  const connect = useOrbix(s => s.connect);
  const tr = useT();
  const [tab, setTab] = useState<Tab>('direct');
  const [url, setUrl] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ServerProfile[]>([]);

  React.useEffect(() => {
    void AsyncStorage.getItem('orbix-servers').then(raw => {
      if (raw) { try { setSaved(JSON.parse(raw)); } catch { } }
      void AsyncStorage.getItem('orbix-last-url').then(u => { if (u) setUrl(u); });
    });
  }, []);

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
      const list = saved.filter(s => s.url !== u);
      list.unshift(profile);
      await AsyncStorage.setItem('orbix-servers', JSON.stringify(list.slice(0, 10)));
      await AsyncStorage.setItem('orbix-last-url', u);
      connect(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  const t = theme;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Text style={{ color: t.bg, fontSize: 30, fontWeight: '700' }}>◍</Text>
          </View>
          <Text style={{ fontSize: 26, fontWeight: '700', color: t.ink, letterSpacing: -0.5 }}>Orbix</Text>
          <Text style={{ color: t.ink2, fontSize: 14.5, marginTop: 6 }}>{tr('connectTitle')}</Text>
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: t.card2, borderRadius: 14, padding: 4, gap: 4, marginBottom: 14 }}>
          {(['direct', 'pairing', 'relay'] as Tab[]).map(x => (
            <TouchableOpacity key={x} onPress={() => setTab(x)} style={{
              flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center',
              backgroundColor: tab === x ? t.card : 'transparent',
            }}>
              <Text style={{ fontSize: 14, fontWeight: tab === x ? '600' : '500', color: tab === x ? t.ink : t.ink2 }}>
                {x === 'direct' ? tr('direct') : x === 'pairing' ? tr('pairing') : tr('relay')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.ink2, letterSpacing: 0.4, marginBottom: 3 }}>{tr('serverAddr')}</Text>
          <TextInput value={url} onChangeText={setUrl} placeholder="192.168.1.5:8760" placeholderTextColor={t.ink3}
            autoCapitalize="none" autoCorrect={false} keyboardType="url"
            style={{ fontSize: 16, color: t.ink, fontFamily: Platform.OS === 'android' ? 'monospace' : undefined }} />
        </View>

        {tab === 'pairing' ? (
          <View style={{ backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: t.ink2, letterSpacing: 0.4, marginBottom: 3 }}>{tr('pairingCode')}</Text>
            <TextInput value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={t.ink3}
              keyboardType="number-pad" maxLength={6}
              style={{ fontSize: 16, color: t.ink, letterSpacing: 4, fontFamily: Platform.OS === 'android' ? 'monospace' : undefined }} />
          </View>
        ) : (
          <View style={{ backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: t.ink2, letterSpacing: 0.4, marginBottom: 3 }}>{tr('password')}</Text>
            <TextInput value={password} onChangeText={setPassword} placeholder="••••••••••" placeholderTextColor={t.ink3}
              secureTextEntry autoCapitalize="none"
              style={{ fontSize: 16, color: t.ink }} />
          </View>
        )}

        {!!error && <Text style={{ color: t.err, fontSize: 13, marginBottom: 8, marginLeft: 4 }}>{error}</Text>}

        <TouchableOpacity onPress={doConnect} disabled={busy || !url} style={{
          backgroundColor: t.ink, borderRadius: 999, paddingVertical: 16, alignItems: 'center', opacity: busy || !url ? 0.4 : 1,
        }}>
          <Text style={{ color: t.bg, fontSize: 16, fontWeight: '600' }}>{busy ? '…' : tab === 'pairing' ? tr('pair') : tr('connect')}</Text>
        </TouchableOpacity>

        {saved.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={{ color: t.ink2, fontSize: 14, fontWeight: '500', marginBottom: 8 }}>{tr('savedServers')}</Text>
            {saved.map(s => (
              <TouchableOpacity key={s.url} onPress={() => connect(s)} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card,
                borderColor: t.line, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 8,
              }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, color: t.ink2 }}>⌂</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15.5, fontWeight: '600', color: t.ink }}>{s.machine || s.url}</Text>
                  <Text style={{ fontSize: 12.5, color: t.ink2, fontFamily: Platform.OS === 'android' ? 'monospace' : undefined }}>{s.url.replace(/^https?:\/\//, '')}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
