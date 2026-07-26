import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOrbix } from '../store';
import type { Theme } from '../theme';
import type { AgentKind, PermissionMode, Session } from '../types';
import type { NavProp } from '../navigation';
import OptionPill from '../components/OptionSheet';
import { useT } from '../i18n';
import { AgentMark, agentName } from '../components/ui';

const DEFAULT_MODELS: Record<AgentKind, string> = { codex: '', claude: '', cursor: 'composer-2.5' };

export default function NewSessionScreen({ theme }: { theme: Theme }) {
  const t = theme;
  const nav = useNavigation<NavProp>();
  const route = useRoute();
  const params = (route.params || {}) as { presetPrompt?: string };
  const { client, refreshSessions, capabilities, refreshCapabilities } = useOrbix();
  const tr = useT();
  const [agent, setAgent] = useState<AgentKind>('codex');
  const [cwd, setCwd] = useState('/root');
  const [dirInfo, setDirInfo] = useState<{ path: string; parent: string; dirs: string[] } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [effort, setEffort] = useState('');
  const [speed, setSpeed] = useState('');
  const [cursorMode, setCursorMode] = useState('');
  const [mode, setMode] = useState<PermissionMode>('default');
  const [prompt, setPrompt] = useState(params.presetPrompt || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { void loadDir('/root'); }, []);
  useEffect(() => { void refreshCapabilities(agent); }, [agent]);
  const caps = capabilities[agent];

  // restore per-agent prefs
  useEffect(() => {
    void AsyncStorage.getItem('orbix-prefs-' + agent).then(raw => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        setModel(p.model || ''); setEffort(p.effort || ''); setSpeed(p.speed || '');
        setCursorMode(p.mode || ''); setMode(p.permissionMode || 'default');
      } catch { }
    });
  }, [agent]);

  async function loadDir(path: string) {
    try {
      const res = await client!.call<{ path: string; parent: string; dirs: string[] }>({ cmd: 'fs.list', path });
      setDirInfo(res);
      setCwd(res.path);
    } catch { }
  }

  async function start() {
    if (!client) return;
    setBusy(true); setError('');
    try {
      const finalModel = model === '__custom__' ? customModel.trim() : model;
      void AsyncStorage.setItem('orbix-prefs-' + agent, JSON.stringify({
        model: finalModel || undefined, effort: effort || undefined, speed: speed || undefined,
        mode: cursorMode || undefined, permissionMode: mode,
      }));
      const sess = await client.call<Session>({
        cmd: 'session.create', agent, cwd, model: finalModel || undefined, permissionMode: mode, prompt: prompt.trim() || undefined,
      });
      if (effort || speed || cursorMode) {
        await client.call({ cmd: 'session.update', id: sess.id, patch: { effort: effort || undefined, speed: speed || undefined, mode: cursorMode || undefined } });
      }
      await refreshSessions();
      nav.navigate('Chat', { sessionId: sess.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
          <TouchableOpacity onPress={() => nav.goBack()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, color: t.ink2 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '600', color: t.ink }}>{tr('newSession')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={{ fontSize: 14, color: t.ink2, fontWeight: '500', paddingVertical: 8 }}>{tr('agent')}</Text>
        {(['codex', 'claude', 'cursor'] as AgentKind[]).map(a => (
          <TouchableOpacity key={a} onPress={() => { setAgent(a); setModel(DEFAULT_MODELS[a]); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.card,
              borderWidth: 1.5, borderColor: agent === a ? t.ink : t.line, borderRadius: 18, padding: 16, marginBottom: 10,
            }}>
            <AgentMark agent={a} size={44} theme={t} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16.5, fontWeight: '600', color: t.ink }}>{agentName(a)}</Text>
              <Text style={{ fontSize: 13, color: t.ink2, marginTop: 2 }}>{a === 'codex' ? 'OpenAI · app-server' : a === 'claude' ? 'Anthropic · Agent SDK' : 'ACP · stream-json'}</Text>
            </View>
            <View style={{
              width: 22, height: 22, borderRadius: 11, borderWidth: 2,
              borderColor: agent === a ? t.ink : t.ink3,
              backgroundColor: agent === a ? t.ink : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {agent === a && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.card }} />}
            </View>
          </TouchableOpacity>
        ))}

        <Text style={{ fontSize: 13.5, color: t.ink2, fontWeight: '500', marginTop: 14, marginBottom: 8 }}>{tr('projectDir')}</Text>
        <TouchableOpacity onPress={() => setBrowsing(b => !b)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text>📁</Text>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: t.ink, fontFamily: Platform.OS === 'android' ? 'monospace' : undefined }}>{cwd}</Text>
          <Text style={{ color: t.ink3 }}>{browsing ? '⌃' : '›'}</Text>
        </TouchableOpacity>
        {browsing && dirInfo && (
          <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, marginTop: 8, overflow: 'hidden' }}>
            <TouchableOpacity onPress={() => loadDir(dirInfo.parent)} style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
              <Text style={{ fontSize: 14, color: t.ink2 }}>.. (up)</Text>
            </TouchableOpacity>
            {dirInfo.dirs.slice(0, 30).map(d => (
              <TouchableOpacity key={d} onPress={() => loadDir(dirInfo.path + '/' + d)} style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
                <Text style={{ fontSize: 14, color: t.ink, fontFamily: Platform.OS === 'android' ? 'monospace' : undefined }}>{d}/</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { setCwd(dirInfo.path); setBrowsing(false); }} style={{ paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: t.line2 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.accent }}>Use {dirInfo.path}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={{ fontSize: 13.5, color: t.ink2, fontWeight: '500', marginTop: 14, marginBottom: 8 }}>{tr('model')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <OptionPill theme={t}
            label={model === '__custom__' ? tr('customModel') : (caps?.models.find(m => m.id === model)?.name || model || tr('cliDefault'))}
            options={[...(caps?.models || []).map(m => ({ id: m.id, label: m.name + (m.isDefault ? ' ★' : '') })), { id: '__custom__', label: tr('customModel') }]}
            value={model} onChange={setModel} />
          {model === '__custom__' && (
            <TextInput value={customModel} onChangeText={setCustomModel} placeholder="model id…" placeholderTextColor={t.ink3}
              style={{ flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: t.ink }} />
          )}
        </View>

        {!!caps?.efforts?.length && (
          <>
            <Text style={{ fontSize: 13.5, color: t.ink2, fontWeight: '500', marginTop: 14, marginBottom: 8 }}>{tr('effort')}</Text>
            <OptionPill theme={t} label={effort || tr('cliDefault')} options={caps.efforts.map(e => ({ id: e, label: e }))} value={effort} onChange={setEffort} />
          </>
        )}

        {!!caps?.speeds?.length && (
          <>
            <Text style={{ fontSize: 13.5, color: t.ink2, fontWeight: '500', marginTop: 14, marginBottom: 8 }}>{tr('speed')}</Text>
            <OptionPill theme={t} label={speed || tr('cliDefault')} options={caps.speeds.map(x => ({ id: x, label: x }))} value={speed} onChange={setSpeed} />
          </>
        )}

        {!!caps?.modes?.length && (
          <>
            <Text style={{ fontSize: 13.5, color: t.ink2, fontWeight: '500', marginTop: 14, marginBottom: 8 }}>{tr('cursorMode')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {caps.modes.map(m => (
                <TouchableOpacity key={m.id} onPress={() => setCursorMode(m.id)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1,
                    backgroundColor: cursorMode === m.id || (!cursorMode && m.id === 'agent') ? t.ink : 'transparent',
                    borderColor: cursorMode === m.id || (!cursorMode && m.id === 'agent') ? t.ink : t.line,
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: cursorMode === m.id || (!cursorMode && m.id === 'agent') ? t.bg : t.ink2 }}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={{ fontSize: 13.5, color: t.ink2, fontWeight: '500', marginTop: 14, marginBottom: 8 }}>{tr('permMode')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(caps?.permOptions?.length ? caps.permOptions : [
            { id: 'plan', label: 'Plan' }, { id: 'default', label: 'Default' }, { id: 'acceptEdits', label: 'Auto-edit' }, { id: 'bypass', label: 'YOLO' },
          ]).map(p => (
            <TouchableOpacity key={p.id} onPress={() => setMode(p.id as PermissionMode)}
              style={{
                paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1,
                backgroundColor: mode === p.id ? t.ink : 'transparent',
                borderColor: mode === p.id ? t.ink : t.line,
              }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: mode === p.id ? t.bg : t.ink2 }}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: 13.5, color: t.ink2, fontWeight: '500', marginTop: 14, marginBottom: 8 }}>{tr('initialPrompt')}</Text>
        <TextInput value={prompt} onChangeText={setPrompt} placeholder={tr('describeTask')} placeholderTextColor={t.ink3} multiline
          style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: t.ink, minHeight: 90, textAlignVertical: 'top' }} />

        {!!error && <Text style={{ color: t.err, fontSize: 13, marginTop: 8 }}>{error}</Text>}
        <TouchableOpacity onPress={start} disabled={busy}
          style={{ backgroundColor: t.ink, borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginTop: 18, opacity: busy ? 0.4 : 1 }}>
          <Text style={{ color: t.bg, fontSize: 16, fontWeight: '600' }}>{busy ? tr('starting') : tr('startSession')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
