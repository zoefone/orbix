import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrbix } from '../store';
import type { Theme } from '../theme';
import type { AgentKind, Session } from '../types';
import type { NavProp } from '../navigation';
import { useT } from '../i18n';
import { AgentMark, Chip, StatusDot, StatusText } from '../components/ui';

export default function SessionsScreen({ theme }: { theme: Theme }) {
  const { sessions, native, refreshNative, client, refreshSessions, profile, status } = useOrbix();
  const tr = useT();
  const nav = useNavigation<NavProp>();
  const [filter, setFilter] = useState<AgentKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => { void refreshNative(); }, []);

  const filtered = useMemo(() => {
    let list = sessions.filter(s => !s.archived);
    if (filter !== 'all') list = list.filter(s => s.agent === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.title.toLowerCase().includes(q) || s.project.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, filter, search]);

  const pinned = filtered.filter(s => s.pinned);
  const unpinned = filtered.filter(s => !s.pinned);
  const today = unpinned.filter(s => Date.now() - s.updatedAt < 86400_000);
  const older = unpinned.filter(s => Date.now() - s.updatedAt >= 86400_000);

  const t = theme;

  type Row = { kind: 'label'; label: string } | { kind: 'session'; session: Session } | { kind: 'native'; item: (typeof native)[0] } | { kind: 'empty' };
  const rows: Row[] = [];
  if (pinned.length) { rows.push({ kind: 'label', label: tr('pinned') }); pinned.forEach(s => rows.push({ kind: 'session', session: s })); }
  if (today.length) { rows.push({ kind: 'label', label: tr('today') }); today.forEach(s => rows.push({ kind: 'session', session: s })); }
  if (older.length) { rows.push({ kind: 'label', label: tr('earlier') }); older.forEach(s => rows.push({ kind: 'session', session: s })); }
  if (!filtered.length) rows.push({ kind: 'empty' });
  if (native.length) {
    rows.push({ kind: 'label', label: tr('onThisMachine') });
    native.slice(0, 12).forEach(item => rows.push({ kind: 'native', item }));
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => r.kind === 'session' ? r.session.id : r.kind === 'native' ? r.item.agent + r.item.nativeId : r.kind + i}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: t.bg, fontWeight: '700', fontSize: 14 }}>◍</Text>
                </View>
                <Text style={{ fontSize: 19, fontWeight: '700', color: t.ink }}>Orbix</Text>
                <StatusDot status={status === 'online' ? 'ok' : 'idle'} theme={t} />
                <Text style={{ fontSize: 11, color: t.ink3, fontFamily: undefined }}>{profile?.machine}</Text>
              </View>
              <TouchableOpacity onPress={() => nav.navigate('Settings')}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, color: t.ink }}>☰</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 30, fontWeight: '700', color: t.ink, letterSpacing: -0.5, paddingVertical: 10 }}>{tr('allWorkspaces')}</Text>
            <TextInput value={search} onChangeText={setSearch} placeholder={tr('searchSessions')} placeholderTextColor={t.ink3}
              style={{ backgroundColor: t.card2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: t.ink, marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} theme={t} />
              {(['codex', 'claude', 'cursor'] as AgentKind[]).map(a => (
                <Chip key={a} label={a === 'codex' ? 'Codex' : a === 'claude' ? 'Claude' : 'Cursor'} active={filter === a} onPress={() => setFilter(a)} theme={t}>
                  <AgentMark agent={a} size={15} theme={t} />
                </Chip>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'label') return <Text style={{ fontSize: 14, color: t.ink2, fontWeight: '500', paddingTop: 20, paddingBottom: 6 }}>{item.label}</Text>;
          if (item.kind === 'empty') return <Text style={{ textAlign: 'center', color: t.ink3, paddingVertical: 60, fontSize: 14 }}>{tr('noSessions')}</Text>;
          if (item.kind === 'native') {
            const n = item.item;
            return (
              <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: t.line2, alignItems: 'flex-start' }}>
                <AgentMark agent={n.agent} theme={t} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15.5, color: t.ink2 }}>{n.title}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.ink3, marginTop: 2 }}>{n.cwd}</Text>
                </View>
                <TouchableOpacity onPress={async () => {
                  const sess = await client!.call<Session>({ cmd: 'session.import', agent: n.agent, nativeId: n.nativeId, cwd: n.cwd, title: n.title, model: n.model });
                  await refreshSessions();
                  nav.navigate('Chat', { sessionId: sess.id });
                }}>
                  <Text style={{ color: t.accent, fontWeight: '600', fontSize: 13, marginTop: 4 }}>{tr('importAction')}</Text>
                </TouchableOpacity>
              </View>
            );
          }
          return <SessionRow session={item.session} theme={t} onPress={() => nav.navigate('Chat', { sessionId: item.session.id })} />;
        }}
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 22, paddingTop: 8 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.card,
          borderWidth: 1, borderColor: t.line, borderRadius: 26, padding: 6, paddingLeft: 8,
        }}>
          <TouchableOpacity onPress={() => nav.navigate('NewSession', {})}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, color: t.ink2 }}>＋</Text>
          </TouchableOpacity>
          <TextInput value={prompt} onChangeText={setPrompt} placeholder={tr('planAskBuild')} placeholderTextColor={t.ink3}
            style={{ flex: 1, fontSize: 16, color: t.ink, paddingHorizontal: 6 }}
            onSubmitEditing={() => { if (prompt.trim()) { nav.navigate('NewSession', { presetPrompt: prompt.trim() }); setPrompt(''); } }}
            returnKeyType="send" />
          {prompt.trim() ? (
            <TouchableOpacity onPress={() => { nav.navigate('NewSession', { presetPrompt: prompt.trim() }); setPrompt(''); }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.bg, fontSize: 16 }}>↑</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function SessionRow({ session, theme, onPress }: { session: Session; theme: Theme; onPress: () => void }) {
  const tr = useT();
  const t = theme;
  const passed = session.status === 'idle' && (session.diffAdded > 0 || session.diffRemoved > 0);
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.line2, alignItems: 'flex-start' }}>
      <AgentMark agent={session.agent} theme={t} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16.5, fontWeight: '500', color: t.ink }}>{session.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13.5, color: t.ink2 }}>{session.project}</Text>
          <Text style={{ fontSize: 13.5, color: t.ink3 }}>·</Text>
          {session.status === 'running' ? (
            <><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent }} /><StatusText status={session.status} theme={t} /></>
          ) : session.status === 'awaiting_approval' ? (
            <StatusText status={session.status} theme={t} />
          ) : passed ? (
            <Text style={{ fontSize: 13.5, color: t.ok, fontWeight: '600' }}>{tr('passed')}</Text>
          ) : (
            <Text style={{ fontSize: 13.5, color: t.ink3 }}>{tr('noChanges')}</Text>
          )}
          {session.origin === 'imported' && <><Text style={{ fontSize: 13.5, color: t.ink3 }}>·</Text><Text style={{ fontSize: 13.5, color: t.ink3 }}>{tr('imported')}</Text></>}
          {(session.diffAdded > 0 || session.diffRemoved > 0) && (
            <>
              <Text style={{ fontSize: 13.5, color: t.ink3 }}>·</Text>
              <Text style={{ fontSize: 13.5, color: t.ok, fontWeight: '600' }}>+{session.diffAdded}</Text>
              <Text style={{ fontSize: 13.5, color: t.err, fontWeight: '600' }}>-{session.diffRemoved}</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
