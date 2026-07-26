import type { ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Minimal JSON-RPC 2.0 client over newline-delimited stdio (works for codex app-server & ACP) */
export class JsonRpc {
  private nextId = 1;
  private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private handlers: ((msg: Record<string, unknown>) => void)[] = [];

  constructor(private proc: ChildProcess) {
    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(line); } catch { return; }
      if ('id' in msg && !('method' in msg)) {
        const p = this.pending.get(msg.id as number);
        if (p) {
          this.pending.delete(msg.id as number);
          if (msg.error) p.reject(new Error(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
        return;
      }
      for (const h of this.handlers) h(msg);
    });
  }

  onMessage(h: (msg: Record<string, unknown>) => void) { this.handlers.push(h); }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = 120_000): Promise<T> {
    const id = this.nextId++;
    const frame = JSON.stringify({ jsonrpc: '2.0', method, id, ...(params !== undefined ? { params } : {}) }) + '\n';
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.proc.stdin!.write(frame);
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`timeout: ${method}`)); }, timeoutMs);
    });
  }

  notify(method: string, params?: unknown) {
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) }) + '\n');
  }

  respond(id: number | string, result: unknown) {
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  }

  respondError(id: number | string, code: number, message: string) {
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
  }
}
