import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { getTheme, OrbixTheme, OrbixThemePreference } from './src/theme';
import { Machine, OrbixClient, ProviderId } from './src/orbixClient';
import { configureNotifications, notifyLocal } from './src/notifications';

const providers: Array<{ id: ProviderId; label: string; short: string; supportsImages: boolean }> = [
  { id: 'codex', label: 'Codex', short: 'CX', supportsImages: true },
  { id: 'claude', label: 'Claude Code', short: 'CC', supportsImages: false },
  { id: 'cursor', label: 'Cursor Agent', short: 'CU', supportsImages: false }
];

type Screen = 'workspaces' | 'session' | 'new' | 'files' | 'terminal' | 'settings';
type ConnectionMode = 'server' | 'direct';

function splitArgs(text: string) {
  return (text.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) || []).map((item) => item.replace(/^["']|["']$/g, ''));
}

function shortTime(value?: string) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return value; }
}

function providerLabel(provider: ProviderId) {
  return providers.find((item) => item.id === provider)?.label || provider;
}

function toneStyle(theme: OrbixTheme, tone: 'muted' | 'info' | 'warn' | 'danger') {
  if (tone === 'info') return { color: theme.colors.modeBlue, borderColor: theme.colors.modeBlue, backgroundColor: theme.colors.modeBlueBg };
  if (tone === 'warn') return { color: theme.colors.warning, borderColor: theme.colors.warning, backgroundColor: theme.colors.bgSoft };
  if (tone === 'danger') return { color: theme.colors.danger, borderColor: theme.colors.danger, backgroundColor: theme.colors.diffDelBg };
  return { color: theme.colors.textMuted, borderColor: theme.colors.border, backgroundColor: theme.colors.bgSoft };
}

function StatusPill({ theme, text, tone = 'muted' }: { theme: OrbixTheme; text: string; tone?: 'muted' | 'info' | 'warn' | 'danger' }) {
  return <Text style={[pillBase(theme), toneStyle(theme, tone)]}>{text}</Text>;
}

function pillBase(theme: OrbixTheme) {
  return {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden' as const,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: '700' as const,
    color: theme.colors.textMuted
  };
}

function DiffStat({ theme, add = 0, del = 0 }: { theme: OrbixTheme; add?: number; del?: number }) {
  return <Text style={{ fontSize: 12 }}> <Text style={{ color: theme.colors.diffAdd }}>+{add}</Text> <Text style={{ color: theme.colors.diffDel }}>-{del}</Text></Text>;
}

export default function App() {
  const systemScheme = useColorScheme();
  const [themePref, setThemePref] = useState<OrbixThemePreference>('system');
  const theme = useMemo(() => getTheme(themePref, systemScheme === 'dark' ? 'dark' : 'light'), [themePref, systemScheme]);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [screen, setScreen] = useState<Screen>('workspaces');
  const [mode, setMode] = useState<ConnectionMode>('server');
  const [controlUrl, setControlUrl] = useState('http://127.0.0.1:7320');
  const [token, setToken] = useState('');
  const [machineId, setMachineId] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [provider, setProvider] = useState<ProviderId>('codex');
  const [cwd, setCwd] = useState('/root');
  const [prompt, setPrompt] = useState('');
  const [jobArgs, setJobArgs] = useState('--help');
  const [terminal, setTerminal] = useState('Connect a machine, then start or sync a persistent CLI session.');
  const [status, setStatus] = useState('idle');
  const [approvals, setApprovals] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [turns, setTurns] = useState<any[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const effectiveBaseUrl = mode === 'server' && machineId
    ? `${controlUrl.replace(/\/$/, '')}/api/machines/${encodeURIComponent(machineId)}/daemon`
    : controlUrl;
  const serverClient = useMemo(() => new OrbixClient(controlUrl, token), [controlUrl, token]);
  const client = useMemo(() => new OrbixClient(effectiveBaseUrl, token), [effectiveBaseUrl, token]);

  useEffect(() => { void configureNotifications(); }, []);

  async function run(action: () => Promise<any>) {
    try {
      setBusy(true);
      await action();
    } catch (error: any) {
      Alert.alert('Orbix', error.message || String(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshMachines() {
    const data = await serverClient.listMachines();
    setMachines(data.machines || []);
  }

  async function refreshSnapshot(activeProvider = provider) {
    const snap = await client.snapshot(activeProvider);
    setTerminal(snap.output || '(empty)');
    setStatus(snap.analysis?.status || 'working');
  }

  async function refreshSidePanels(activeProvider = provider) {
    const [sessionData, approvalData, jobData, turnData, fileData] = await Promise.all([
      client.listSessions().catch(() => ({ providers: [] })),
      client.approvals(activeProvider).catch(() => ({ approvals: [] })),
      client.listJobs(activeProvider).catch(() => ({ jobs: [] })),
      client.listStructuredTurns(activeProvider).catch(() => ({ turns: [] })),
      client.listFiles(activeProvider).catch(() => ({ uploads: [] }))
    ]);
    setSessions(sessionData.providers || []);
    setApprovals((approvalData.approvals || []).filter((item) => item.status === 'pending').reverse().slice(0, 8));
    setJobs((jobData.jobs || []).slice(0, 8));
    setTurns((turnData.turns || []).slice(0, 8));
    setUploads((fileData.uploads || uploads).slice(0, 20));
  }

  async function refreshAll(activeProvider = provider) {
    if (mode === 'server' && !machineId) {
      await refreshMachines();
      return;
    }
    await refreshSnapshot(activeProvider);
    await refreshSidePanels(activeProvider);
  }

  async function startSession(activeProvider = provider, initialPrompt = '') {
    await client.startSession(activeProvider, cwd);
    if (initialPrompt.trim()) await client.send(activeProvider, initialPrompt.trim());
    setProvider(activeProvider);
    setScreen('session');
    await notifyLocal('Orbix session started', `${providerLabel(activeProvider)} keeps running after disconnect.`);
    await refreshAll(activeProvider);
  }

  async function pickAndUpload() {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const completed: any[] = [];
    for (const asset of result.assets) {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const upload = await client.upload(provider, asset.name || 'upload.bin', base64, asset.mimeType || '');
      completed.push({ ...(upload.upload || upload), name: asset.name, size: asset.size, mimeType: asset.mimeType });
    }
    setUploads((current) => [...completed, ...current].slice(0, 20));
    await client.send(provider, `Uploaded files on target machine:\n${completed.map((item) => item.path).join('\n')}`).catch(() => {});
    await notifyLocal('Orbix upload complete', completed.map((item) => item.path).join('\n'));
    await refreshSidePanels(provider);
  }

  const selectedProvider = providers.find((item) => item.id === provider)!;
  const selectedSession = sessions.find((item) => item.id === provider);
  const taskRows = providers.map((item) => {
    const session = sessions.find((entry) => entry.id === item.id);
    const pending = approvals.filter((approval) => approval.provider === item.id).length;
    const latestTurn = turns.find((turn) => turn.provider === item.id);
    const latestJob = jobs.find((job) => job.provider === item.id);
    return {
      provider: item.id,
      label: item.label,
      title: session?.running ? `${item.label} remote session` : `Start ${item.label}`,
      project: session?.lastKnown?.cwd || 'orbix workspace',
      status: pending ? 'attention' : session?.running ? 'working' : 'idle',
      updatedAt: session?.lastKnown?.updatedAt || latestTurn?.createdAt || latestJob?.createdAt,
      add: latestTurn?.eventCount || 0,
      del: latestJob?.stderrBytes ? Math.max(1, Math.round(latestJob.stderrBytes / 128)) : 0
    };
  });

  const navItems: Array<{ id: Screen; label: string; glyph: string }> = [
    { id: 'workspaces', label: 'Work', glyph: '⌘' },
    { id: 'new', label: 'New', glyph: '+' },
    { id: 'files', label: 'Files', glyph: '□' },
    { id: 'terminal', label: 'Term', glyph: '>' },
    { id: 'settings', label: 'Set', glyph: '◌' }
  ];

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Orbix Remote Control</Text>
          <Text style={styles.title}>{screenTitle(screen, provider)}</Text>
        </View>
        <View style={styles.headerPills}>
          <StatusPill theme={theme} text={mode === 'server' ? (machineId || 'choose machine') : 'direct'} tone={mode === 'server' && machineId ? 'info' : 'muted'} />
          <StatusPill theme={theme} text={busy ? 'working' : status} tone={status === 'attention' ? 'warn' : status === 'idle' ? 'muted' : 'info'} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {screen === 'workspaces' ? <WorkspacesScreen theme={theme} styles={styles} rows={taskRows} machines={machines} machineId={machineId} onSelectProvider={(id: ProviderId) => { setProvider(id); setScreen('session'); void run(() => refreshAll(id)); }} onSelectMachine={(machine: Machine) => { setMode('server'); setMachineId(machine.machineId); }} onRefresh={() => run(refreshAll)} onNew={() => setScreen('new')} onSettings={() => setScreen('settings')} /> : null}
        {screen === 'session' ? <SessionScreen theme={theme} styles={styles} provider={provider} selectedProvider={selectedProvider} selectedSession={selectedSession} terminal={terminal} prompt={prompt} setPrompt={setPrompt} approvals={approvals} turns={turns} jobs={jobs} busy={busy} onSend={() => run(async () => { if (!prompt.trim()) return; await client.send(provider, prompt.trim()); setPrompt(''); await refreshAll(provider); })} onStart={() => run(() => startSession(provider))} onStop={() => run(async () => { await client.stopSession(provider); setStatus('idle'); await refreshAll(provider); })} onKey={(key: string) => run(async () => { await client.keys(provider, [key]); await refreshAll(provider); })} onApproval={(item: any, response: any) => run(async () => { await client.respondApproval(item.id, response); await refreshSidePanels(provider); })} onStructured={() => run(async () => { if (!prompt.trim()) return; await client.runStructuredTurn(provider, prompt.trim(), cwd); await refreshSidePanels(provider); })} onKillJob={(job: any) => run(async () => { await client.killJob(job.id); await refreshSidePanels(provider); })} onFiles={() => setScreen('files')} /> : null}
        {screen === 'new' ? <NewScreen theme={theme} styles={styles} provider={provider} setProvider={setProvider} cwd={cwd} setCwd={setCwd} prompt={prompt} setPrompt={setPrompt} busy={busy} onStart={() => run(() => startSession(provider, prompt))} /> : null}
        {screen === 'files' ? <FilesScreen theme={theme} styles={styles} uploads={uploads} onPick={() => run(pickAndUpload)} /> : null}
        {screen === 'terminal' ? <TerminalScreen theme={theme} styles={styles} provider={provider} setProvider={setProvider} terminal={terminal} jobArgs={jobArgs} setJobArgs={setJobArgs} onKey={(key: string) => run(async () => { await client.keys(provider, [key]); await refreshAll(provider); })} onRunJob={() => run(async () => { await client.runJob(provider, splitArgs(jobArgs || '--help'), cwd); await refreshSidePanels(provider); })} /> : null}
        {screen === 'settings' ? <SettingsScreen theme={theme} styles={styles} mode={mode} setMode={setMode} controlUrl={controlUrl} setControlUrl={setControlUrl} token={token} setToken={setToken} machineId={machineId} setMachineId={setMachineId} machines={machines} themePref={themePref} setThemePref={setThemePref} cwd={cwd} setCwd={setCwd} onLoadMachines={() => run(refreshMachines)} /> : null}
      </ScrollView>

      <View style={styles.navBar}>
        {navItems.map((item) => <Pressable key={item.id} onPress={() => setScreen(item.id)} style={[styles.navItem, screen === item.id && styles.navItemActive]}><Text style={[styles.navGlyph, screen === item.id && styles.navTextActive]}>{item.glyph}</Text><Text style={[styles.navText, screen === item.id && styles.navTextActive]}>{item.label}</Text></Pressable>)}
      </View>
    </SafeAreaView>
  );
}

function screenTitle(screen: Screen, provider: ProviderId) {
  if (screen === 'session') return `${providerLabel(provider)} Session`;
  if (screen === 'new') return 'Start an agent';
  if (screen === 'files') return 'Files & media';
  if (screen === 'terminal') return 'Terminal control';
  if (screen === 'settings') return 'Settings';
  return 'All Workspaces';
}

function WorkspacesScreen({ theme, styles, rows, machines, machineId, onSelectProvider, onSelectMachine, onRefresh, onNew, onSettings }: any) {
  return <View style={styles.pageGap}>
    <View style={styles.heroCard}><Text style={styles.sectionLabel}>Build from anywhere</Text><Text style={styles.heroTitle}>Kick off new agents and manage existing ones.</Text><Text style={styles.help}>Black, white, gray first. Diff colors and permission badges stay small and semantic.</Text><View style={styles.rowWrap}><Pressable style={styles.primary} onPress={onNew}><Text style={styles.primaryText}>New task</Text></Pressable><Pressable style={styles.secondary} onPress={onSettings}><Text style={styles.secondaryText}>Connection</Text></Pressable></View></View>
    <View style={styles.card}><View style={styles.cardHead}><Text style={styles.cardTitle}>All Workspaces</Text><Pressable style={styles.iconButton} onPress={onRefresh}><Text style={styles.iconText}>↻</Text></Pressable></View>{rows.map((row: any) => <Pressable key={row.provider} style={styles.taskRow} onPress={() => onSelectProvider(row.provider)}><View style={[styles.taskDot, row.status === 'working' && styles.taskDotInfo, row.status === 'attention' && styles.taskDotWarn]} /><View style={styles.taskBody}><Text style={styles.taskTitle}>{row.title}</Text><Text style={styles.taskMeta}>{row.project} · {row.status === 'working' ? 'Working' : row.status === 'attention' ? 'Needs review' : 'No Changes'}<DiffStat theme={theme} add={row.add} del={row.del} /></Text></View><Text style={styles.taskTime}>{shortTime(row.updatedAt)}</Text></Pressable>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Machines</Text>{machines.length === 0 ? <Text style={styles.empty}>No relay machines loaded. Open Settings and load machines.</Text> : machines.map((machine: Machine) => <Pressable key={machine.machineId} style={[styles.machineRow, machineId === machine.machineId && styles.machineActive]} onPress={() => onSelectMachine(machine)}><View style={styles.machineDot} /><View><Text style={styles.machineTitle}>{machine.name || machine.machineId}</Text><Text style={styles.taskMeta}>{machine.machineId} · {machine.transport || 'relay'} · {shortTime(machine.lastSeenAt)}</Text></View></Pressable>)}</View>
  </View>;
}

function SessionScreen({ theme, styles, provider, selectedProvider, selectedSession, terminal, prompt, setPrompt, approvals, turns, jobs, busy, onSend, onStart, onStop, onKey, onApproval, onStructured, onKillJob, onFiles }: any) {
  return <View style={styles.pageGap}>
    <View style={styles.card}><View style={styles.cardHead}><View><Text style={styles.cardTitle}>{selectedProvider.label}</Text><Text style={styles.help}>{selectedSession?.lastKnown?.cwd || 'Persistent tmux workspace'}</Text></View><StatusPill theme={theme} text={selectedSession?.running ? 'working' : 'idle'} tone={selectedSession?.running ? 'info' : 'muted'} /></View><View style={styles.promptBubble}><Text style={styles.promptBubbleText}>Plan, ask, build, verify. This is the same CLI session you use in terminal.</Text></View><Text selectable style={styles.terminal}>{terminal}</Text><View style={styles.composer}><Pressable style={styles.roundButton} onPress={onFiles}><Text style={styles.roundButtonText}>+</Text></Pressable><TextInput value={prompt} onChangeText={setPrompt} multiline style={styles.composerInput} placeholder="Follow up…" placeholderTextColor={theme.colors.textMuted} /><Pressable style={styles.primary} disabled={busy || !prompt.trim()} onPress={onSend}><Text style={styles.primaryText}>Send</Text></Pressable></View><View style={styles.rowWrap}><Pressable style={styles.secondarySmall} onPress={onStart}><Text style={styles.secondaryText}>Start/attach</Text></Pressable><Pressable style={styles.dangerSmall} onPress={onStop}><Text style={styles.dangerText}>Stop</Text></Pressable>{['C-c', 'Escape', 'Enter'].map((key) => <Pressable key={key} style={styles.secondarySmall} onPress={() => onKey(key)}><Text style={styles.secondaryText}>{key}</Text></Pressable>)}</View></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Approvals</Text>{approvals.length === 0 ? <Text style={styles.empty}>No pending approval.</Text> : approvals.map((item: any) => <View key={item.id} style={styles.panelItem}><Text style={styles.itemTitle}>{item.title || 'Needs approval'}</Text><Text style={styles.itemSub}>{item.message}</Text><View style={styles.rowWrap}><Pressable style={styles.primarySmall} onPress={() => onApproval(item, { decision: 'approve' })}><Text style={styles.primaryText}>Allow</Text></Pressable><Pressable style={styles.dangerSmall} onPress={() => onApproval(item, { decision: 'deny' })}><Text style={styles.dangerText}>Deny</Text></Pressable><Pressable style={styles.secondarySmall} onPress={() => onApproval(item, { keys: ['Enter'], decision: 'enter' })}><Text style={styles.secondaryText}>Enter</Text></Pressable></View></View>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Structured turns</Text><Pressable style={styles.secondary} onPress={onStructured}><Text style={styles.secondaryText}>Use composer prompt</Text></Pressable>{turns.length === 0 ? <Text style={styles.empty}>No structured turn.</Text> : turns.map((turn: any) => <View key={turn.id} style={styles.panelItem}><Text style={styles.itemTitle}>{turn.status} · {turn.promptPreview || turn.id}</Text><Text style={styles.itemSub}>{turn.adapter} · events {turn.eventCount} · text {turn.textBytes}B</Text></View>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>CLI jobs</Text>{jobs.length === 0 ? <Text style={styles.empty}>No CLI job.</Text> : jobs.map((job: any) => <View key={job.id} style={styles.panelItem}><Text style={styles.itemTitle}>{job.status} · {job.command}</Text><Text style={styles.itemSub}>{job.args?.join(' ')} · stdout {job.stdoutBytes}B · stderr {job.stderrBytes}B</Text>{['starting', 'running'].includes(job.status) ? <Pressable style={styles.dangerSmall} onPress={() => onKillJob(job)}><Text style={styles.dangerText}>Stop job</Text></Pressable> : null}</View>)}</View>
  </View>;
}

function NewScreen({ theme, styles, provider, setProvider, cwd, setCwd, prompt, setPrompt, busy, onStart }: any) {
  return <View style={styles.pageGap}><View style={styles.card}><Text style={styles.sectionLabel}>New agent</Text><Text style={styles.heroTitle}>Choose a CLI and start a persistent task.</Text><ProviderPicker styles={styles} provider={provider} setProvider={setProvider} /><Text style={styles.label}>Working directory</Text><TextInput value={cwd} onChangeText={setCwd} style={styles.input} placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" /><Text style={styles.label}>Prompt</Text><TextInput value={prompt} onChangeText={setPrompt} multiline style={[styles.input, styles.prompt]} placeholder="Describe the task…" placeholderTextColor={theme.colors.textMuted} /><Pressable style={styles.primary} disabled={busy} onPress={onStart}><Text style={styles.primaryText}>Start & send</Text></Pressable></View><View style={styles.card}><Text style={styles.cardTitle}>Permission modes</Text><Text style={styles.help}>Auto approval and full access appear as small light-blue badges only. The app chrome remains monochrome.</Text><View style={styles.rowWrap}><StatusPill theme={theme} text="auto approval" tone="info" /><StatusPill theme={theme} text="full access" tone="info" /></View></View></View>;
}

function ProviderPicker({ styles, provider, setProvider }: any) {
  return <View style={styles.providerGrid}>{providers.map((item) => <Pressable key={item.id} onPress={() => setProvider(item.id)} style={[styles.providerCard, provider === item.id && styles.providerActive]}><Text style={[styles.providerShort, provider === item.id && styles.providerShortActive]}>{item.short}</Text><Text style={styles.providerTitle}>{item.label}</Text><Text style={styles.taskMeta}>{item.supportsImages ? 'Images/files' : 'File path references'}</Text></Pressable>)}</View>;
}

function FilesScreen({ styles, uploads, onPick }: any) {
  return <View style={styles.pageGap}><View style={styles.heroCard}><Text style={styles.sectionLabel}>Files & media</Text><Text style={styles.heroTitle}>Upload screenshots, images, and references.</Text><Text style={styles.help}>Files are saved on the target machine and can be sent to the active CLI as paths.</Text><Pressable style={styles.primary} onPress={onPick}><Text style={styles.primaryText}>Choose files</Text></Pressable></View><View style={styles.card}>{uploads.length === 0 ? <Text style={styles.empty}>No uploads yet.</Text> : uploads.map((item: any, index: number) => <View key={`${item.path}-${index}`} style={styles.panelItem}><Text style={styles.itemTitle}>{item.name || item.filename}</Text><Text style={styles.itemSub}>{item.path}</Text><Text style={styles.itemSub}>{shortTime(item.createdAt)} · {Math.round((item.bytes || item.size || 0) / 1024)}KB</Text></View>)}</View></View>;
}

function TerminalScreen({ theme, styles, provider, setProvider, terminal, jobArgs, setJobArgs, onKey, onRunJob }: any) {
  return <View style={styles.pageGap}><View style={styles.card}><Text style={styles.cardTitle}>Raw terminal</Text><ProviderPicker styles={styles} provider={provider} setProvider={setProvider} /><Text selectable style={[styles.terminal, styles.terminalTall]}>{terminal}</Text><View style={styles.rowWrap}>{['C-c', 'Escape', 'Enter'].map((key) => <Pressable key={key} style={styles.secondarySmall} onPress={() => onKey(key)}><Text style={styles.secondaryText}>{key}</Text></Pressable>)}</View></View><View style={styles.card}><Text style={styles.cardTitle}>CLI job</Text><TextInput value={jobArgs} onChangeText={setJobArgs} style={styles.input} placeholder="--help or mcp list" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" /><Pressable style={styles.secondary} onPress={onRunJob}><Text style={styles.secondaryText}>Run job</Text></Pressable></View></View>;
}

function SettingsScreen({ theme, styles, mode, setMode, controlUrl, setControlUrl, token, setToken, machineId, setMachineId, machines, themePref, setThemePref, cwd, setCwd, onLoadMachines }: any) {
  return <View style={styles.pageGap}><View style={styles.card}><Text style={styles.cardTitle}>Connection</Text><View style={styles.segmented}><Pressable style={[styles.segment, mode === 'server' && styles.segmentActive]} onPress={() => setMode('server')}><Text style={[styles.segmentText, mode === 'server' && styles.segmentTextActive]}>Relay</Text></Pressable><Pressable style={[styles.segment, mode === 'direct' && styles.segmentActive]} onPress={() => { setMode('direct'); setMachineId(''); }}><Text style={[styles.segmentText, mode === 'direct' && styles.segmentTextActive]}>Direct</Text></Pressable></View><Text style={styles.label}>Server / daemon URL</Text><TextInput value={controlUrl} onChangeText={setControlUrl} style={styles.input} placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" /><Text style={styles.label}>Access token</Text><TextInput value={token} onChangeText={setToken} style={styles.input} placeholder="ORBIX_TOKEN" placeholderTextColor={theme.colors.textMuted} secureTextEntry autoCapitalize="none" /><Text style={styles.label}>Working directory</Text><TextInput value={cwd} onChangeText={setCwd} style={styles.input} placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" /><Pressable style={styles.secondary} onPress={onLoadMachines}><Text style={styles.secondaryText}>Load machines</Text></Pressable>{machines.map((machine: Machine) => <Pressable key={machine.machineId} style={[styles.machineRow, machineId === machine.machineId && styles.machineActive]} onPress={() => { setMode('server'); setMachineId(machine.machineId); }}><View style={styles.machineDot} /><View><Text style={styles.machineTitle}>{machine.name || machine.machineId}</Text><Text style={styles.taskMeta}>{machine.machineId} · {shortTime(machine.lastSeenAt)}</Text></View></Pressable>)}</View><View style={styles.card}><Text style={styles.cardTitle}>Appearance</Text><Text style={styles.help}>Light, dark, or follow system. Diff is green/red; special modes are light blue.</Text><View style={styles.segmented}>{(['system', 'light', 'dark'] as OrbixThemePreference[]).map((item) => <Pressable key={item} style={[styles.segment, themePref === item && styles.segmentActive]} onPress={() => setThemePref(item)}><Text style={[styles.segmentText, themePref === item && styles.segmentTextActive]}>{item}</Text></Pressable>)}</View></View></View>;
}

function makeStyles(theme: OrbixTheme) {
  const controlBase = {
    minHeight: 46,
    borderRadius: theme.radius.control,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    borderWidth: 1
  };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.bg },
    eyebrow: { color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 11, fontWeight: '600' },
    title: { color: theme.colors.text, fontSize: 32, lineHeight: 36, letterSpacing: -1.6, fontWeight: '500', marginTop: 4 },
    headerPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10 },
    content: { padding: 14, gap: 14, paddingBottom: 104 },
    pageGap: { gap: 14 },
    heroCard: { padding: 18, borderRadius: theme.radius.card, backgroundColor: theme.colors.bgElevated, borderWidth: 1, borderColor: theme.colors.border, gap: 12 },
    sectionLabel: { color: theme.colors.textMuted, letterSpacing: 1.1, textTransform: 'uppercase', fontSize: 11, fontWeight: '600' },
    heroTitle: { color: theme.colors.text, fontSize: 26, lineHeight: 30, letterSpacing: -1.1, fontWeight: '500' },
    help: { color: theme.colors.textMuted, lineHeight: 20, fontSize: 13 },
    card: { padding: 16, borderRadius: theme.radius.card, backgroundColor: theme.colors.bgElevated, borderWidth: 1, borderColor: theme.colors.border, gap: 12 },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    cardTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
    rowWrap: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
    primary: { ...controlBase, backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    primarySmall: { ...controlBase, minHeight: 38, backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    primaryText: { color: theme.colors.primaryText, fontWeight: '700' },
    secondary: { ...controlBase, backgroundColor: theme.colors.bgSoft, borderColor: theme.colors.border },
    secondarySmall: { ...controlBase, minHeight: 38, backgroundColor: theme.colors.bgSoft, borderColor: theme.colors.border },
    secondaryText: { color: theme.colors.text, fontWeight: '700' },
    dangerSmall: { ...controlBase, minHeight: 38, backgroundColor: theme.colors.diffDelBg, borderColor: theme.colors.danger },
    dangerText: { color: theme.colors.danger, fontWeight: '700' },
    iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bgSoft, borderWidth: 1, borderColor: theme.colors.border },
    iconText: { color: theme.colors.text, fontSize: 18 },
    taskRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 10 },
    taskDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.borderStrong },
    taskDotInfo: { backgroundColor: theme.colors.modeBlue },
    taskDotWarn: { backgroundColor: theme.colors.warning },
    taskBody: { flex: 1, minWidth: 0, gap: 3 },
    taskTitle: { color: theme.colors.text, fontWeight: '500', fontSize: 16 },
    taskMeta: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
    taskTime: { color: theme.colors.textMuted, fontSize: 11 },
    empty: { color: theme.colors.textMuted, borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed', borderRadius: theme.radius.panel, padding: 12, backgroundColor: theme.colors.bgSoft },
    machineRow: { padding: 12, borderRadius: theme.radius.panel, backgroundColor: theme.colors.bgSoft, borderWidth: 1, borderColor: theme.colors.border, gap: 10, flexDirection: 'row', alignItems: 'center' },
    machineActive: { borderColor: theme.colors.modeBlue },
    machineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.modeBlue },
    machineTitle: { color: theme.colors.text, fontWeight: '600' },
    promptBubble: { alignSelf: 'flex-end', maxWidth: '92%', borderRadius: 22, backgroundColor: theme.colors.bgSoft, padding: 14 },
    promptBubbleText: { color: theme.colors.text, lineHeight: 20 },
    terminal: { minHeight: 300, color: theme.colors.textSoft, backgroundColor: theme.colors.bgInset, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, padding: 12, fontFamily: 'monospace', lineHeight: 20, fontSize: 12 },
    terminalTall: { minHeight: 520 },
    composer: { borderRadius: 24, backgroundColor: theme.colors.bgSoft, borderWidth: 1, borderColor: theme.colors.border, padding: 8, gap: 8, flexDirection: 'row', alignItems: 'flex-end' },
    roundButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.bgElevated, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
    roundButtonText: { color: theme.colors.text, fontSize: 24, lineHeight: 26 },
    composerInput: { flex: 1, minHeight: 42, maxHeight: 130, color: theme.colors.text, paddingHorizontal: 4, paddingVertical: 9, textAlignVertical: 'top' },
    panelItem: { padding: 12, borderRadius: theme.radius.panel, backgroundColor: theme.colors.bgSoft, borderWidth: 1, borderColor: theme.colors.border, gap: 8 },
    itemTitle: { color: theme.colors.text, fontWeight: '600' },
    itemSub: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
    label: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
    input: { minHeight: 48, borderRadius: theme.radius.control, backgroundColor: theme.colors.bgSoft, color: theme.colors.text, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.colors.border },
    prompt: { minHeight: 150, textAlignVertical: 'top', paddingTop: 12 },
    providerGrid: { gap: 10 },
    providerCard: { padding: 13, borderRadius: theme.radius.panel, backgroundColor: theme.colors.bgSoft, borderWidth: 1, borderColor: theme.colors.border, gap: 5 },
    providerActive: { backgroundColor: theme.colors.bgElevated, borderColor: theme.colors.primary },
    providerShort: { width: 34, height: 34, borderRadius: 12, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', paddingTop: 8, color: theme.colors.textMuted, backgroundColor: theme.colors.bgElevated, fontSize: 12, fontWeight: '700' },
    providerShortActive: { color: theme.colors.primaryText, backgroundColor: theme.colors.primary },
    providerTitle: { color: theme.colors.text, fontWeight: '600' },
    segmented: { alignSelf: 'flex-start', flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: theme.colors.bgSoft, borderWidth: 1, borderColor: theme.colors.border, gap: 4 },
    segment: { minHeight: 34, paddingHorizontal: 13, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    segmentActive: { backgroundColor: theme.colors.bgElevated },
    segmentText: { color: theme.colors.textMuted, fontWeight: '600' },
    segmentTextActive: { color: theme.colors.text },
    navBar: { position: 'absolute', left: 12, right: 12, bottom: 12, minHeight: 66, borderRadius: 28, backgroundColor: theme.colors.bgElevated, borderWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', padding: 7, gap: 3 },
    navItem: { flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 2 },
    navItemActive: { backgroundColor: theme.colors.bgSoft },
    navGlyph: { color: theme.colors.textMuted, fontSize: 17, fontWeight: '600' },
    navText: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '600' },
    navTextActive: { color: theme.colors.text }
  });
}
