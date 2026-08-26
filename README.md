# webapp-dash

Self-hosted wall-tablet dashboard for [Home Assistant](https://www.home-assistant.io/), built
for a 10" LineageOS tablet at 1280×800. React web app + Node token-proxy server + an optional
native Android kiosk app (**PanelKiosk**) — no Lovelace, no Fully Kiosk license.

## Why

- **Token never reaches the tablet.** The server holds the HA long-lived token, keeps one
  WebSocket to HA, and fans state out to tablets over a tokenless socket.
- **Service allowlist.** Browsers can only invoke approved `domain.service` pairs —
  `homeassistant.restart`, `shell_command.*` etc. are rejected server-side.
- **Survives everything.** Reconnect with backoff on both hops, heartbeats, service-worker app
  shell, optimistic updates with revert. Built to run for months on a wall.
- **Zero config to start.** Rooms auto-populate from the HA area registry; diagnostics, hidden
  entities and mobile_app noise are filtered server-side (~766 states → ~343 useful entities).

## Features

- **Home glance view** — greeting + weather, noteworthy-status chips (motion, media, printing),
  climate + energy heroes, Routines & Modes (`input_boolean`/`script` pills), Active-now grid,
  bottom bar with "All lights off".
- **Room views** from the sidebar; cards for light / switch / fan (speed) / climate / cover /
  media / camera / sensor / binary_sensor / number / select / counter, with a generic fallback.
- **12 switchable themes** (Gruvbox Hearth default; Mushroom, Catppuccin, Nord, AMOLED, E-ink,
  Material You tonal, glassmorphism…), runtime-switchable in Settings.
- **Motion screen control** — HA motion/occupancy sensors wake the panel, idle sleeps it
  (server-side state machine); plus in-page **camera motion wake** via `getUserMedia`.
- **PanelKiosk** (`android-kiosk/`) — native kiosk wrapper: fullscreen WebView, Fully-compatible
  `window.fully` JS bridge **and** Fully-compatible REST API on `:2323`, native CameraX motion
  wake, soft/true screen-off, boot autostart, and device-owner mode (silent pinning, remote
  `rebootDevice`, resident camera).

## Quick start

```bash
cp .env.example .env         # set HA_URL + HA_TOKEN (HA profile → Security)
docker compose up -d --build # serves on :8080
```

Open `http://<server>:8080` on the tablet. Dev mode: `npm install && npm run dev`
(Vite on :5173, server on :8080).

## Configuration (`config/dashboard.json`, hot-reloaded)

```jsonc
{
  "roomOrder": ["Hall", "Kitchen"],       // sidebar order; unknown rooms appended A→Z
  "hiddenEntities": [],                    // entity_ids to hide
  "areaOverrides": {},                     // entity_id → room name (fix area-less entities)
  "screen": {
    "motionSensors": [],                   // empty = all motion/occupancy sensors
    "offDelayMinutes": 5,                  // 0 disables sleeping
    "fullyHost": "",                       // tablet IP running PanelKiosk/Fully (:2323)
    "fullyPassword": ""
  }
}
```

## PanelKiosk (Android 8+, tested target: LineageOS / Android 10)

```bash
cd android-kiosk && gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
# optional, for silent pinning + remote reboot (remove all accounts first):
adb shell dpm set-device-owner dev.aryan.panelkiosk/.AdminReceiver
```

Settings: tap the top-left corner five times.

## Architecture

```
Home Assistant ◄── one authenticated WS ──► server (Fastify)
                                            · state cache + noise filter
                                            · service allowlist
                                            · screen controller (motion → sleep/wake)
                                            · /api/camera /api/history /api/statistics
                                            · static SPA
                    tokenless WS fan-out ─► tablets (React PWA / PanelKiosk)
```

## Security notes

- `.env` is gitignored; never commit the HA token. Rotate it if it ever leaks.
- The `:2323` kiosk API accepts a password — set one if your LAN isn't fully trusted.
