import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { HA_URL, HA_TOKEN } from './config.ts';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

/**
 * Single authenticated WebSocket to Home Assistant with automatic reconnect.
 * Emits: 'ready' (after auth + resubscribe), 'event' (subscribed HA events),
 * 'status' ('connected' | 'reconnecting').
 */
export class HaClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, Pending>();
  private eventSubId: number | null = null;
  private backoff = 1000;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private alive = false;
  private closed = false;

  connect(): void {
    const url = HA_URL.replace(/^http/, 'ws') + '/api/websocket';
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('message', (data) => this.onMessage(JSON.parse(String(data))));
    ws.on('close', () => this.onDisconnect('close'));
    ws.on('error', (err) => {
      console.error('HA ws error:', err.message);
      ws.close();
    });
  }

  private onMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'auth_required':
        this.ws!.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }));
        return;
      case 'auth_ok':
        console.log(`HA connected (${msg.ha_version})`);
        this.backoff = 1000;
        this.alive = true;
        this.startHeartbeat();
        this.resubscribe()
          .then(() => {
            this.emit('status', 'connected');
            this.emit('ready');
          })
          .catch((err: Error) => {
            console.warn('resubscribe failed, recycling socket:', err.message);
            this.ws?.terminate();
          });
        return;
      case 'auth_invalid':
        console.error('HA rejected the token:', msg.message);
        return; // socket will close; reconnect keeps trying in case the token is rotated
      case 'result': {
        const p = this.pending.get(msg.id as number);
        if (!p) return;
        this.pending.delete(msg.id as number);
        if (msg.success) p.resolve(msg.result);
        else p.reject(new Error(JSON.stringify(msg.error)));
        return;
      }
      case 'event':
        if (msg.id === this.eventSubId) this.emit('event', msg.event);
        return;
      case 'pong': {
        this.alive = true;
        const p = this.pending.get(msg.id as number);
        if (p) {
          this.pending.delete(msg.id as number);
          p.resolve(null);
        }
        return;
      }
    }
  }

  private async resubscribe(): Promise<void> {
    const { id, result } = this.sendWithId({ type: 'subscribe_events', event_type: 'state_changed' });
    await result;
    this.eventSubId = id;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.alive) {
        console.warn('HA heartbeat missed; recycling socket');
        this.ws?.terminate();
        return;
      }
      this.alive = false;
      this.send({ type: 'ping' }).then(() => { this.alive = true; }).catch(() => {});
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private onDisconnect(why: string): void {
    if (this.closed) return;
    this.stopHeartbeat();
    for (const p of this.pending.values()) p.reject(new Error('HA connection lost'));
    this.pending.clear();
    this.eventSubId = null;
    this.emit('status', 'reconnecting');
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30_000);
    console.warn(`HA disconnected (${why}); retrying in ${delay}ms`);
    setTimeout(() => this.connect(), delay);
  }

  /** Send a command; resolves with HA's `result` payload. */
  send(cmd: Record<string, unknown>): Promise<unknown> {
    return this.sendWithId(cmd).result;
  }

  private sendWithId(cmd: Record<string, unknown>): { id: number; result: Promise<unknown> } {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return { id: -1, result: Promise.reject(new Error('HA not connected')) };
    }
    const id = ++this.msgId;
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, ...cmd }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`HA request timed out: ${cmd.type}`));
        }
      }, 15_000);
    });
    return { id, result };
  }

  destroy(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.ws?.close();
  }
}
