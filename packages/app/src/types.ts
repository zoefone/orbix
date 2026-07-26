// Protocol types mirrored from @orbix/shared (kept local so Metro stays self-contained)
export type AgentKind = 'codex' | 'claude' | 'cursor';
export type PermissionMode = 'plan' | 'default' | 'acceptEdits' | 'bypass' | 'yolo' | 'run-everything' | 'ask';
export type SessionStatus = 'idle' | 'running' | 'awaiting_approval' | 'error' | 'closed';

export interface Attachment {
  id: string; name: string; size: number; mime: string; path: string; url: string;
}

export interface SessionUsage { totalTokens: number; contextWindow?: number; percent?: number; cost?: number }
export interface PlanEntry { content: string; status?: string }

export interface Session {
  id: string; agent: AgentKind; title: string; cwd: string; project: string;
  model?: string; effort?: string; speed?: string; mode?: string;
  permissionMode: PermissionMode; status: SessionStatus;
  nativeSessionId?: string; origin: 'created' | 'imported';
  pinned: boolean; archived: boolean; createdAt: number; updatedAt: number;
  diffAdded: number; diffRemoved: number; lastError?: string;
  usage?: SessionUsage; plan?: PlanEntry[];
}

export interface ModelInfo { id: string; name: string; efforts?: string[]; tiers?: string[]; isDefault?: boolean }
export interface ModeInfo { id: string; name: string; description?: string }
export interface PermOption { id: string; label: string; description?: string }
export interface AgentCapabilities {
  agent: AgentKind;
  models: ModelInfo[];
  efforts: string[];
  speeds: string[];
  modes: ModeInfo[];
  permOptions: PermOption[];
  slashCommands: Array<{ name: string; description: string; needsArgs?: boolean }>;
  supportsQueue: boolean;
  supportsSteer: boolean;
}

export type TimelineEvent = {
  id: string; sessionId: string; seq: number; ts: number;
} & (
  | { type: 'user_message'; text: string; attachments?: Attachment[] }
  | { type: 'agent_message'; text: string; streaming?: boolean }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; toolId: string; kind: string; title: string; detail?: string; command?: string; status: 'running' | 'done' | 'error'; output?: string; diffPath?: string; diffAdded?: number; diffRemoved?: number; patch?: string }
  | { type: 'tool_update'; toolId: string; status?: 'running' | 'done' | 'error'; output?: string; diffPath?: string; diffAdded?: number; diffRemoved?: number; patch?: string }
  | { type: 'permission_request'; requestId: string; tool: string; title: string; detail?: string; command?: string }
  | { type: 'permission_resolved'; requestId: string; decision: 'allow' | 'allow_session' | 'deny' }
  | { type: 'turn_status'; state: 'started' | 'completed' | 'failed' | 'cancelled'; error?: string }
  | { type: 'session_status'; status: SessionStatus }
  | { type: 'usage'; usage: SessionUsage }
  | { type: 'plan'; entries: PlanEntry[] }
);

export interface NativeSession {
  agent: AgentKind; nativeId: string; title: string; cwd: string; model?: string; updatedAt: number;
}

export interface CliStatus {
  agent: AgentKind; installed: boolean; version?: string; path?: string;
}

export type ClientCommand =
  | { cmd: 'session.list' }
  | { cmd: 'session.get'; id: string }
  | { cmd: 'session.create'; agent: AgentKind; cwd: string; model?: string; permissionMode: PermissionMode; prompt?: string; attachments?: Attachment[] }
  | { cmd: 'session.import'; agent: AgentKind; nativeId: string; cwd: string; title?: string; model?: string }
  | { cmd: 'session.update'; id: string; patch: Partial<Pick<Session, 'title' | 'pinned' | 'archived' | 'permissionMode' | 'model' | 'effort' | 'speed' | 'mode'>> }
  | { cmd: 'session.delete'; id: string }
  | { cmd: 'timeline.list'; sessionId: string; beforeSeq?: number; limit?: number }
  | { cmd: 'message.send'; sessionId: string; text: string; attachments?: Attachment[]; deliver?: 'queue' | 'steer' }
  | { cmd: 'command.exec'; sessionId: string; command: string; args?: string }
  | { cmd: 'agent.capabilities'; agent?: AgentKind }
  | { cmd: 'turn.interrupt'; sessionId: string }
  | { cmd: 'permission.respond'; sessionId: string; requestId: string; decision: 'allow' | 'allow_session' | 'deny' }
  | { cmd: 'fs.list'; path?: string }
  | { cmd: 'native.list'; agent?: AgentKind }
  | { cmd: 'cli.status' }
  | { cmd: 'watch'; paths: string[] };

export type PushFrame =
  | { push: 'session'; session: Session }
  | { push: 'event'; event: TimelineEvent }
  | { push: 'notify'; level: 'info' | 'approval' | 'done' | 'error'; sessionId: string; title: string; body: string; requestId?: string };
