import { z } from 'zod';

// ============ Core domain ============

export const AgentKind = z.enum(['codex', 'claude', 'cursor']);
export type AgentKind = z.infer<typeof AgentKind>;

export const PermissionMode = z.enum(['plan', 'default', 'acceptEdits', 'bypass', 'yolo', 'run-everything', 'ask']);
export type PermissionMode = z.infer<typeof PermissionMode>;

export const SessionStatus = z.enum(['idle', 'running', 'awaiting_approval', 'error', 'closed']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const Attachment = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  mime: z.string(),
  /** server-side absolute path (injected into prompts) */
  path: z.string(),
  /** url path for clients to fetch/display, e.g. /api/uploads/<id> */
  url: z.string(),
});
export type Attachment = z.infer<typeof Attachment>;

export const SessionUsage = z.object({
  totalTokens: z.number(),
  contextWindow: z.number().optional(),
  percent: z.number().optional(),
  cost: z.number().optional(),
});
export type SessionUsage = z.infer<typeof SessionUsage>;

export const PlanEntry = z.object({
  content: z.string(),
  status: z.string().optional(), // pending | in_progress | completed
});
export type PlanEntry = z.infer<typeof PlanEntry>;

export const Session = z.object({
  id: z.string(),
  agent: AgentKind,
  title: z.string(),
  cwd: z.string(),
  project: z.string(),
  model: z.string().optional(),
  effort: z.string().optional(),
  speed: z.string().optional(),
  /** cursor interaction mode: agent | plan | ask */
  mode: z.string().optional(),
  permissionMode: PermissionMode,
  status: SessionStatus,
  /** native CLI session id (claude session uuid / codex thread id / cursor chat id) */
  nativeSessionId: z.string().optional(),
  origin: z.enum(['created', 'imported']),
  pinned: z.boolean(),
  archived: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  diffAdded: z.number(),
  diffRemoved: z.number(),
  lastError: z.string().optional(),
  usage: SessionUsage.optional(),
  plan: z.array(PlanEntry).optional(),
});
export type Session = z.infer<typeof Session>;

// ============ Timeline events ============

export const ToolKind = z.enum(['shell', 'read', 'edit', 'write', 'search', 'mcp', 'web', 'other']);
export type ToolKind = z.infer<typeof ToolKind>;

const EventBase = z.object({
  id: z.string(),
  sessionId: z.string(),
  seq: z.number(),
  ts: z.number(),
});

export const TimelineEvent = z.discriminatedUnion('type', [
  EventBase.extend({
    type: z.literal('user_message'),
    text: z.string(),
    attachments: z.array(Attachment).optional(),
  }),
  EventBase.extend({
    type: z.literal('agent_message'),
    /** full markdown text of the message (grows while streaming) */
    text: z.string(),
    streaming: z.boolean().optional(),
  }),
  EventBase.extend({
    type: z.literal('reasoning'),
    text: z.string(),
  }),
  EventBase.extend({
    type: z.literal('tool_call'),
    toolId: z.string(),
    kind: ToolKind,
    title: z.string(),
    detail: z.string().optional(),
    command: z.string().optional(),
    status: z.enum(['running', 'done', 'error']),
    output: z.string().optional(),
    diffPath: z.string().optional(),
    diffAdded: z.number().optional(),
    diffRemoved: z.number().optional(),
    patch: z.string().optional(),
  }),
  EventBase.extend({
    type: z.literal('tool_update'),
    toolId: z.string(),
    status: z.enum(['running', 'done', 'error']).optional(),
    output: z.string().optional(),
    diffPath: z.string().optional(),
    diffAdded: z.number().optional(),
    diffRemoved: z.number().optional(),
    patch: z.string().optional(),
  }),
  EventBase.extend({
    type: z.literal('permission_request'),
    requestId: z.string(),
    tool: z.string(),
    title: z.string(),
    detail: z.string().optional(),
    command: z.string().optional(),
  }),
  EventBase.extend({
    type: z.literal('permission_resolved'),
    requestId: z.string(),
    decision: z.enum(['allow', 'allow_session', 'deny']),
  }),
  EventBase.extend({
    type: z.literal('turn_status'),
    state: z.enum(['started', 'completed', 'failed', 'cancelled']),
    error: z.string().optional(),
  }),
  EventBase.extend({
    type: z.literal('session_status'),
    status: SessionStatus,
  }),
  EventBase.extend({
    type: z.literal('usage'),
    usage: SessionUsage,
  }),
  EventBase.extend({
    type: z.literal('plan'),
    entries: z.array(PlanEntry),
  }),
]);
export type TimelineEvent = z.infer<typeof TimelineEvent>;

// ============ Native (discovered) sessions ============

export const NativeSession = z.object({
  agent: AgentKind,
  nativeId: z.string(),
  title: z.string(),
  cwd: z.string(),
  model: z.string().optional(),
  updatedAt: z.number(),
});
export type NativeSession = z.infer<typeof NativeSession>;

export const CliStatus = z.object({
  agent: AgentKind,
  installed: z.boolean(),
  version: z.string().optional(),
  path: z.string().optional(),
  authed: z.boolean().optional(),
});
export type CliStatus = z.infer<typeof CliStatus>;

// ============ Agent capabilities ============

export const ModelInfo = z.object({
  id: z.string(),
  name: z.string(),
  efforts: z.array(z.string()).optional(),
  tiers: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export const ModeInfo = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type ModeInfo = z.infer<typeof ModeInfo>;

export const PermOption = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});
export type PermOption = z.infer<typeof PermOption>;

export const AgentCapabilities = z.object({
  agent: AgentKind,
  models: z.array(ModelInfo),
  efforts: z.array(z.string()),
  speeds: z.array(z.string()),
  modes: z.array(ModeInfo),
  permOptions: z.array(PermOption),
  slashCommands: z.array(z.object({ name: z.string(), description: z.string(), needsArgs: z.boolean().optional() })),
  supportsQueue: z.boolean(),
  supportsSteer: z.boolean(),
});
export type AgentCapabilities = z.infer<typeof AgentCapabilities>;

// ============ WS RPC protocol ============

export const ClientCommand = z.discriminatedUnion('cmd', [
  z.object({ cmd: z.literal('session.list') }),
  z.object({ cmd: z.literal('session.get'), id: z.string() }),
  z.object({
    cmd: z.literal('session.create'),
    agent: AgentKind,
    cwd: z.string(),
    model: z.string().optional(),
    permissionMode: PermissionMode,
    prompt: z.string().optional(),
    attachments: z.array(Attachment).optional(),
  }),
  z.object({
    cmd: z.literal('session.import'),
    agent: AgentKind,
    nativeId: z.string(),
    cwd: z.string(),
    title: z.string().optional(),
    model: z.string().optional(),
  }),
  z.object({
    cmd: z.literal('session.update'),
    id: z.string(),
    patch: z.object({
      title: z.string().optional(),
      pinned: z.boolean().optional(),
      archived: z.boolean().optional(),
      permissionMode: PermissionMode.optional(),
      model: z.string().optional(),
      effort: z.string().optional(),
      speed: z.string().optional(),
      mode: z.string().optional(),
    }),
  }),
  z.object({ cmd: z.literal('session.delete'), id: z.string() }),
  z.object({ cmd: z.literal('timeline.list'), sessionId: z.string(), beforeSeq: z.number().optional(), limit: z.number().optional() }),
  z.object({
    cmd: z.literal('message.send'),
    sessionId: z.string(),
    text: z.string(),
    attachments: z.array(Attachment).optional(),
    /** how to deliver while the agent is working: queue (default) or steer (inject into active turn) */
    deliver: z.enum(['queue', 'steer']).optional(),
  }),
  z.object({
    cmd: z.literal('command.exec'),
    sessionId: z.string(),
    command: z.string(), // e.g. "goal", "compact", "sandbox read-only"
    args: z.string().optional(),
  }),
  z.object({ cmd: z.literal('agent.capabilities'), agent: AgentKind.optional() }),
  z.object({ cmd: z.literal('turn.interrupt'), sessionId: z.string() }),
  z.object({
    cmd: z.literal('permission.respond'),
    sessionId: z.string(),
    requestId: z.string(),
    decision: z.enum(['allow', 'allow_session', 'deny']),
  }),
  z.object({ cmd: z.literal('fs.list'), path: z.string().optional() }),
  z.object({ cmd: z.literal('native.list'), agent: AgentKind.optional() }),
  z.object({ cmd: z.literal('cli.status') }),
  z.object({ cmd: z.literal('watch'), paths: z.array(z.string()) }), // no-op keepalive
]);
export type ClientCommand = z.infer<typeof ClientCommand>;

/** client -> server frame */
export const ClientFrame = z.object({
  rid: z.string(),
}).and(ClientCommand);
export type ClientFrame = z.infer<typeof ClientFrame>;

/** server -> client: RPC result */
export const ResultFrame = z.object({
  rid: z.string(),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});
export type ResultFrame = z.infer<typeof ResultFrame>;

/** server -> client: unsolicited push */
export const PushFrame = z.discriminatedUnion('push', [
  z.object({ push: z.literal('session'), session: Session }),
  z.object({ push: z.literal('event'), event: TimelineEvent }),
  z.object({ push: z.literal('notify'), level: z.enum(['info', 'approval', 'done', 'error']), sessionId: z.string(), title: z.string(), body: z.string(), requestId: z.string().optional() }),
]);
export type PushFrame = z.infer<typeof PushFrame>;

export const PROTOCOL_VERSION = 1;

export function projectName(cwd: string): string {
  const parts = cwd.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || cwd;
}
