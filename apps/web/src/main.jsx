import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const providers = [
  { id: 'codex', label: 'Codex', short: 'CX', supportsImages: true },
  { id: 'claude', label: 'Claude Code', short: 'CC', supportsImages: false },
  { id: 'cursor', label: 'Cursor Agent', short: 'CU', supportsImages: false }
];

const routes = [
  { id: 'workspaces', label: 'Workspaces', icon: '⌘' },
  { id: 'new', label: 'New', icon: '+' },
  { id: 'files', label: 'Files', icon: '□' },
  { id: 'terminal', label: 'Terminal', icon: '>' },
  { id: 'settings', label: 'Settings', icon: '◌' }
];

const storage = {
  directUrl: readCompat('orbix.directUrl', ['tri', 'cli.directUrl'].join('')),
  token: readCompat('orbix.token', ['tri', 'cli.token'].join('')),
  mode: readCompat('orbix.mode', ''),
  machineId: readCompat('orbix.machineId', ''),
  theme: readCompat('orbix.theme', 'system'),
  uploads: readJson('orbix.uploads', [])
};

function readCompat(key, fallbackKeyOrValue) {
  const value = localStorage.getItem(key);
  if (value !== null) return value;
  if (fallbackKeyOrValue && fallbackKeyOrValue.includes('.')) return localStorage.getItem(fallbackKeyOrValue) || '';
  return fallbackKeyOrValue || '';
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; }
}

function shortTime(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return value; }
}

function classNames(...items) { return items.filter(Boolean).join(' '); }

function providerMeta(id) { return providers.find((item) => item.id === id) || providers[0]; }

function splitArgs(text) {
  return (text.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) || []).map((item) => item.replace(/^["']|["']$/g, ''));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

function makeTask(provider, session, snapshot, approvals = [], turns = [], jobs = []) {
  const last = session?.lastKnown || {};
  const analysis = snapshot?.analysis || last.lastAnalysis || {};
  const running = Boolean(session?.running);
  const pending = approvals.filter((item) => item.provider === provider.id && item.status === 'pending').length;
  const recentTurn = turns.find((turn) => turn.provider === provider.id);
  const recentJob = jobs.find((job) => job.provider === provider.id);
  const status = pending ? 'attention' : analysis.status || (running ? 'working' : 'idle');
  const added = recentTurn?.eventCount || recentJob?.stdoutBytes ? Math.max(1, Math.round((recentTurn?.eventCount || recentJob?.stdoutBytes || 0) / 4)) : 0;
  const removed = recentJob?.stderrBytes ? Math.max(1, Math.round(recentJob.stderrBytes / 128)) : 0;
  return {
    id: provider.id,
    provider: provider.id,
    title: running ? `${provider.label} remote session` : `Start ${provider.label}`,
    project: last.cwd || session?.status?.split('\n')?.[0] || 'orbix workspace',
    status,
    running,
    pending,
    added,
    removed,
    updatedAt: last.updatedAt || last.lastSnapshotAt || snapshot?.capturedAt || session?.tmux?.created || null,
    promptPreview: recentTurn?.promptPreview || recentJob?.args?.join(' ') || ''
  };
}

function useHashRoute() {
  const parse = useCallback(() => {
    const raw = window.location.hash.replace(/^#\/?/, '') || 'workspaces';
    const [name, param] = raw.split('/');
    return { name: name || 'workspaces', param: param ? decodeURIComponent(param) : '' };
  }, []);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [parse]);
  const go = useCallback((name, param = '') => {
    window.location.hash = `#/${name}${param ? `/${encodeURIComponent(param)}` : ''}`;
  }, []);
  return [route, go];
}

function useThemePreference(initial) {
  const [themePref, setThemePref] = useState(initial || 'system');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches || false);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const listener = (event) => setSystemDark(event.matches);
    media.addEventListener?.('change', listener);
    return () => media.removeEventListener?.('change', listener);
  }, []);
  const actual = themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref;
  useEffect(() => {
    document.documentElement.dataset.theme = actual;
    document.documentElement.dataset.themePref = themePref;
    localStorage.setItem('orbix.theme', themePref);
  }, [actual, themePref]);
  return { themePref, setThemePref, actual };
}

function App() {
  const [route, go] = useHashRoute();
  const { themePref, setThemePref, actual } = useThemePreference(storage.theme);
  const [mode, setModeState] = useState(storage.mode || 'server');
  const [directUrl, setDirectUrlState] = useState(storage.directUrl || 'http://127.0.0.1:7317');
  const [token, setTokenState] = useState(storage.token || '');
  const [machineId, setMachineIdState] = useState(storage.machineId || '');
  const [provider, setProvider] = useState(route.name === 'sessions' && route.param ? route.param : 'codex');
  const [cwd, setCwd] = useState('/root');
  const [prompt, setPrompt] = useState('');
  const [jobArgs, setJobArgs] = useState('--help');
  const [machines, setMachines] = useState([]);
  const [sessions, setSessions] = useState(null);
  const [snapshots, setSnapshots] = useState({});
  const [approvals, setApprovals] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [turns, setTurns] = useState([]);
  const [uploads, setUploads] = useState(storage.uploads);
  const [events, setEvents] = useState([]);
  const [adapterInfo, setAdapterInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (route.name === 'sessions' && route.param) setProvider(route.param);
  }, [route]);

  const setMode = (value) => { setModeState(value); localStorage.setItem('orbix.mode', value); };
  const setDirectUrl = (value) => { setDirectUrlState(value); localStorage.setItem('orbix.directUrl', value); };
  const setToken = (value) => { setTokenState(value); localStorage.setItem('orbix.token', value); };
  const setMachineId = (value) => { setMachineIdState(value); localStorage.setItem('orbix.machineId', value); };

  const base = useMemo(() => {
    if (mode === 'direct') return directUrl.replace(/\/$/, '');
    if (!machineId) return '';
    return `/api/machines/${encodeURIComponent(machineId)}/daemon`;
  }, [mode, directUrl, machineId]);

  const authHeaders = useMemo(() => token ? {
    authorization: `Bearer ${token}`,
    'x-orbix-token': token,
    [['x', 'tri', 'cli', 'token'].join('-')]: token
  } : {}, [token]);

  const request = useCallback(async (path, options = {}, target = base) => {
    if (!target && target !== '') throw new Error('请选择机器或切换到直连 daemon');
    const response = await fetch(`${target}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...authHeaders, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }, [authHeaders, base]);

  const run = useCallback(async (task, label = '完成') => {
    try {
      setBusy(true);
      setNotice('');
      const data = await task();
      setNotice(label);
      return data;
    } catch (error) {
      setNotice(error.message || String(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }, []);

  const loadMachines = useCallback(async () => {
    const data = await request('/api/machines', {}, '');
    setMachines(data.machines || []);
    return data;
  }, [request]);

  const loadSide = useCallback(async (activeProvider = provider) => {
    if (!base) return;
    const [approvalData, jobData, turnData] = await Promise.all([
      request(`/api/approvals?provider=${activeProvider}`).catch(() => ({ approvals: [] })),
      request(`/api/jobs?provider=${activeProvider}`).catch(() => ({ jobs: [] })),
      request(`/api/structured/${activeProvider}/turns`).catch(() => ({ turns: [] }))
    ]);
    setApprovals(approvalData.approvals || []);
    setJobs(jobData.jobs || []);
    setTurns(turnData.turns || []);
  }, [base, provider, request]);

  const refresh = useCallback(async (activeProvider = provider, all = false) => {
    if (mode === 'server' && !machineId) {
      await loadMachines().catch(() => {});
      return;
    }
    if (!base) return;
    const sessionData = await request('/api/sessions');
    setSessions(sessionData);
    const wanted = all ? providers.map((item) => item.id) : [activeProvider];
    const nextSnapshots = {};
    await Promise.all(wanted.map(async (id) => {
      nextSnapshots[id] = await request(`/api/sessions/${id}/snapshot?lines=260`).catch(() => null);
    }));
    setSnapshots((prev) => ({ ...prev, ...nextSnapshots }));
    await loadSide(activeProvider);
    const adapters = await request('/api/adapters').catch(() => null);
    setAdapterInfo(adapters);
  }, [base, loadMachines, loadSide, machineId, mode, provider, request]);

  useEffect(() => {
    void refresh(provider, true);
    const timer = setInterval(() => { void refresh(provider, route.name === 'workspaces'); }, 7000);
    return () => clearInterval(timer);
  }, [provider, route.name, refresh]);

  useEffect(() => {
    if (!base) return undefined;
    const url = `${base}/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const source = new EventSource(url);
    const onAny = (event) => {
      try { setEvents((prev) => [JSON.parse(event.data), ...prev].slice(0, 120)); } catch {}
    };
    ['hello', 'sessions', 'session-started', 'session-stopped', 'input-sent', 'keys-sent', 'approval-detected', 'approval-responded', 'attachment-uploaded', 'structured-turn-started', 'structured-turn-completed', 'cli-job-started', 'cli-job-completed', 'snapshot-analyzed', 'error'].forEach((name) => source.addEventListener(name, onAny));
    source.onerror = () => source.close();
    return () => source.close();
  }, [base, token]);

  useEffect(() => {
    localStorage.setItem('orbix.uploads', JSON.stringify(uploads.slice(0, 50)));
  }, [uploads]);

  const tasks = useMemo(() => {
    const providerSessions = sessions?.providers || [];
    return providers.map((item) => makeTask(
      item,
      providerSessions.find((session) => session.id === item.id),
      snapshots[item.id],
      approvals,
      turns,
      jobs
    ));
  }, [approvals, jobs, sessions, snapshots, turns]);

  const activeSnapshot = snapshots[provider];
  const activeTask = tasks.find((task) => task.provider === provider) || makeTask(providerMeta(provider), null, null);

  const actions = {
    go,
    refresh: () => run(() => refresh(provider, route.name === 'workspaces'), '已同步'),
    loadMachines: () => run(loadMachines, '机器列表已刷新'),
    selectMachine: (machine) => { setMode('server'); setMachineId(machine.machineId); setNotice(`已选择 ${machine.name || machine.machineId}`); void refresh(provider, true); },
    useDirect: () => { setMode('direct'); setMachineId(''); setNotice('已切换直连 daemon'); void refresh(provider, true); },
    useServer: () => { setMode('server'); setNotice('已切换 relay server'); void loadMachines().catch(() => {}); },
    startSession: (id = provider, initialPrompt = '') => run(async () => {
      await request('/api/sessions', { method: 'POST', body: JSON.stringify({ provider: id, cwd }) });
      if (initialPrompt.trim()) await request(`/api/sessions/${id}/input`, { method: 'POST', body: JSON.stringify({ text: initialPrompt }) });
      setProvider(id);
      go('sessions', id);
      await refresh(id, true);
    }, '会话已启动'),
    stopSession: (id = provider) => run(async () => {
      await request(`/api/sessions/${id}/stop`, { method: 'POST', body: '{}' });
      await refresh(id, true);
    }, '会话已停止'),
    sendPrompt: () => run(async () => {
      const value = prompt.trim();
      if (!value) throw new Error('请输入指令');
      await request(`/api/sessions/${provider}/input`, { method: 'POST', body: JSON.stringify({ text: value }) });
      setPrompt('');
      await refresh(provider, false);
    }, '指令已发送'),
    sendKeys: (keys) => run(async () => {
      await request(`/api/sessions/${provider}/keys`, { method: 'POST', body: JSON.stringify({ keys }) });
      await refresh(provider, false);
    }, '按键已发送'),
    respondApproval: (approval, response) => run(async () => {
      await request(`/api/approvals/${encodeURIComponent(approval.id)}/respond`, { method: 'POST', body: JSON.stringify(response) });
      await loadSide(provider);
    }, '审批已处理'),
    runStructured: () => run(async () => {
      const value = prompt.trim();
      if (!value) throw new Error('请输入 structured turn 的 prompt');
      const body = { prompt: value, cwd, autoApprove: false };
      if (provider === 'claude') body.permissionMode = 'plan';
      if (provider === 'cursor') body.mode = 'plan';
      await request(`/api/structured/${provider}/turn`, { method: 'POST', body: JSON.stringify(body) });
      await loadSide(provider);
    }, 'Structured turn 已启动'),
    runJob: () => run(async () => {
      await request('/api/jobs', { method: 'POST', body: JSON.stringify({ provider, cwd, args: splitArgs(jobArgs || '--help') }) });
      await loadSide(provider);
    }, 'Job 已启动'),
    killJob: (job) => run(async () => { await request(`/api/jobs/${encodeURIComponent(job.id)}/kill`, { method: 'POST', body: '{}' }); await loadSide(provider); }, 'Job 已停止'),
    uploadFiles: async (files) => run(async () => {
      const done = [];
      for (const file of files) {
        const contentBase64 = await fileToBase64(file);
        const result = await request('/api/upload', { method: 'POST', body: JSON.stringify({ provider, filename: file.name, contentBase64 }) });
        done.push({ ...result, name: file.name, size: file.size, type: file.type, provider, createdAt: new Date().toISOString(), previewUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : '' });
      }
      setUploads((prev) => [...done, ...prev].slice(0, 50));
      await loadSide(provider);
    }, '文件已上传'),
    setThemePref,
    setDirectUrl,
    setToken,
    setCwd,
    setJobArgs,
    setPrompt,
    setProvider
  };

  const context = {
    route,
    go,
    themePref,
    actual,
    mode,
    directUrl,
    token,
    machineId,
    machines,
    sessions,
    tasks,
    provider,
    cwd,
    prompt,
    jobArgs,
    activeSnapshot,
    activeTask,
    approvals,
    jobs,
    turns,
    uploads,
    events,
    adapterInfo,
    busy,
    notice,
    base,
    actions
  };

  return <Shell context={context} />;
}

function Shell({ context }) {
  const { route, go, notice, busy, provider, mode, machineId, activeTask } = context;
  const page = route.name === 'sessions'
    ? <SessionPage context={context} />
    : route.name === 'new'
      ? <NewPage context={context} />
      : route.name === 'files'
        ? <FilesPage context={context} />
        : route.name === 'terminal'
          ? <TerminalPage context={context} />
          : route.name === 'settings'
            ? <SettingsPage context={context} />
            : <WorkspacesPage context={context} />;
  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Orbix navigation">
        <button className="brand" onClick={() => go('workspaces')} aria-label="Orbix home"><span>O</span></button>
        <nav className="nav-list">
          {routes.map((item) => <button key={item.id} className={classNames('nav-item', route.name === item.id && 'active')} onClick={() => go(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}
        </nav>
      </aside>
      <main className="main-view">
        <header className="topbar">
          <div>
            <p className="eyebrow">Orbix Remote Control</p>
            <h1>{titleFor(route, provider)}</h1>
          </div>
          <div className="topbar-actions">
            <span className={classNames('mode-badge', mode === 'server' && machineId && 'live')}>{mode === 'server' ? (machineId || 'choose machine') : 'direct daemon'}</span>
            <span className={classNames('status-dot', activeTask.status)}>{busy ? 'working' : activeTask.status}</span>
            <button className="button ghost" onClick={context.actions.refresh}>Sync</button>
          </div>
        </header>
        {notice ? <div className="notice">{notice}</div> : null}
        {page}
      </main>
    </div>
  );
}

function titleFor(route, provider) {
  if (route.name === 'sessions') return `${providerMeta(provider).label} Session`;
  if (route.name === 'new') return 'Start an agent';
  if (route.name === 'files') return 'Files & media';
  if (route.name === 'terminal') return 'Terminal control';
  if (route.name === 'settings') return 'Settings';
  return 'All Workspaces';
}

function WorkspacesPage({ context }) {
  const { tasks, machines, mode, machineId, actions } = context;
  const pinned = tasks.filter((task) => task.running || task.pending);
  const idle = tasks.filter((task) => !pinned.includes(task));
  return (
    <section className="workspace-grid">
      <div className="panel hero-panel">
        <div>
          <p className="section-label">Build from anywhere</p>
          <h2>Kick off Codex, Claude Code, and Cursor from one quiet control surface.</h2>
          <p>Persistent tmux sessions keep running after your phone or browser disconnects. Orbix only adds a polished remote layer.</p>
        </div>
        <div className="hero-actions">
          <button className="button primary" onClick={() => actions.go('new')}>New task</button>
          <button className="button secondary" onClick={() => actions.go('settings')}>Connection</button>
        </div>
      </div>

      <div className="panel list-panel">
        <div className="panel-head"><h2>All Workspaces</h2><button className="icon-button" onClick={actions.refresh}>↻</button></div>
        <TaskGroup label="Pinned" tasks={pinned} actions={actions} />
        <TaskGroup label="Today" tasks={idle} actions={actions} />
      </div>

      <div className="panel machines-panel">
        <div className="panel-head"><h2>Machines</h2><button className="button compact" onClick={actions.loadMachines}>Refresh</button></div>
        {mode === 'server' && !machineId ? <p className="muted">Select a registered computer/server or switch to direct daemon in Settings.</p> : null}
        {machines.length === 0 ? <div className="empty-card">No relay machines loaded yet.</div> : machines.map((machine) => (
          <button key={machine.machineId} className={classNames('machine-row', machineId === machine.machineId && 'active')} onClick={() => actions.selectMachine(machine)}>
            <span className="machine-dot" />
            <span><strong>{machine.name || machine.machineId}</strong><small>{machine.machineId} · {machine.transport || 'relay'} · {shortTime(machine.lastSeenAt)}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TaskGroup({ label, tasks, actions }) {
  return (
    <div className="task-group">
      <p className="group-label">{label}</p>
      {tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} actions={actions} />) : <div className="empty-line">No active work.</div>}
    </div>
  );
}

function TaskRow({ task, actions }) {
  return (
    <button className="task-row" onClick={() => actions.go('sessions', task.provider)}>
      <span className={classNames('task-dot', task.status)} />
      <span className="task-main">
        <strong>{task.title}</strong>
        <small>{task.project} · {statusLabel(task.status)} {task.added || task.removed ? <DiffStat add={task.added} del={task.removed} /> : null}</small>
      </span>
      <span className="task-time">{shortTime(task.updatedAt)}</span>
    </button>
  );
}

function statusLabel(status) {
  if (status === 'attention') return 'Needs review';
  if (status === 'ready') return 'Passed';
  if (status === 'working' || status === 'running') return 'Working';
  return 'No Changes';
}

function DiffStat({ add = 0, del = 0 }) {
  return <span className="diff-stat"><span className="diff-add">+{add}</span> <span className="diff-del">-{del}</span></span>;
}

function SessionPage({ context }) {
  const { provider, activeSnapshot, activeTask, prompt, approvals, jobs, turns, actions, busy } = context;
  const currentApprovals = approvals.filter((item) => item.status === 'pending');
  return (
    <section className="session-layout">
      <div className="conversation panel">
        <div className="session-header">
          <button className="icon-button" onClick={() => actions.go('workspaces')}>‹</button>
          <div><h2>{providerMeta(provider).label}</h2><p>{activeTask.project}</p></div>
          <button className="icon-button" onClick={() => actions.stopSession(provider)}>···</button>
        </div>
        <div className="prompt-bubble">{activeTask.promptPreview || 'Plan, ask, build, verify. Send a prompt below to control the same CLI session.'}</div>
        <p className="finished">{activeTask.running ? 'Working now' : 'Finished / idle'} · {shortTime(activeTask.updatedAt)}</p>
        <div className="terminal-output"><pre>{activeSnapshot?.output || 'Start or sync a session to see live CLI output.'}</pre></div>
        <Composer value={prompt} setValue={actions.setPrompt} onSend={actions.sendPrompt} busy={busy} onUpload={() => actions.go('files')} />
      </div>
      <aside className="session-side">
        <ApprovalsCard approvals={currentApprovals} actions={actions} />
        <TurnsCard turns={turns} actions={actions} />
        <JobsCard jobs={jobs} actions={actions} />
        <div className="panel mini-panel">
          <h3>Quick keys</h3>
          <div className="chip-row">{['C-c', 'Escape', 'Enter'].map((key) => <button className="chip" key={key} onClick={() => actions.sendKeys([key])}>{key}</button>)}</div>
          <button className="button secondary full" onClick={actions.runStructured}>Run structured turn</button>
        </div>
      </aside>
    </section>
  );
}

function Composer({ value, setValue, onSend, busy, onUpload }) {
  return (
    <div className="composer">
      <button className="composer-plus" onClick={onUpload}>+</button>
      <textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="Plan, ask, build…" />
      <button className="button primary" disabled={busy || !value.trim()} onClick={onSend}>Send</button>
    </div>
  );
}

function ApprovalsCard({ approvals, actions }) {
  return (
    <div className="panel mini-panel">
      <h3>Approvals</h3>
      {approvals.length === 0 ? <div className="empty-card">No pending approval.</div> : approvals.map((item) => (
        <div key={item.id} className="approval-card">
          <strong>{item.title || 'Needs approval'}</strong>
          <p>{item.message || item.kind}</p>
          <div className="chip-row">
            <button className="button primary compact" onClick={() => actions.respondApproval(item, { decision: 'approve' })}>Allow</button>
            <button className="button danger compact" onClick={() => actions.respondApproval(item, { decision: 'deny' })}>Deny</button>
            <button className="button secondary compact" onClick={() => actions.respondApproval(item, { keys: ['Enter'], decision: 'enter' })}>Enter</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TurnsCard({ turns, actions }) {
  return (
    <div className="panel mini-panel">
      <h3>Structured turns</h3>
      {turns.length === 0 ? <div className="empty-card">No structured turns yet.</div> : turns.slice(0, 5).map((turn) => (
        <div key={turn.id} className="event-card"><strong>{turn.status} · {turn.promptPreview || turn.id}</strong><small>{turn.adapter} · events {turn.eventCount} · text {turn.textBytes}B</small></div>
      ))}
      <button className="button secondary full" onClick={actions.runStructured}>Use composer prompt</button>
    </div>
  );
}

function JobsCard({ jobs, actions }) {
  return (
    <div className="panel mini-panel">
      <h3>CLI jobs</h3>
      {jobs.length === 0 ? <div className="empty-card">No jobs.</div> : jobs.slice(0, 5).map((job) => (
        <div key={job.id} className="event-card"><strong>{job.status} · {job.command}</strong><small>{job.args?.join(' ')} · stdout {job.stdoutBytes}B · stderr {job.stderrBytes}B</small>{['starting', 'running'].includes(job.status) ? <button className="button danger compact" onClick={() => actions.killJob(job)}>Stop</button> : null}</div>
      ))}
    </div>
  );
}

function NewPage({ context }) {
  const { provider, cwd, prompt, actions, busy } = context;
  return (
    <section className="new-grid">
      <div className="panel new-panel">
        <p className="section-label">New agent</p>
        <h2>Choose a CLI and start a persistent remote session.</h2>
        <ProviderPicker provider={provider} setProvider={actions.setProvider} />
        <label className="field">Working directory<input value={cwd} onChange={(event) => actions.setCwd(event.target.value)} /></label>
        <label className="field">Prompt<textarea value={prompt} onChange={(event) => actions.setPrompt(event.target.value)} rows="8" placeholder="Describe the task. Attach files from Files after upload." /></label>
        <div className="button-row"><button className="button primary" disabled={busy} onClick={() => actions.startSession(provider, prompt)}>Start & send</button><button className="button secondary" onClick={() => actions.startSession(provider, '')}>Attach only</button></div>
      </div>
      <div className="panel guide-panel"><h3>Permission modes</h3><p><span className="mode-badge live">Auto approval</span> and <span className="mode-badge live">full access</span> remain small blue badges. They never become the main palette.</p><h3>Attachments</h3><p>Upload images/files first, then Orbix returns the target-machine path and can pass it to the active CLI.</p></div>
    </section>
  );
}

function ProviderPicker({ provider, setProvider }) {
  return <div className="provider-grid">{providers.map((item) => <button key={item.id} className={classNames('provider-card', provider === item.id && 'active')} onClick={() => setProvider(item.id)}><span>{item.short}</span><strong>{item.label}</strong><small>{item.supportsImages ? 'Image upload supported' : 'File/path references'}</small></button>)}</div>;
}

function FilesPage({ context }) {
  const { uploads, provider, actions } = context;
  const [dragging, setDragging] = useState(false);
  const handleFiles = (fileList) => { const files = [...(fileList || [])]; if (files.length) void actions.uploadFiles(files); };
  return (
    <section className="files-layout">
      <div className={classNames('panel dropzone', dragging && 'dragging')} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); handleFiles(event.dataTransfer.files); }}>
        <p className="section-label">Files & media</p>
        <h2>Upload screenshots, images, archives, or references to the target machine.</h2>
        <p>Current target: <strong>{providerMeta(provider).label}</strong>. Uploaded paths can be sent to the active CLI.</p>
        <label className="file-button"><input type="file" multiple onChange={(event) => handleFiles(event.target.files)} />Choose files</label>
      </div>
      <div className="file-grid">
        {uploads.length === 0 ? <div className="panel empty-card">No uploads yet.</div> : uploads.map((item, index) => <FileCard item={item} key={`${item.path}-${index}`} />)}
      </div>
    </section>
  );
}

function FileCard({ item }) {
  return <div className="panel file-card">{item.previewUrl ? <img src={item.previewUrl} alt={item.name || item.filename} /> : <div className="file-icon">□</div>}<strong>{item.name || item.filename}</strong><small>{item.path}</small><small>{shortTime(item.createdAt)} · {Math.round((item.size || 0) / 1024)}KB</small></div>;
}

function TerminalPage({ context }) {
  const { provider, activeSnapshot, jobArgs, events, actions } = context;
  return (
    <section className="terminal-layout">
      <div className="panel terminal-panel"><div className="panel-head"><h2>{providerMeta(provider).label} raw terminal</h2><ProviderPicker provider={provider} setProvider={actions.setProvider} /></div><div className="terminal-output large"><pre>{activeSnapshot?.output || 'No terminal output yet.'}</pre></div><div className="chip-row">{['C-c', 'Escape', 'Enter'].map((key) => <button className="chip" key={key} onClick={() => actions.sendKeys([key])}>{key}</button>)}</div></div>
      <div className="panel mini-panel"><h3>CLI job</h3><label className="field">Arguments<input value={jobArgs} onChange={(event) => actions.setJobArgs(event.target.value)} /></label><button className="button secondary full" onClick={actions.runJob}>Run job</button><h3>Events</h3><div className="events-list">{events.slice(0, 20).map((event) => <div className="event-card" key={event.id || `${event.type}-${event.createdAt}`}><strong>{event.type}</strong><small>{shortTime(event.createdAt || event.receivedAt)} · {event.provider || event.machineId || ''}</small></div>)}</div></div>
    </section>
  );
}

function SettingsPage({ context }) {
  const { themePref, actual, mode, directUrl, token, machineId, cwd, adapterInfo, actions } = context;
  return (
    <section className="settings-layout">
      <div className="panel settings-panel">
        <h2>Connection</h2>
        <div className="segmented"><button className={classNames(mode === 'server' && 'active')} onClick={actions.useServer}>Relay server</button><button className={classNames(mode === 'direct' && 'active')} onClick={actions.useDirect}>Direct daemon</button></div>
        <label className="field">Direct daemon URL<input value={directUrl} onChange={(event) => actions.setDirectUrl(event.target.value)} placeholder="http://192.168.1.10:7317" /></label>
        <label className="field">Access token<input value={token} onChange={(event) => actions.setToken(event.target.value)} type="password" placeholder="ORBIX_TOKEN" /></label>
        <label className="field">Default working directory<input value={cwd} onChange={(event) => actions.setCwd(event.target.value)} /></label>
        <div className="button-row"><button className="button secondary" onClick={actions.loadMachines}>Load machines</button><button className="button primary" onClick={actions.useDirect}>Use direct</button></div>
      </div>
      <div className="panel settings-panel">
        <h2>Appearance</h2>
        <p>Current resolved mode: <strong>{actual}</strong>. The interface stays monochrome; only diff and special permission badges use color.</p>
        <div className="segmented">{['system', 'light', 'dark'].map((item) => <button key={item} className={classNames(themePref === item && 'active')} onClick={() => actions.setThemePref(item)}>{item}</button>)}</div>
        <h2>Adapters</h2>
        <pre className="json-card">{JSON.stringify(adapterInfo?.providers || [], null, 2)}</pre>
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
