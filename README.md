# webapp-dash

Self-hosted [Home Assistant](https://www.home-assistant.io/) dashboard for any phone, tablet or
desktop — one responsive UI, from a small phone to a wall panel to a desktop monitor. React web
app + Node token-proxy server + an optional Android kiosk app (**PanelKiosk**, any Android 6.0+
phone or tablet) — no Lovelace, no Fully Kiosk license.

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
docker compose up -d --build # serves on :8080, healthcheck on /healthz
```

Open `http://<server>:8080`. Dev mode: `npm install && npm run dev`
(Vite on :5173, server on :8080).

The image runs as the non-root `node` user with `TZ=Asia/Kolkata`. `config/` is mounted
read-only; remembered virtual-fan speeds live in the `dash-data` named volume.

After a deploy, open panels reload themselves onto the new bundle — every snapshot names the
bundle the server is serving. Outside Docker, restart the server after a frontend build: it
registers one static route per file at boot.

### Network exposure

The browser socket is tokenless: anything that can reach the port can call every allowlisted
service. The default — every interface — is what a LAN wall panel plus tailnet phones need. Just
never port-forward it, or put it behind Cloudflare Tunnel, without adding auth first.

- **Tailnet only:** set `BIND_ADDR` to the host's Tailscale IP. The wall panel then needs
  Tailscale too, and the host needs `net.ipv4.ip_nonlocal_bind=1` (e.g. in
  `/etc/sysctl.d/99-nonlocal-bind.conf`). Without it, after a reboot Docker can start the
  container before Tailscale has its address, fail to bind, and never retry.
- **HTTPS on phones:** `tailscale serve --bg 8080` gives an `https://<host>.<tailnet>.ts.net`
  URL, which phones need to install the dashboard as a proper app. If the server log says it
  refused that origin, add the URL to `ALLOWED_ORIGINS`.

## Devices: phone, tablet, desktop

The layout is fluid rather than tiered — a 1280px wall tablet and a ~1470px laptop are too close
for a breakpoint between them to mean anything. Cards reflow from 2 columns on a phone to 6–7 on a
wide screen. Below 768px the room rail becomes a bottom tab bar.

Any current browser works: Chrome or Android WebView 104+, Safari 16.4+, recent Firefox. WebView
104–110 gets flat colours instead of tints; anything older shows a page asking for an update rather
than a broken layout.

Each browser is either a **personal** device (default) or the **kiosk**:

| | Personal (phone, laptop) | Kiosk (wall panel) |
|---|---|---|
| Sleeps on the server's motion timer | no | yes |
| Screen wake lock, camera motion wake | no | yes |
| Hide unavailable entities by default | yes | no |
| Text selection, pinch zoom | yes | no |

PanelKiosk is recognised as the kiosk automatically, and so is Fully Kiosk when its JavaScript
Interface (a PLUS feature) is on — both inject `window.fully`. Any other wall panel (free Fully, a
plain browser) needs `http://<server>:8080/?device=kiosk` once; or switch any device in Settings →
*This device*. The choice is remembered per browser. It
matters because sleep is broadcast to every client — without roles, your phone would black out
whenever the wall panel dozed off.

## Configuration (`config/dashboard.json`, hot-reloaded)

```jsonc
{
  "rooms": [                                // sidebar, in this order
    { "name": "Hallway", "icon": "hallway",
      "entities": ["light.puja_room_light_3"],   // exact ids — always win
      "match": ["*hallway*", "*living_room_light*"] }  // globs: `*` any run, `?` one char
  ],
  "hiddenEntities": [],                     // entity_ids to hide, e.g. a switch HA also exposes as a light
  "names": { "fan.x": "Ceiling fan" },      // display-name overrides
  "areaOverrides": {},                      // entity_id → room name
  "virtual": [],                            // composed entities, see below
  "screen": {
    "motionSensors": [],                    // empty = all motion/occupancy sensors
    "offDelayMinutes": 5,                   // 0 disables sleeping
    "fullyHost": "",                        // tablet IP running PanelKiosk/Fully (:2323)
    "fullyPassword": ""
  }
}
```

### Rooms

Membership resolves in this order: a room's explicit `entities`, then `match` globs (earlier
rooms win), then `areaOverrides`, then the HA area registry. Anything left over appears under
**Other** — that's your to-do list. Rooms with nothing in them are dropped. Icons: `sofa`,
`hallway`, `bed`, `kitchen`, `bath`, `puja`, `laundry`, `door`.

Omit `rooms` entirely and it falls back to one room per HA area, ordered by `roomOrder`.

Watch for substring collisions: `*room_1*` also matches `bathroom_1`. Anchor on the domain dot
instead — `*.room_1*` — or exclude with a leading `!`: Hall's `"!*hall_bathroom*"` keeps the
bathroom sensors out of Hall so Bathroom-2's own glob picks them up. A room named in `areaOverrides` or a virtual fan's `room` must match a
room exactly, or the entity lands under Other (the server log says which).

Mistakes cost one entry, not the dashboard: an invalid room or virtual fan is skipped with a log
line, and a hot-reload of a broken or half-saved file keeps the last good config.

### Virtual fans

For a fan whose power is a relay and whose speed is an IR remote. The card shows one fan with a
speed slider that moves in speed steps and sends once, on release — each step is a real IR
press. The server turns that into the right switch and button calls; a tap on the card turns
the fan on or off.

```jsonc
"virtual": [{
  "entity_id": "fan.room_1_ceiling_fan",   // synthetic; must be fan.*
  "name": "Ceiling fan",
  "room": "Room-1",
  "power": "fan.mom_room_light_8",         // real entity: on/off and availability come from it
  "speeds": ["button.room_1_ir_remote_1_fan_speed_1", "…", "button.…_speed_6"],
  "powerButton": ""                        // optional IR power key, pressed 1s after mains-on
}]
```

IR is one-way, so the speed shown is the last one *sent* — use the physical remote and it drifts.
On/off is always real. The `power` entity is hidden from the grid; the browser never gains the
right to press buttons directly (`button` stays out of the allowlist).

## PanelKiosk (any Android 6.0+ phone or tablet)

```bash
cd android-kiosk && gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
# optional, for silent pinning + remote reboot (remove all accounts first):
adb shell dpm set-device-owner dev.aryan.panelkiosk/.AdminReceiver
```

Or install the APK from [Releases](https://github.com/Aryan795/webapp-dash/releases). First run opens
the settings; after that, five quick taps in the top-left corner reopen them.

- **Any screen, either way up.** Rotation follows the device or locks to landscape/portrait, and
  notches and punch-holes are kept clear. Folding or split-screen doesn't reload the page.
- **Starting on boot.** Reliable when PanelKiosk is the Home app or the device owner. On Android
  10–14, allowing it to display over other apps also works; Android 15 needs one of the first two.
  Settings shows which applies, with a button for each. Xiaomi, Huawei, Oppo and Vivo also need
  their own "Autostart" switch.
- **Camera optional.** It uses the front camera if there is one, else the back one, else a USB
  webcam. With none, camera wake simply switches off; HA motion sensors still wake the panel
  through the server.
- **Wakes from a truly dark screen.** Camera motion wake runs as a foreground service (you'll see
  a "watching for motion" notification), so it keeps watching with the display off. Turn on
  **True screen off** and the display really switches off when the room is empty, then comes back
  on when someone walks in. Set the lock screen to **None** (or Swipe): no app can get past a PIN,
  though the dashboard still shows over the lock screen. With device admin the display goes off at
  once; without it, Android's own screen timeout switches it off, so set that short. Android 14+
  can revoke "Turn screen on" special access, and Settings tells you if it has.
- **Keeps itself up.** It retries until the dashboard is reachable (Wi-Fi is often late after a
  boot), and rebuilds the WebView if a low-memory device kills its renderer.
- Needs a current **Android System WebView** (104+); on older ones the page says so.

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

- `.env` is gitignored and in `.dockerignore`; never commit the HA token. Rotate it if it leaks.
- `/ws` and `/api/*` carry no token by design. `/ws` refuses browser pages from other origins,
  so a random site open on your phone can't drive your lights — but an origin check can't stop
  DNS rebinding, so treat the port as trusted-network-only. See *Network exposure*.
- The `:2323` kiosk API accepts a password — set one if your LAN isn't fully trusted.
