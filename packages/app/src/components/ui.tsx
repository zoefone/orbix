import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import type { Theme } from '../theme';
import type { AgentKind, SessionStatus } from '../types';

export function AgentMark({ agent, size = 22, theme }: { agent: AgentKind; size?: number; theme: Theme }) {
  const bg = agent === 'codex' ? theme.ink : agent === 'claude' ? theme.card2 : theme.accentSoft;
  const fg = agent === 'codex' ? theme.bg : agent === 'claude' ? theme.ink : theme.accent;
  const label = agent === 'codex' ? 'C' : agent === 'claude' ? '✻' : '◈';
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: agent === 'claude' ? StyleSheet.hairlineWidth : 0, borderColor: theme.line,
    }}>
      <Text style={{ color: fg, fontSize: size * 0.48, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function agentName(agent: AgentKind): string {
  return agent === 'codex' ? 'Codex' : agent === 'claude' ? 'Claude Code' : 'Cursor Agent';
}

export function StatusDot({ status, theme }: { status: SessionStatus | 'ok' | 'idle'; theme: Theme }) {
  const color = status === 'running' || status === 'awaiting_approval' ? theme.accent
    : status === 'error' ? theme.err : status === 'ok' ? theme.ok : theme.ink3;
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

export function StatusText({ status, theme }: { status: SessionStatus; theme: Theme }) {
  if (status === 'running') return <Text style={{ color: theme.accent, fontSize: 13.5 }}>Working…</Text>;
  if (status === 'awaiting_approval') return <Text style={{ color: theme.warn, fontSize: 13.5 }}>Needs approval</Text>;
  if (status === 'error') return <Text style={{ color: theme.err, fontSize: 13.5 }}>Error</Text>;
  return <Text style={{ color: theme.ink2, fontSize: 13.5 }}>Idle</Text>;
}

export function Chip({ label, active, onPress, theme, children }: { label?: string; active?: boolean; onPress?: () => void; theme: Theme; children?: React.ReactNode }) {
  return (
    <TouchableOpacity onPress={onPress} style={{
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 999, borderWidth: 1,
      backgroundColor: active ? theme.ink : theme.card,
      borderColor: active ? theme.ink : theme.line,
    }}>
      {children}
      {label && <Text style={{ fontSize: 13.5, fontWeight: '500', color: active ? theme.bg : theme.ink2 }}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function PillBtn({ label, onPress, primary, danger, theme, flex }: { label: string; onPress?: () => void; primary?: boolean; danger?: boolean; theme: Theme; flex?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={{
      paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
      backgroundColor: primary ? theme.ink : 'transparent',
      borderWidth: primary ? 0 : 1,
      borderColor: danger ? theme.err : theme.line,
      ...(flex ? { flex: 1, alignItems: 'center' as const } : {}),
    }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: primary ? theme.bg : danger ? theme.err : theme.ink }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
