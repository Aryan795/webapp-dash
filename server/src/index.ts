import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WebSocket } from 'ws';
import { HA_URL, HA_TOKEN, PORT } from './config.ts';
import { HaClient } from './ha-client.ts';
import { StateCache, type Entity } from './state-cache.ts';
import { isAllowed } from './allowlist.ts';
import { ScreenController } from './screen.ts';

// A wall-panel server must never die to a stray rejection; log loudly and live on.
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('uncaughtException:', err));

const ha = new HaClient();
const cache = new StateCache(ha);
const screen = new ScreenController(cache);
ha.connect();

const app = Fastify({ logger: { level: 'warn' } });
await app.register(fastifyWebsocket);

// ---------- tablet websocket ----------
const clients = new Set<WebSocket>();

function broadcast(msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

cache.on('patch', (e: Entity) => broadcast({ type: 'state_changed', entity: e }));
cache.on('remove', (entity_id: string) => broadcast({ type: 'removed', entity_id }));
cache.on('reset', () => broadcast({ type: 'snapshot', ...cache.snapshot() }));
cache.on('status', (s: string) => broadcast({ type: 'ha_status', status: s }));
screen.on('change', (state: string) => broadcast({ type: 'screen', state }));

app.register(async (scope) => {
  scope.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: 'snapshot', ...cache.snapshot() }));
    socket.send(JSON.stringify({ type: 'screen', state: screen.state }));

    socket.on('message', async (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(raw)); } catch { return; }

      switch (msg.type) {
        case 'get_snapshot':
          socket.send(JSON.stringify({ type: 'snapshot', ...cache.snapshot() }));
          return;
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong', id: msg.id }));
          return;
        case 'screen_wake': // tablet-side wake: tap on the dim overlay or camera motion
          screen.wake(msg.reason === 'camera' ? 'camera motion' : 'tap');
          return;
        case 'call_service': {
          const { id, domain, service, target, service_data } = msg as {
            id: number; domain: string; service: string;
            target?: Record<string, unknown>; service_data?: Record<string, unknown>;
          };
          const reply = (ok: boolean, error?: string) =>
            socket.send(JSON.stringify({ type: 'result', id, success: ok, error }));
          if (typeof domain !== 'string' || typeof service !== 'string' || !isAllowed(domain, service)) {
            reply(false, `service not allowed: ${domain}.${service}`);
            return;
          }
          try {
            await ha.send({ type: 'call_service', domain, service, target, service_data });
            reply(true);
          } catch (err) {
            reply(false, (err as Error).message);
          }
          return;
        }
      }
    });

    socket.on('close', () => clients.delete(socket));
  });
});

// ---------- REST proxies (token stays server-side) ----------
app.get('/api/camera/:entity', async (req, res) => {
  const { entity } = req.params as { entity: string };
  if (!/^camera\.[a-z0-9_]+$/.test(entity)) return res.code(400).send('bad entity');
  const up = await fetch(`${HA_URL}/api/camera_proxy/${entity}`, {
    headers: { Authorization: `Bearer ${HA_TOKEN}` },
  });
  if (!up.ok) return res.code(up.status).send('camera unavailable');
  res.header('content-type', up.headers.get('content-type') ?? 'image/jpeg');
  res.header('cache-control', 'no-store');
  return res.send(Buffer.from(await up.arrayBuffer()));
});

app.get('/api/history', async (req, res) => {
  const { entity_id, hours = '24' } = req.query as { entity_id?: string; hours?: string };
  if (!entity_id || !/^[a-z_]+\.[a-z0-9_]+$/.test(entity_id)) return res.code(400).send('bad entity_id');
  const h = Math.min(Math.max(Number(hours) || 24, 1), 168);
  const start = new Date(Date.now() - h * 3600_000).toISOString();
  const url = `${HA_URL}/api/history/period/${start}?filter_entity_id=${entity_id}&minimal_response&no_attributes`;
  const up = await fetch(url, { headers: { Authorization: `Bearer ${HA_TOKEN}` } });
  if (!up.ok) return res.code(up.status).send('history unavailable');
  const data = await up.json() as { state: string; last_changed: string }[][];
  const series = (data[0] ?? [])
    .map(p => ({ t: p.last_changed, v: Number(p.state) }))
    .filter(p => Number.isFinite(p.v));
  return res.send(series);
});

app.get('/api/statistics', async (req, res) => {
  const { entity_id, days = '7' } = req.query as { entity_id?: string; days?: string };
  if (!entity_id) return res.code(400).send('bad entity_id');
  const d = Math.min(Math.max(Number(days) || 7, 1), 30);
  try {
    const result = await ha.send({
      type: 'recorder/statistics_during_period',
      start_time: new Date(Date.now() - d * 86400_000).toISOString(),
      statistic_ids: [entity_id],
      period: 'day',
    });
    return res.send((result as Record<string, unknown[]>)[entity_id] ?? []);
  } catch (err) {
    return res.code(502).send((err as Error).message);
  }
});

app.get('/healthz', async () => ({ ok: true, ha: cache.haStatus, entities: cache.snapshot().entities.length }));

// ---------- static SPA (production build) ----------
const webDist = resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, res) => {
    if (req.raw.url?.startsWith('/api') || req.raw.url?.startsWith('/ws')) return res.code(404).send();
    return res.sendFile('index.html');
  });
}

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`dashboard server on :${PORT} → ${HA_URL}`);
