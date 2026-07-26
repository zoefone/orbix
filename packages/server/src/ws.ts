import type { WebSocket } from 'ws';
import type { ClientCommand, PushFrame } from '@orbix/shared';
import { ClientFrame } from '@orbix/shared';
import { verifyToken } from './auth.js';
import type { OrbixConfig } from './config.js';
import type { SessionManager } from './manager.js';
import { browseDir } from './http.js';

export class WsHub {
  private clients = new Set<WebSocket>();

  constructor(private config: OrbixConfig, private manager: SessionManager) {
    manager.onPush((frame) => this.broadcast(frame));
  }

  broadcast(frame: PushFrame) {
    const data = JSON.stringify(frame);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) { try { ws.send(data); } catch { } }
    }
  }

  handleConnection(ws: WebSocket, token: string) {
    if (!verifyToken(this.config, token)) {
      ws.send(JSON.stringify({ rid: '0', ok: false, error: 'unauthorized' }));
      ws.close(4001, 'unauthorized');
      return;
    }
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));
    ws.send(JSON.stringify({ rid: '0', ok: true, data: { machine: this.config.machineName, protocol: 1 } }));

    ws.on('message', async (raw) => {
      let parsed: unknown;
      try { parsed = JSON.parse(String(raw)); } catch { return; }
      const frame = ClientFrame.safeParse(parsed);
      if (!frame.success) {
        ws.send(JSON.stringify({ rid: (parsed as { rid?: string }).rid || '?', ok: false, error: 'bad frame: ' + frame.error.issues.map(i => i.path.join('.') + ' ' + i.message).join(', ').slice(0, 300) }));
        return;
      }
      const { rid, ...cmd } = frame.data;
      try {
        const data = await this.dispatch(cmd as ClientCommand);
        ws.send(JSON.stringify({ rid, ok: true, data: data === undefined ? null : data }));
      } catch (err) {
        ws.send(JSON.stringify({ rid, ok: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
  }

  private async dispatch(cmd: ClientCommand): Promise<unknown> {
    const m = this.manager;
    switch (cmd.cmd) {
      case 'session.list': return m.listSessions();
      case 'session.get': return m.getSession(cmd.id) || null;
      case 'session.create': return m.createSession(cmd);
      case 'session.import': return m.importSession(cmd);
      case 'session.update': return m.updateSession(cmd.id, cmd.patch);
      case 'session.delete': await m.deleteSession(cmd.id); return null;
      case 'timeline.list': return m.listEvents(cmd.sessionId, cmd.beforeSeq, cmd.limit);
      case 'message.send': await m.sendMessage(cmd.sessionId, cmd.text, cmd.attachments, cmd.deliver); return null;
      case 'command.exec': await m.execCommand(cmd.sessionId, cmd.command, cmd.args); return null;
      case 'agent.capabilities': return m.capabilities(cmd.agent);
      case 'turn.interrupt': await m.interrupt(cmd.sessionId); return null;
      case 'permission.respond': await m.respondPermission(cmd.sessionId, cmd.requestId, cmd.decision); return null;
      case 'fs.list': return browseDir(cmd.path);
      case 'native.list': return m.listNative(cmd.agent);
      case 'cli.status': return m.cliStatus();
      case 'watch': return { ts: Date.now() };
      default: throw new Error('unknown command');
    }
  }
}
