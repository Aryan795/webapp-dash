import type { ServerMessage } from '../types';

type Handler = (msg: ServerMessage) => void;

/**
 * Reconnecting socket to the dashboard server. The server owns the HA
 * connection; this link is tokenless.
 */
class DashSocket {
  private ws: WebSocket | null = null;
  private handler: Handler = () => {};
  private msgId = 0;
  private backoff = 500;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  onLink: (up: boolean) => void = () => {};

  start(handler: Handler): void {
    this.handler = handler;
    this.connect();
  }

  private connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 500;
      this.onLink(true);
      this.startPing();
    };
    ws.onmessage = (ev) => this.handler(JSON.parse(ev.data));
    ws.onclose = () => {
      this.stopPing();
      this.onLink(false);
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, 15_000);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.raw({ type: 'ping', id: ++this.msgId }), 25_000);
  }
  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private raw(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  screenWake(reason: 'tap' | 'camera' = 'tap'): void {
    this.raw({ type: 'screen_wake', reason });
  }

  callService(domain: string, service: string, entity_id?: string, service_data?: Record<string, unknown>): number {
    const id = ++this.msgId;
    this.raw({
      type: 'call_service', id, domain, service,
      target: entity_id ? { entity_id } : undefined,
      service_data,
    });
    return id;
  }
}

export const socket = new DashSocket();
