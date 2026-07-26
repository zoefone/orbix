import type { AgentCapabilities, AgentKind, Attachment, CliStatus, NativeSession, Session, SessionStatus, SessionUsage, PlanEntry, TimelineEvent, ToolKind } from '@orbix/shared';

/** Event payload as produced by adapters; manager assigns id/seq/ts/sessionId */
export type AdapterEvent =
  | { type: 'user_message'; text: string; attachments?: Attachment[] }
  | { type: 'agent_message'; text: string; streaming?: boolean }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; toolId: string; kind: ToolKind; title: string; detail?: string; command?: string; status: 'running' | 'done' | 'error'; output?: string; diffPath?: string; diffAdded?: number; diffRemoved?: number; patch?: string }
  | { type: 'tool_update'; toolId: string; status?: 'running' | 'done' | 'error'; output?: string; diffPath?: string; diffAdded?: number; diffRemoved?: number; patch?: string }
  | { type: 'permission_request'; requestId: string; tool: string; title: string; detail?: string; command?: string }
  | { type: 'permission_resolved'; requestId: string; decision: 'allow' | 'allow_session' | 'deny' }
  | { type: 'turn_status'; state: 'started' | 'completed' | 'failed' | 'cancelled'; error?: string }
  | { type: 'session_status'; status: SessionStatus }
  | { type: 'usage'; usage: SessionUsage }
  | { type: 'plan'; entries: PlanEntry[] };

export interface AdapterCallbacks {
  emit(sessionId: string, ev: AdapterEvent): void;
}

export interface AgentAdapter {
  kind: AgentKind;
  detect(): Promise<CliStatus>;
  /** start backing process for a session (new or resume), optionally with first prompt */
  start(session: Session, cb: AdapterCallbacks, prompt?: string, attachments?: Attachment[]): Promise<void>;
  send(session: Session, text: string, attachments?: Attachment[], deliver?: 'queue' | 'steer'): Promise<void>;
  interrupt(session: Session): Promise<void>;
  respondPermission(session: Session, requestId: string, decision: 'allow' | 'allow_session' | 'deny'): Promise<void>;
  dispose(session: Session): Promise<void>;
  listNative(): Promise<NativeSession[]>;
  /** models/modes/efforts/permission options this CLI supports */
  capabilities(session?: Session): Promise<AgentCapabilities>;
  /** execute a slash command natively when possible; return false to let manager send it as text */
  execCommand(session: Session, command: string, args?: string): Promise<boolean>;
  /** runtime config change (model/effort/speed/mode/permissionMode) */
  applyConfig(session: Session): Promise<void>;
  /** backfill timeline events from the native transcript of an imported session */
  readHistory(session: Session, limit?: number): Promise<AdapterEvent[]>;
}

export function clip(s: string | undefined, n = 4000): string | undefined {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more chars)` : s;
}
