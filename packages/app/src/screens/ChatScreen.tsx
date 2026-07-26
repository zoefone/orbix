import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Markdown from 'react-native-markdown-display';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useOrbix } from '../store';
import type { Theme } from '../theme';
import type { Attachment, Session, TimelineEvent } from '../types';
import type { NavProp } from '../navigation';
import OptionPill from '../components/OptionSheet';
import { useT } from '../i18n';
import { AgentMark, PillBtn, StatusText, timeAgo } from '../components/ui';

interface ToolState {
  toolId: string; kind: string; title: string; detail?: string; command?: string;
  status: 'running' | 'done' | 'error'; output?: string;
  diffPath?: string; diffAdded?: number; diffRemoved?: number; patch?: string;
}
interface PermState { requestId: string; tool: string; title: string; detail?: string; command?: string; resolved?: string }
interface Item {
  key: string; seq: number;
  kind: 'user' | 'agent' | 'reasoning' | 'tool' | 'permission' | 'turn';
  ev: TimelineEvent; tool?: ToolState; perm?: PermState;
}

function buildItems(events: TimelineEvent[]): Item[] {
  const items: Item[] = [];
  const toolMap = new Map<string, Item>();
  const permMap = new Map<string, Item>();
  for (const ev of events) {
    if (ev.type === 'tool_update') {
      const ex = toolMap.get(ev.toolId);
      if (ex?.tool) {
        Object.assign(ex.tool, {
          status: ev.status ?? ex.tool.status, output: ev.output ?? ex.tool.output,
          diffPath: ev.diffPath ?? ex.tool.diffPath, diffAdded: ev.diffAdded ?? ex.tool.diffAdded,
          diffRemoved: ev.diffRemoved ?? ex.tool.diffRemoved, patch: ev.patch ?? ex.tool.patch,
        });
        ex.seq = ev.seq;
      }
      continue;
    }
    if (ev.type === 'permission_resolved') {
      const p = permMap.get(ev.requestId);
      if (p?.perm) p.perm.resolved = ev.decision;
      continue;
    }
    if (ev.type === 'session_status') continue;
    const item: Item = {
      key: ev.id, seq: ev.seq,
      kind: ev.type === 'user_message' ? 'user' : ev.type === 'agent_message' ? 'agent' : ev.type === 'reasoning' ? 'reasoning' : ev.type === 'tool_call' ? 'tool' : ev.type === 'permission_request' ? 'permission' : 'turn',
      ev,
    };
    if (ev.type === 'tool_call') {
      item.tool = { toolId: ev.toolId, kind: ev.kind, title: ev.title, detail: ev.detail, command: ev.command, status: ev.status, output: ev.output, diffPath: ev.diffPath, diffAdded: ev.diffAdded, diffRemoved: ev.diffRemoved, patch: ev.patch };
      toolMap.set(ev.toolId, item);
    }
    if (ev.type === 'permission_request') {
      item.perm = { requestId: ev.requestId, tool: ev.tool, title: ev.title, detail: ev.detail, command: ev.command };
      permMap.set(ev.requestId, item);
    }
    items.push(item);
  }
  return items.sort((a, b) => a.seq - b.seq);
}

export default function ChatScreen({ theme }: { theme: Theme }) {
  const t = theme;
  const nav = useNavigation<NavProp>();
  const route = useRoute();
  const { sessionId } = route.params as { sessionId: string };
  const { sessions, timelines, loadTimeline, sendMessage, client, refreshSessions, capabilities, refreshCapabilities, sendKey } = useOrbix();
  const tr = useT();
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashArgs, setSlashArgs] = useState<Record<string, string>>({});
  const session = sessions.find(s => s.id === sessionId);
  const events = timelines[sessionId] || [];
  const items = useMemo(() => buildItems(events), [events]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachSheet, setAttachSheet] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => { void loadTimeline(sessionId); }, [sessionId]);
  useEffect(() => { if (session) void refreshCapabilities(session.agent); }, [session?.agent]);

  async function send() {
    if (!text.trim() && !attachments.length) return;
    const msg = text.trim();
    const att = attachments;
    setText(''); setAttachments([]);
    await sendMessage(sessionId, msg || '(attachment)', att);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 300);
  }

  async function pickImage() {
    setAttachSheet(false);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled || !client) return;
    setUploading(true);
    try {
      const files = res.assets.map(a => ({ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' }));
      const up = await client.upload(files);
      setAttachments(x => [...x, ...up]);
    } finally { setUploading(false); }
  }

  async function pickDocument() {
    setAttachSheet(false);
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !client) return;
    setUploading(true);
    try {
      const files = res.assets.map(a => ({ uri: a.uri, name: a.name, type: a.mimeType || 'application/octet-stream' }));
      const up = await client.upload(files);
      setAttachments(x => [...x, ...up]);
    } finally { setUploading(false); }
  }

  const busy = session?.status === 'running' || session?.status === 'awaiting_approval';
  const caps = session ? capabilities[session.agent] : undefined;
  const slashList = (caps?.slashCommands || []).filter(c => {
    const q = text.startsWith('/') ? text.slice(1).toLowerCase() : '';
    return !q || c.name.startsWith(q);
  });

  async function execSlash(name: string) {
    const args = slashArgs[name]?.trim();
    setSlashOpen(false); setText('');
    await client?.call({ cmd: 'command.exec', sessionId, command: name, args });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={i => i.key}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: t.line2, marginBottom: 8 }}>
              <TouchableOpacity onPress={() => nav.goBack()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22, color: t.ink2 }}>‹</Text>
              </TouchableOpacity>
              {session && <AgentMark agent={session.agent} size={26} theme={t} />}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: t.ink }}>{session?.title || 'Session'}</Text>
                <Text numberOfLines={1} style={{ fontSize: 11, color: t.ink3 }}>{session?.project}{session?.model ? ` · ${session.model}` : ''}</Text>
              </View>
              {session && <StatusText status={session.status} theme={t} />}
              <TouchableOpacity onPress={() => setMenuOpen(true)} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, color: t.ink2 }}>···</Text>
              </TouchableOpacity>
            </View>
            {!!session?.plan?.length && <PlanCard entries={session.plan} theme={t} tr={tr} />}
          </>
        }
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: t.ink3, paddingVertical: 60, fontSize: 14 }}>
          {session?.origin === 'imported' ? tr('importedHint') : tr('noMessages')}
        </Text>}
        renderItem={({ item }) => <RenderItem item={item} theme={t} sessionId={sessionId} />}
        ListFooterComponent={session?.status === 'running' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
            <Text style={{ fontSize: 13.5, color: t.ink3 }}>{tr('working')}</Text>
          </View>
        ) : null}
      />

      {attachments.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 6 }}>
          {attachments.map(a => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 6, paddingRight: 10 }}>
              {a.mime.startsWith('image/') && client ? (
                <Image source={{ uri: client.attachmentUrl(a) }} style={{ width: 36, height: 36, borderRadius: 10 }} />
              ) : (
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}><Text>📄</Text></View>
              )}
              <View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: t.ink }} numberOfLines={1}>{a.name}</Text>
                <Text style={{ fontSize: 11, color: t.ink3 }}>{(a.size / 1024).toFixed(0)} KB</Text>
              </View>
              <TouchableOpacity onPress={() => setAttachments(x => x.filter(y => y.id !== a.id))}><Text style={{ color: t.ink3, fontSize: 14, padding: 4 }}>✕</Text></TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={{ paddingHorizontal: 16, paddingBottom: 22, paddingTop: 6 }}>
        {/* top pills: usage / model / effort / speed / perm / mode */}
        {session && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8, flexWrap: 'wrap' }}>
            {session.usage && (
              <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: t.card2 }}>
                <Text style={{ fontSize: 11, color: t.ink2, fontFamily: Platform.OS === 'android' ? 'monospace' : undefined }}>
                  ⬒ {session.usage.percent !== undefined ? session.usage.percent + '% · ' : ''}{fmtTok(session.usage.totalTokens)}{session.usage.contextWindow ? '/' + fmtTok(session.usage.contextWindow) : ''}
                </Text>
              </View>
            )}
            {!!caps?.models?.length && (
              <OptionPill theme={t} label={caps.models.find(m => m.id === session.model)?.name || session.model || tr('cliDefault')}
                options={caps.models.map(m => ({ id: m.id, label: m.name }))} value={session.model}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { model: id } })} />
            )}
            {!!caps?.efforts?.length && (
              <OptionPill theme={t} label={`${tr('effort').toLowerCase()}: ${session.effort || 'default'}`}
                options={caps.efforts.map(e => ({ id: e, label: e }))} value={session.effort}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { effort: id } })} />
            )}
            {!!caps?.speeds?.length && (
              <OptionPill theme={t} label={`${tr('speed').toLowerCase()}: ${session.speed || 'default'}`}
                options={caps.speeds.map(x => ({ id: x, label: x }))} value={session.speed}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { speed: id } })} />
            )}
            {!!caps?.permOptions?.length && (
              <OptionPill theme={t} label={caps.permOptions.find(p => p.id === session.permissionMode)?.label || session.permissionMode}
                options={caps.permOptions.map(p => ({ id: p.id, label: p.label, hint: p.description }))} value={session.permissionMode}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { permissionMode: id as Session['permissionMode'] } })} />
            )}
            {!!caps?.modes?.length && (
              <OptionPill theme={t} label={`mode: ${session.mode || 'agent'}`}
                options={caps.modes.map(m => ({ id: m.id, label: m.name, hint: m.description }))} value={session.mode}
                onChange={id => client?.call({ cmd: 'session.update', id: sessionId, patch: { mode: id } })} />
            )}
          </View>
        )}

        {/* slash palette */}
        {slashOpen && slashList.length > 0 && (
          <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 16, marginBottom: 8, maxHeight: 260 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: t.ink3, paddingHorizontal: 14, paddingTop: 10 }}>{tr('slashTitle').toUpperCase()}</Text>
            <FlatList
              data={slashList}
              keyExtractor={c => c.name}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }) => (
                <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <TouchableOpacity onPress={() => { if (!c.needsArgs) void execSlash(c.name); }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: t.ink }}>/{c.name}</Text>
                    <Text style={{ fontSize: 12, color: t.ink3, marginTop: 1 }} numberOfLines={1}>{c.description}</Text>
                  </TouchableOpacity>
                  {!!c.needsArgs && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      <TextInput
                        value={slashArgs[c.name] || ''}
                        onChangeText={v => setSlashArgs(a => ({ ...a, [c.name]: v }))}
                        placeholder={tr('argsHint')} placeholderTextColor={t.ink3}
                        style={{ flex: 1, backgroundColor: t.card2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: t.ink }}
                        onSubmitEditing={() => void execSlash(c.name)} />
                      <TouchableOpacity onPress={() => void execSlash(c.name)}>
                        <Text style={{ color: t.accent, fontWeight: '700', fontSize: 14, paddingVertical: 6 }}>{tr('runCmd')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            />
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 26, padding: 6, paddingLeft: 8 }}>
          <TouchableOpacity onPress={() => setAttachSheet(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, color: t.ink2 }}>{uploading ? '…' : '＋'}</Text>
          </TouchableOpacity>
          <TextInput value={text} onChangeText={(v) => { setText(v); setSlashOpen(v.startsWith('/')); }} placeholder={tr('followUp')} placeholderTextColor={t.ink3}
            style={{ flex: 1, fontSize: 16, color: t.ink, paddingHorizontal: 6 }} onSubmitEditing={() => { if (sendKey === 'enter') void send(); }} returnKeyType="send" multiline={false} />
          {busy && (
            <TouchableOpacity onPress={() => client?.call({ cmd: 'turn.interrupt', sessionId })}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.dark ? '#3f1d1d' : '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.err, fontSize: 12 }}>■</Text>
            </TouchableOpacity>
          )}
          {text.trim() || attachments.length ? (
            <TouchableOpacity onPress={send} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.bg, fontSize: 16 }}>↑</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* attach sheet */}
      <Modal visible={attachSheet} transparent animationType="slide" onRequestClose={() => setAttachSheet(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setAttachSheet(false)}>
          <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.ink3, alignSelf: 'center', marginBottom: 16, opacity: 0.5 }} />
            <SheetRow icon="🖼" label="Photo Library" theme={t} onPress={pickImage} />
            <SheetRow icon="📁" label="Choose File" theme={t} onPress={pickDocument} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* session menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          {session && <SessionMenu session={session} theme={t} close={() => setMenuOpen(false)} refresh={refreshSessions} goBack={() => nav.goBack()} />}
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SheetRow({ icon, label, theme, onPress }: { icon: string; label: string; theme: Theme; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.card2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 17 }}>{icon}</Text>
      </View>
      <Text style={{ fontSize: 16, color: theme.ink }}>{label}</Text>
    </TouchableOpacity>
  );
}

function RenderItem({ item, theme, sessionId }: { item: Item; theme: Theme; sessionId: string }) {
  const t = theme;
  switch (item.kind) {
    case 'user': {
      const ev = item.ev as Extract<TimelineEvent, { type: 'user_message' }>;
      return (
        <View style={{ marginVertical: 5 }}>
          <View style={{ backgroundColor: t.bubble, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, marginLeft: 32 }}>
            <Text style={{ fontSize: 16, color: t.ink, lineHeight: 22 }}>{ev.text}</Text>
          </View>
          {ev.attachments?.map(a => (
            <View key={a.id} style={{ marginLeft: 32, marginTop: 6 }}>
              {a.mime.startsWith('image/') ? (
                <Image source={{ uri: useOrbix.getState().client?.attachmentUrl(a) }} style={{ width: 220, height: 160, borderRadius: 16, borderWidth: 1, borderColor: t.line }} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 8, alignSelf: 'flex-start' }}>
                  <Text>📄</Text><Text style={{ fontSize: 13, color: t.ink }}>{a.name}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      );
    }
    case 'agent': {
      const ev = item.ev as Extract<TimelineEvent, { type: 'agent_message' }>;
      const rules = {
        body: { color: t.ink, fontSize: 15.5, lineHeight: 23 },
        code_inline: { backgroundColor: t.card2, color: t.ink, borderRadius: 4, fontSize: 13.5 },
        fence: { backgroundColor: t.codeBg, color: t.ink2, borderColor: t.line, borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 12.5 },
        code_block: { backgroundColor: t.codeBg, color: t.ink2, borderColor: t.line, borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 12.5 },
        link: { color: t.accent },
        blockquote: { backgroundColor: 'transparent', borderLeftColor: t.line, borderLeftWidth: 2, paddingLeft: 10 },
        heading1: { fontSize: 19, fontWeight: '700' as const, color: t.ink },
        heading2: { fontSize: 17, fontWeight: '600' as const, color: t.ink },
        heading3: { fontSize: 15.5, fontWeight: '600' as const, color: t.ink },
      };
      return (
        <View style={{ marginVertical: 5 }}>
          <Markdown style={rules}>{ev.text || ''}</Markdown>
          {ev.streaming && <View style={{ width: 8, height: 16, backgroundColor: t.accent, borderRadius: 2, marginTop: 2 }} />}
        </View>
      );
    }
    case 'reasoning': {
      return <Reasoning text={(item.ev as Extract<TimelineEvent, { type: 'reasoning' }>).text} theme={t} />;
    }
    case 'tool':
      return <ToolCard tool={item.tool!} theme={t} />;
    case 'permission':
      return <ApprovalCard perm={item.perm!} theme={t} sessionId={sessionId} />;
    case 'turn': {
      const ev = item.ev as Extract<TimelineEvent, { type: 'turn_status' }>;
      if (ev.state === 'started') return null;
      return (
        <Text style={{ fontSize: 13.5, color: t.ink3, marginVertical: 10 }}>
          {ev.state === 'completed' ? `Finished · ${timeAgo(ev.ts)}` : ev.state === 'cancelled' ? 'Cancelled' : `Failed · ${ev.error || ''}`}
        </Text>
      );
    }
  }
}

function Reasoning({ text, theme }: { text: string; theme: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginVertical: 3 }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)}>
        <Text style={{ fontSize: 13, color: theme.ink3, fontStyle: 'italic' }}>{open ? '▾' : '▸'} Reasoning</Text>
      </TouchableOpacity>
      {open && <Text style={{ fontSize: 13, color: theme.ink3, fontStyle: 'italic', borderLeftWidth: 2, borderLeftColor: theme.line, paddingLeft: 10, marginTop: 4 }}>{text}</Text>}
    </View>
  );
}

const TOOL_ICON: Record<string, string> = { shell: '⌘', read: '📄', edit: '✎', write: '✎', search: '⌕', mcp: '⚡', web: '🌐', other: '⚙' };

function ToolCard({ tool, theme }: { tool: ToolState; theme: Theme }) {
  const t = theme;
  const [open, setOpen] = useState(false);
  const hasBody = !!(tool.command || tool.output || tool.patch);
  return (
    <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, marginVertical: 4, overflow: 'hidden' }}>
      <TouchableOpacity onPress={() => hasBody && setOpen(o => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11 }}>
        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: t.card2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, color: t.ink2 }}>{TOOL_ICON[tool.kind] || TOOL_ICON.other}</Text>
        </View>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '500', color: t.ink }}>{tool.title}</Text>
        {tool.diffAdded !== undefined && <Text style={{ fontSize: 12, fontWeight: '600', color: t.ok }}>+{tool.diffAdded}</Text>}
        {tool.diffRemoved !== undefined && <Text style={{ fontSize: 12, fontWeight: '600', color: t.err }}>-{tool.diffRemoved}</Text>}
        {tool.status === 'running'
          ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
          : <Text style={{ fontSize: 12, color: tool.status === 'error' ? t.err : t.ink3 }}>{tool.status === 'done' ? '✓' : '✗'}</Text>}
        {hasBody && <Text style={{ fontSize: 10, color: t.ink3 }}>{open ? '▾' : '▸'}</Text>}
      </TouchableOpacity>
      {open && hasBody && (
        <View style={{ borderTopWidth: 1, borderTopColor: t.line2, backgroundColor: t.codeBg, paddingHorizontal: 13, paddingVertical: 10 }}>
          {!!tool.command && <Text style={{ fontFamily: Platform.OS === 'android' ? 'monospace' : undefined, fontSize: 12, color: t.ink2 }}>$ {tool.command}</Text>}
          {!!tool.patch && (
            <View style={{ marginTop: 4 }}>
              {tool.patch.split('\n').slice(0, 40).map((l, i) => (
                <Text key={i} style={{ fontFamily: Platform.OS === 'android' ? 'monospace' : undefined, fontSize: 12, color: l.startsWith('+') ? t.ok : l.startsWith('-') ? t.err : t.ink3 }}>{l}</Text>
              ))}
            </View>
          )}
          {!!tool.output && <Text numberOfLines={20} style={{ fontFamily: Platform.OS === 'android' ? 'monospace' : undefined, fontSize: 12, color: t.ink2, marginTop: 4 }}>{tool.output}</Text>}
        </View>
      )}
    </View>
  );
}

function ApprovalCard({ perm, theme, sessionId }: { perm: PermState; theme: Theme; sessionId: string }) {
  const t = theme;
  const { client } = useOrbix();
  const resolved = perm.resolved;
  return (
    <View style={{
      borderWidth: 1, borderRadius: 18, padding: 14, marginVertical: 6,
      borderColor: resolved ? t.line : t.warn,
      backgroundColor: resolved ? t.card : (t.dark ? 'rgba(217,119,6,0.08)' : '#FFFBEB'),
      opacity: resolved ? 0.7 : 1,
    }}>
      <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.ink }}>⚠ {resolved ? `Approval ${resolved === 'deny' ? 'denied' : 'granted'}` : 'Approval needed'}</Text>
      <Text style={{ fontSize: 14, color: t.ink2, marginTop: 4 }}>{perm.title}</Text>
      {!!perm.command && (
        <View style={{ backgroundColor: t.codeBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 }}>
          <Text style={{ fontFamily: Platform.OS === 'android' ? 'monospace' : undefined, fontSize: 12.5, color: t.ink }}>$ {perm.command}</Text>
        </View>
      )}
      {!resolved && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <PillBtn label="Approve" primary theme={t} flex onPress={() => client?.call({ cmd: 'permission.respond', sessionId, requestId: perm.requestId, decision: 'allow' })} />
          <PillBtn label="Always" theme={t} flex onPress={() => client?.call({ cmd: 'permission.respond', sessionId, requestId: perm.requestId, decision: 'allow_session' })} />
          <PillBtn label="Deny" danger theme={t} flex onPress={() => client?.call({ cmd: 'permission.respond', sessionId, requestId: perm.requestId, decision: 'deny' })} />
        </View>
      )}
    </View>
  );
}

function SessionMenu({ session, theme, close, refresh, goBack }: { session: Session; theme: Theme; close: () => void; refresh: () => Promise<void>; goBack: () => void }) {
  const t = theme;
  const { client } = useOrbix();
  const modes = [
    { id: 'plan', label: 'Plan' }, { id: 'default', label: 'Default' }, { id: 'acceptEdits', label: 'Auto-edit' }, { id: 'bypass', label: 'YOLO' },
  ] as const;
  return (
    <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 }}>
      <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.ink3, alignSelf: 'center', marginBottom: 16, opacity: 0.5 }} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: t.ink3, letterSpacing: 0.4, marginBottom: 8 }}>PERMISSION MODE</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {modes.map(m => (
          <TouchableOpacity key={m.id} onPress={async () => { await client?.call({ cmd: 'session.update', id: session.id, patch: { permissionMode: m.id } }); }}
            style={{
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1,
              backgroundColor: session.permissionMode === m.id ? t.ink : 'transparent',
              borderColor: session.permissionMode === m.id ? t.ink : t.line,
            }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: session.permissionMode === m.id ? t.bg : t.ink2 }}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <MenuRow label={session.pinned ? 'Unpin session' : 'Pin session'} theme={t} onPress={async () => { await client?.call({ cmd: 'session.update', id: session.id, patch: { pinned: !session.pinned } }); close(); }} />
      <MenuRow label="Rename" theme={t} onPress={() => {
        Alert.prompt?.('Rename session', undefined, async (title) => { if (title) await client?.call({ cmd: 'session.update', id: session.id, patch: { title } }); });
        close();
      }} />
      <MenuRow label="Archive" theme={t} onPress={async () => { await client?.call({ cmd: 'session.update', id: session.id, patch: { archived: true } }); await refresh(); close(); goBack(); }} />
      <MenuRow label="Delete" danger theme={t} onPress={async () => { await client?.call({ cmd: 'session.delete', id: session.id }); await refresh(); close(); goBack(); }} />
    </View>
  );
}

function MenuRow({ label, theme, onPress, danger }: { label: string; theme: Theme; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 13 }}>
      <Text style={{ fontSize: 16, color: danger ? theme.err : theme.ink }}>{label}</Text>
    </TouchableOpacity>
  );
}


function fmtTok(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function PlanCard({ entries, theme, tr }: { entries: Array<{ content: string; status?: string }>; theme: Theme; tr: (k: never) => string }) {
  const t = theme;
  const [open, setOpen] = useState(true);
  return (
    <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 12, marginBottom: 8 }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.ink2 }}>{open ? '▾' : '▸'} 📋 {tr('planStatus' as never)} ({entries.filter(e => e.status === 'completed').length}/{entries.length})</Text>
      </TouchableOpacity>
      {open && entries.map((e, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
          <Text style={{ color: e.status === 'completed' ? t.ok : e.status === 'in_progress' ? t.accent : t.ink3, fontSize: 13 }}>
            {e.status === 'completed' ? '✓' : e.status === 'in_progress' ? '◐' : '○'}
          </Text>
          <Text style={{ fontSize: 14, color: e.status === 'completed' ? t.ink3 : t.ink, textDecorationLine: e.status === 'completed' ? 'line-through' : 'none' }}>{e.content}</Text>
        </View>
      ))}
    </View>
  );
}
