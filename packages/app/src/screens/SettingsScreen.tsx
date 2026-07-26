import React, { useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrbix } from '../store';
import type { Theme, ThemeMode } from '../theme';
import { StatusDot } from '../components/ui';
import type { NavProp } from '../navigation';
import { useT } from '../i18n';
import type { SendKey } from '../store';

export default function SettingsScreen({ theme }: { theme: Theme }) {
  const t = theme;
  const nav = useNavigation<NavProp>();
  const { theme: themeMode, setTheme, lang, setLang, sendKey, setSendKey, cliStatus, refreshCli, profile, disconnect, status } = useOrbix();
  const tr = useT();
  useEffect(() => { void refreshCli(); }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
        <TouchableOpacity onPress={() => nav.goBack()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: t.ink2 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '600', color: t.ink }}>{tr('settings')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <SectionLabel t={t}>{tr('appearance')}</SectionLabel>
      <Group t={t}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.ink2 }}>◐</Text></View>
          <Text style={{ flex: 1, fontSize: 15.5, color: t.ink }}>{tr('theme')}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: t.card2, borderRadius: 12, padding: 3, gap: 3 }}>
            {(['light', 'dark', 'system'] as ThemeMode[]).map(x => (
              <TouchableOpacity key={x} onPress={() => setTheme(x)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: themeMode === x ? t.card : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: themeMode === x ? '600' : '500', color: themeMode === x ? t.ink : t.ink2 }}>
                  {x === 'system' ? 'Auto' : x[0].toUpperCase() + x.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.ink2 }}>文</Text></View>
          <Text style={{ flex: 1, fontSize: 15.5, color: t.ink }}>{tr('language')}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: t.card2, borderRadius: 12, padding: 3, gap: 3 }}>
            {(['zh', 'en'] as const).map(x => (
              <TouchableOpacity key={x} onPress={() => setLang(x)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: lang === x ? t.card : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: lang === x ? '600' : '500', color: lang === x ? t.ink : t.ink2 }}>{x === 'zh' ? '中文' : 'EN'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.ink2 }}>↵</Text></View>
          <Text style={{ flex: 1, fontSize: 15.5, color: t.ink }}>{tr('sendKey')}</Text>
          <View style={{ flexDirection: 'row', backgroundColor: t.card2, borderRadius: 12, padding: 3, gap: 3 }}>
            {(['enter', 'shift-enter', 'ctrl-enter'] as SendKey[]).map(x => (
              <TouchableOpacity key={x} onPress={() => setSendKey(x)}
                style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: sendKey === x ? t.card : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: sendKey === x ? '600' : '500', color: sendKey === x ? t.ink : t.ink2 }}>{x === 'enter' ? 'Enter' : x === 'shift-enter' ? 'Shift+↵' : 'Ctrl+↵'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Group>

      <SectionLabel t={t}>{tr('connectedClis')}</SectionLabel>
      <Group t={t}>
        {cliStatus.map(c => (
          <Row key={c.agent} t={t}
            icon={<Text style={{ fontWeight: '700', fontSize: 12, color: t.ink2 }}>{c.agent === 'codex' ? 'C' : c.agent === 'claude' ? '✻' : '◈'}</Text>}
            label={c.agent === 'codex' ? 'Codex' : c.agent === 'claude' ? 'Claude Code' : 'Cursor Agent'}
            sub={c.installed ? c.version : 'not found'}
            right={<StatusDot status={c.installed ? 'ok' : 'error'} theme={t} />} />
        ))}
        {cliStatus.length === 0 && <Row t={t} label="Detecting…" />}
      </Group>

      <SectionLabel t={t}>{tr('server')}</SectionLabel>
      <Group t={t}>
        <Row t={t} icon={<Text style={{ color: t.ink2 }}>⌂</Text>} label={profile?.machine || 'server'} sub={profile?.url}
          right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><StatusDot status={status === 'online' ? 'ok' : 'idle'} theme={t} /><Text style={{ fontSize: 13, color: t.ink2 }}>{status}</Text></View>} />
        <Row t={t} icon={<Text style={{ color: t.ink2 }}>☁</Text>} label={tr('tunnelRelay')} right={<Text style={{ fontSize: 13, color: t.ink3 }}>via CLI ›</Text>} />
        <TouchableOpacity onPress={disconnect}>
          <Row t={t} icon={<Text style={{ color: t.ink2 }}>⎋</Text>} label={<Text style={{ color: t.err }}>{tr('disconnect')}</Text>} />
        </TouchableOpacity>
      </Group>

      <SectionLabel t={t}>{tr('about')}</SectionLabel>
      <Group t={t}>
        <Row t={t} icon={<Text style={{ color: t.ink2 }}>◍</Text>} label="Orbix" right={<Text style={{ fontSize: 13, color: t.ink3 }}>v0.1.0</Text>} />
      </Group>
    </ScrollView>
  );
}

function SectionLabel({ children, t }: { children: React.ReactNode; t: Theme }) {
  return <Text style={{ fontSize: 14, color: t.ink2, fontWeight: '500', paddingTop: 20, paddingBottom: 8 }}>{children}</Text>;
}
function Group({ children, t }: { children: React.ReactNode; t: Theme }) {
  return (
    <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, overflow: 'hidden' }}>
      {React.Children.map(children, (child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.line2 } : undefined}>{child}</View>
      ))}
    </View>
  );
}
function Row({ icon, label, sub, right, t }: { icon?: React.ReactNode; label: React.ReactNode; sub?: string; right?: React.ReactNode; t: Theme }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      {icon && <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>}
      <View style={{ flex: 1 }}>
        {typeof label === 'string' ? <Text style={{ fontSize: 15.5, color: t.ink }}>{label}</Text> : label}
        {sub && <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}
