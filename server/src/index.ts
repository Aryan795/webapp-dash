import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WebSocket } from 'ws';
import { ALLOWED_ORIGINS, HA_URL, HA_TOKEN, PORT, type VirtualFan } from './config.ts';
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

const webDist = resolve(import.meta.dirname, '../../web/dist');

/**
 * Path of the JS bundle this server serves, read from index.html. Every snapshot
 * carries it, so a wall panel still running an older bundle notices a deploy
 * and reloads itself instead of mis-reading a newer protocol.
 */
const build = (() => {
  try {
    return /src="([^"]*\/assets\/[^"]+\.js)"/.exec(readFileSync(resolve(webDist, 'index.html'), 'utf8'))?.[1];
  } catch {
    return undefined;
  }
})();
const snapshot = () => ({ type: 'snapshot', ...cache.snapshot(), build });

// ---------- virtual fans ----------
// A browser only ever sends `fan.*` for these (and only after passing the
// allowlist). The button presses below are issued by the server, so a kiosk
// browser still cannot press arbitrary buttons — `button` stays out of the
// allowlist deliberately.
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One fan's commands run one at a time, so two quick calls can't interleave IR presses. */
const fanQueues = new Map<string, Promise<void>>();
function serial(key: string, job: () => Promise<void>): Promise<void> {
  const run = (fanQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(job);
  fanQueues.set(key, run);
  return run;
}

async function callVirtualFan(
  v: VirtualFan, service: string, service_data?: Record<string, unknown>,
): Promise<void> {
  const powerDomain = v.power.split('.')[0];
  const press = (entity_id: string) =>
    ha.send({ type: 'call_service', domain: 'button', service: 'press', target: { entity_id } });
  const setPower = (svc: string) =>
    ha.send({ type: 'call_service', domain: powerDomain, service: svc, target: { entity_id: v.power } });
  const isOn = () => cache.stateOf(v.power) === 'on';
  // Some fans forget their speed when mains is cut and need the IR power key too.
  const kick = async () => {
    if (!v.powerButton) return;
    await sleep(1000);
    await press(v.powerButton);
  };

  switch (service) {
    case 'turn_off':
      await setPower('turn_off');
      return;
    case 'turn_on':
    case 'toggle': {
      const wasOn = isOn();
      await setPower(service);
      if (!wasOn) await kick(); // only on the way up, never when it was already running
      return;
    }
    case 'set_percentage': {
      const raw = service_data?.percentage;
      const pct = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
      // a missing value must not read as 0 and cut the fan's mains
      if (!Number.isFinite(pct)) throw new Error('fan.set_percentage needs a numeric percentage');
      if (pct <= 0) {
        await setPower('turn_off');
        return;
      }
      const n = v.speeds.length;
      const idx = Math.min(n, Math.max(1, Math.round(pct / (100 / n))));
      if (!isOn()) {
        await setPower('turn_on');
        await kick();
        await sleep(400); // let the IR receiver come up before aiming at it
      }
      await press(v.speeds[idx - 1]);
      cache.setVirtualSpeed(v.entity_id, idx);
      return;
    }
    default:
      throw new Error(`service not supported on a virtual fan: fan.${service}`);
  }
}

// ---------- tablet websocket ----------
const clients = new Set<WebSocket>();

function broadcast(msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

cache.on('patch', (e: Entity) => broadcast({ type: 'state_changed', entity: e }));
cache.on('remove', (entity_id: string) => broadcast({ type: 'removed', entity_id }));
cache.on('reset', () => broadcast(snapshot()));
cache.on('status', (s: string) => broadcast({ type: 'ha_status', status: s }));
screen.on('change', (state: string) => broadcast({ type: 'screen', state }));

/**
 * The socket is tokenless, and a browser lets any web page open a WebSocket to
 * a LAN or tailnet address (Safari doesn't even ask). Accept only the dashboard's
 * own origin plus ALLOWED_ORIGINS. Non-browser clients send no Origin and pass.
 */
function originAllowed(origin: string | undefined, hosts: (string | undefined)[]): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    return hosts.includes(new URL(origin).host);
  } catch {
    return false;
  }
}

app.register(async (scope) => {
  scope.get('/ws', {
    websocket: true,
    preValidation: async (req, reply) => {
      const fwd = req.headers['x-forwarded-host'];
      const hosts = [req.headers.host, Array.isArray(fwd) ? fwd[0] : fwd];
      if (!originAllowed(req.headers.origin, hosts)) {
        console.warn(`refused /ws from origin ${req.headers.origin} (host ${req.headers.host}); `
          + 'if this is your own proxy, add it to ALLOWED_ORIGINS');
        return reply.code(403).send('cross-origin websocket refused');
      }
    },
  }, (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify(snapshot()));
    socket.send(JSON.stringify({ type: 'screen', state: screen.state }));

    socket.on('message', async (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(raw)); } catch { return; }

      switch (msg.type) {
        case 'get_snapshot':
          socket.send(JSON.stringify(snapshot()));
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
          const rawIds = target?.entity_id;
          const ids = (Array.isArray(rawIds) ? rawIds : [rawIds]).filter((x): x is string => typeof x === 'string');
          const virtual = ids.map(i => cache.virtualFor(i)).filter((v): v is VirtualFan => !!v);
          try {
            if (virtual.length) {
              // virtual fans exist only here; HA would reject their ids
              if (domain !== 'fan' || ids.length !== 1) throw new Error('a virtual fan takes fan.* calls on its own');
              const v = virtual[0];
              await serial(v.entity_id, () => callVirtualFan(v, service, service_data));
            } else {
              await ha.send({ type: 'call_service', domain, service, target, service_data });
            }
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
// One route per file is registered at boot (wildcard: false), so a new web build
// needs a server restart — which a container rebuild does anyway.
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, res) => {
    if (req.raw.url?.startsWith('/api') || req.raw.url?.startsWith('/ws')) return res.code(404).send();
    return res.sendFile('index.html');
  });
} else {
  console.warn(`no web build at ${webDist} — API only. Run \`npm run build\` first.`);
}

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`dashboard server on :${PORT} → ${HA_URL}${build ? ` · serving ${build}` : ''}`);
