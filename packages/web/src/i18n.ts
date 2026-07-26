// Orbix i18n — zh/en
import { useOrbix } from './store';

export type Lang = 'zh' | 'en';

const dict = {
  // sessions
  allWorkspaces: { zh: '全部工作区', en: 'All Workspaces' },
  searchSessions: { zh: '搜索会话', en: 'Search sessions' },
  pinned: { zh: '置顶', en: 'Pinned' },
  today: { zh: '今天', en: 'Today' },
  earlier: { zh: '更早', en: 'Earlier' },
  noSessions: { zh: '还没有会话 — 在下方开始一个', en: 'No sessions yet — start one below' },
  onThisMachine: { zh: '本机未导入会话', en: 'On this machine · not imported' },
  importAction: { zh: '导入', en: 'Import' },
  planAskBuild: { zh: '计划、提问、构建…', en: 'Plan, ask, build…' },
  passed: { zh: '✓ 通过', en: '✓ Passed' },
  noChanges: { zh: '无变更', en: 'No Changes' },
  working: { zh: '工作中…', en: 'Working…' },
  needsApproval: { zh: '待审批', en: 'Needs approval' },
  errorS: { zh: '错误', en: 'Error' },
  idle: { zh: '空闲', en: 'Idle' },
  imported: { zh: '已导入', en: 'imported' },
  // chat
  followUp: { zh: '继续追问…', en: 'Follow up…' },
  approvalNeeded: { zh: '需要审批', en: 'Approval needed' },
  approve: { zh: '批准', en: 'Approve' },
  always: { zh: '总是允许', en: 'Always' },
  deny: { zh: '拒绝', en: 'Deny' },
  approvalGranted: { zh: '已批准', en: 'Approval granted' },
  approvalDenied: { zh: '已拒绝', en: 'Approval denied' },
  reasoning: { zh: '思考过程', en: 'Reasoning' },
  finished: { zh: '已完成', en: 'Finished' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  failed: { zh: '失败', en: 'Failed' },
  noMessages: { zh: '还没有消息', en: 'No messages yet' },
  importedHint: { zh: '已导入的会话 — 历史来自 CLI 记录', en: 'Imported session — history comes from CLI records' },
  queueTip: { zh: '排队：等当前任务结束后发送', en: 'Queue: send after the current turn' },
  steerTip: { zh: '插入：立即注入正在进行的任务', en: 'Steer: inject into the active turn now' },
  stopBtn: { zh: '停止', en: 'Stop' },
  planStatus: { zh: '任务计划', en: 'Plan' },
  contextUsage: { zh: '上下文', en: 'Context' },
  // new session
  newSession: { zh: '新建会话', en: 'New Session' },
  agent: { zh: 'Agent', en: 'Agent' },
  projectDir: { zh: '项目目录', en: 'PROJECT DIRECTORY' },
  model: { zh: '模型', en: 'MODEL' },
  modelOptional: { zh: '模型 · 可选', en: 'MODEL · OPTIONAL' },
  effort: { zh: '思考强度', en: 'EFFORT' },
  speed: { zh: '速度', en: 'SPEED' },
  permMode: { zh: '权限模式', en: 'PERMISSION MODE' },
  cursorMode: { zh: '交互模式', en: 'MODE' },
  initialPrompt: { zh: '初始指令 · 可选', en: 'INITIAL PROMPT · OPTIONAL' },
  describeTask: { zh: '描述任务…', en: 'Describe the task…' },
  startSession: { zh: '开始会话', en: 'Start Session' },
  starting: { zh: '启动中…', en: 'Starting…' },
  useThisDir: { zh: '使用此目录', en: 'Use' },
  customModel: { zh: '自定义…', en: 'Custom…' },
  cliDefault: { zh: 'CLI 默认', en: 'CLI default' },
  // settings
  settings: { zh: '设置', en: 'Settings' },
  appearance: { zh: '外观', en: 'Appearance' },
  theme: { zh: '主题', en: 'Theme' },
  language: { zh: '语言', en: 'Language' },
  sendKey: { zh: '发送快捷键', en: 'Send with' },
  connectedClis: { zh: '已连接的 CLI', en: 'Connected CLIs' },
  server: { zh: '服务器', en: 'Server' },
  tunnelRelay: { zh: '隧道 / 中转', en: 'Tunnel / Relay' },
  disconnect: { zh: '断开连接', en: 'Disconnect' },
  about: { zh: '关于', en: 'About' },
  online: { zh: '在线', en: 'online' },
  offline: { zh: '离线', en: 'offline' },
  connecting: { zh: '连接中', en: 'connecting' },
  // connect
  connectTitle: { zh: '随处控制 Codex · Claude · Cursor', en: 'Control Codex · Claude · Cursor from anywhere' },
  direct: { zh: '直连', en: 'Direct' },
  pairing: { zh: '配对', en: 'Pairing' },
  relay: { zh: '中转', en: 'Relay' },
  serverAddr: { zh: '服务器地址', en: 'SERVER ADDRESS' },
  password: { zh: '密码 / 密钥', en: 'PASSWORD / KEY' },
  pairingCode: { zh: '配对码', en: 'PAIRING CODE' },
  connect: { zh: '连接', en: 'Connect' },
  pair: { zh: '配对', en: 'Pair' },
  savedServers: { zh: '已保存的服务器', en: 'Saved servers' },
  // slash
  slashTitle: { zh: '命令', en: 'Commands' },
  runCmd: { zh: '执行', en: 'Run' },
  argsHint: { zh: '参数…', en: 'arguments…' },
} as const;

export type I18nKey = keyof typeof dict;

export function t(key: I18nKey, lang: Lang): string {
  return dict[key][lang];
}

export function useT(): (key: I18nKey) => string {
  const lang = useOrbix(s => s.lang);
  return (key) => dict[key][lang];
}
