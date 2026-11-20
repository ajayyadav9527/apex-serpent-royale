# Apex Serpent Royale — Technical Architecture Specification
**Version:** 1.0.0 | **Status:** AUTHORITATIVE  
**Lead Architect:** @architect  
**Last Updated:** 2026-11-20

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Directory & File Contract](#2-directory--file-contract)
3. [System Architecture Diagram](#3-system-architecture-diagram)
4. [Three.js 3D Engine Spec](#4-threejs-3d-engine-spec) → @game_dev owns
5. [Audio & Powerup Spec](#5-audio--powerup-spec) → @game_dev owns
6. [HTML5 HUD & Mobile Touch Controls](#6-html5-hud--mobile-touch-controls) → @ui_monetization owns
7. [Adsterra Ad Placement Spec](#7-adsterra-ad-placement-spec) → @ui_monetization owns
8. [Blogger XML Theme Wrapper](#8-blogger-xml-theme-wrapper) → @ui_monetization owns
9. [Data & State Management](#9-data--state-management)
10. [Network / Multiplayer Architecture](#10-network--multiplayer-architecture)
11. [Build & Deployment Pipeline](#11-build--deployment-pipeline)
12. [Interface Contracts (Cross-Agent)](#12-interface-contracts-cross-agent)

---

## 1. Project Overview

**Apex Serpent Royale** is a browser-native, 3D Battle Royale snake game built on Three.js. Up to 64 players compete in a shrinking arena; the last surviving serpent wins. The game is embedded inside a Blogger XML theme and monetized via Adsterra banner, interstitial, and Direct Link smartlink ad units.

### Core Technology Stack

| Layer | Technology |
|---|---|
| 3D Rendering | Three.js r165 (WebGL 2) |
| Physics / Collision | Custom AABB grid (no Cannon/Rapier – keep bundle small) |
| Networking | WebSocket (Socket.io 4.x, binary frames) |
| Audio | Web Audio API + Howler.js 2.2 |
| HUD / UI | Vanilla HTML5 Canvas overlay + CSS Grid |
| Mobile Controls | Virtual joystick (nipplejs 0.10) + gyro fallback |
| Hosting / CMS | Blogger (XML theme wrapper) |
| Monetization | Adsterra (banner CPM + Direct Link smartlink) |
| Bundler | Vite 5 (ESM, code-split) |
| Language | JavaScript ES2022 (no TypeScript – simpler Blogger embed) |

---

## 2. Directory & File Contract

```
apex_serpent_royale/
├── ARCHITECTURE.md              ← this file (@architect, READ-ONLY for others)
│
├── src/
│   ├── main.js                  ← entry point; bootstraps Engine + scene
│   ├── engine/                  ← @game_dev owns entirely
│   │   ├── GameEngine.js        ← Three.js scene, renderer, game-loop
│   │   ├── SnakeEntity.js       ← per-snake 3D mesh + segment chain
│   │   ├── ArenaManager.js      ← shrinking zone, floor grid, skybox
│   │   ├── CollisionSystem.js   ← AABB grid partition
│   │   ├── PowerupManager.js    ← spawn/collect/effect lifecycle
│   │   └── AudioManager.js      ← Howler.js wrapper + spatial audio
│   │
│   ├── ui/                      ← @ui_monetization owns entirely
│   │   ├── HUD.js               ← Canvas overlay: health, scores, map
│   │   ├── TouchControls.js     ← nipplejs joystick + gyro adapter
│   │   ├── AdManager.js         ← Adsterra unit injection & refresh logic
│   │   └── screens/
│   │       ├── LobbyScreen.js
│   │       ├── GameOverScreen.js
│   │       └── LeaderboardScreen.js
│   │
│   ├── net/
│   │   ├── NetworkClient.js     ← Socket.io client, reconnect, binary decode
│   │   └── StateSync.js         ← server-authoritative snapshot interpolation
│   │
│   └── utils/
│       ├── MathUtils.js
│       ├── EventBus.js          ← decoupled pub/sub between engine ↔ ui
│       └── Constants.js         ← shared game constants (see §12)
│
├── server/                      ← Node.js game server
│   ├── index.js
│   ├── RoomManager.js
│   ├── GameLoop.js              ← 20 tick/s authoritative loop
│   └── BotAI.js
│
├── public/
│   ├── assets/
│   │   ├── models/              ← GLTF snake body, food, powerup meshes
│   │   ├── textures/
│   │   └── audio/               ← .webm + .mp3 fallback
│   └── index.html               ← dev-only shell; Blogger embed replaces this
│
├── blogger/
│   ├── theme.xml                ← full Blogger XML theme (@ui_monetization)
│   └── gadget-embed.html        ← minimal iframe embed snippet
│
├── dist/                        ← Vite build output (gitignored)
├── vite.config.js
└── package.json
```

> **File ownership is strict.** `engine/` → @game_dev. `ui/` + `blogger/` → @ui_monetization. `net/`, `utils/`, `server/` → @architect seeds; both teams may PR. No agent edits another team's directory without an explicit board handoff message.

---

## 3. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BLOGGER PAGE                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Adsterra 728×90 Leaderboard (above game iframe)              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────┐  ┌─────────────────────────┐ │
│  │       GAME IFRAME (100%×600px)   │  │ Adsterra 300×250 sidebar│ │
│  │  ┌────────────────────────────┐  │  └─────────────────────────┘ │
│  │  │  Three.js WebGL Canvas     │  │                               │
│  │  │  (GameEngine.js)           │  │                               │
│  │  ├────────────────────────────┤  │                               │
│  │  │  HUD Canvas Overlay        │  │                               │
│  │  │  (HUD.js)                  │  │                               │
│  │  ├────────────────────────────┤  │                               │
│  │  │  Touch Joystick            │  │                               │
│  │  │  (TouchControls.js)        │  │                               │
│  │  └────────────────────────────┘  │                               │
│  └──────────────────────────────────┘                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Adsterra 320×50 Mobile Footer (hidden on desktop)            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  Direct Link Smartlink attached to CTA buttons in Blogger post      │
└─────────────────────────────────────────────────────────────────────┘
                              │ WebSocket (wss://)
                   ┌──────────▼──────────┐
                   │   Game Server        │
                   │  (Node + Socket.io)  │
                   │  RoomManager         │
                   │  GameLoop (20 TPS)   │
                   │  BotAI               │
                   └─────────────────────┘
```

---

## 4. Three.js 3D Engine Spec
> **Owner: @game_dev** — implement in `src/engine/`

### 4.1 Renderer Setup (`GameEngine.js`)
- `THREE.WebGLRenderer` with `antialias: true`, `powerPreference: 'high-performance'`
- Target 60 FPS; dynamic quality step-down at <45 FPS (reduce shadow map, LOD)
- Camera: `PerspectiveCamera(60, aspect, 0.1, 2000)` — third-person follow, smooth lerp
- Post-processing: `EffectComposer` → `UnrealBloomPass` (subtle glow on power-ups) + `FXAAShader`

### 4.2 Arena (`ArenaManager.js`)
- **Floor:** 1000×1000 unit grid; `GridHelper` + custom shader for neon pulse at boundary
- **Shrinking Zone:** starts at radius 450, shrinks linearly to 50 over 5 minutes; zone wall = `THREE.CylinderGeometry` with additive blend emissive material, damage = 2 HP/s outside
- **Skybox:** `THREE.CubeTextureLoader` — dark space / cyberpunk city skyline assets

### 4.3 Snake Entity (`SnakeEntity.js`)
- **Head:** `BoxGeometry(1.2, 1.2, 1.2)` with normal-mapped skin texture
- **Segments:** spherical joints following head at 0.9× spacing; max 200 segments
- **Growth:** `addSegment()` on food collect; head speed = `BASE_SPEED + 0.004 * length` (capped at 1.5×)
- **Death FX:** `THREE.Points` particle burst + `AudioManager.play('death')`

### 4.4 Collision System (`CollisionSystem.js`)
- Spatial hash grid: cell size = 2 units
- Registered entities: snake heads, food, powerups, zone boundary
- Checks: head↔head (mutual kill), head↔body (self allowed; foreign = kill), head↔food (collect), head↔powerup (collect), head↔zone (damage)
- Runs every server tick (20 Hz); client-side prediction for head movement only

### 4.5 Lighting
- `AmbientLight` (0x111133, 0.6) — cool dark ambient
- `DirectionalLight` (0xffffff, 1.2) — simulated sun from above
- Per-powerup `PointLight` (colour-coded, distance=20) pooled (max 10 active)

---

## 5. Audio & Powerup Spec
> **Owner: @game_dev** — implement in `src/engine/AudioManager.js` and `src/engine/PowerupManager.js`

### 5.1 Audio (`AudioManager.js`)
| Sound Key | File | Trigger |
|---|---|---|
| `bgm_battle` | `audio/bgm_battle.webm` | Loop on game start |
| `bgm_lobby` | `audio/bgm_lobby.webm` | Loop in lobby |
| `eat_food` | `audio/eat.webm` | Head↔food collision |
| `powerup_collect` | `audio/powerup.webm` | Head↔powerup collision |
| `death` | `audio/death.webm` | Snake entity dies |
| `zone_warning` | `audio/zone.webm` | Player near zone edge |
| `win_fanfare` | `audio/win.webm` | Last survivor |

- **Spatial Audio:** Use `THREE.PositionalAudio` for sounds from other snakes (eating, death); pan & rolloff relative to player camera
- **Master / SFX / Music bus** exposed via `AudioManager.setVolume(bus, 0–1)`
- Mute toggle event: `EventBus.emit('audio:mute')`

### 5.2 Powerups (`PowerupManager.js`)
| Powerup | Mesh Color | Effect | Duration |
|---|---|---|---|
| **Speed Boost** | `0x00ffff` | +40% move speed | 7s |
| **Shield** | `0x4488ff` | Immune to 1 head collision | until hit |
| **Venom Spit** | `0xff4400` | Launch projectile; hit = 3s slow | 1 charge |
| **Ghost** | `0xaaaaff` | Pass through bodies (not zone) | 5s |
| **Magnet** | `0xffff00` | Auto-collect food within r=15 | 10s |
| **Bomb** | `0xff0000` | Explode r=20; kills all segments in radius | instant |

- Spawn rate: 1 powerup per 15s per 10 living players, random arena position
- Mesh: animated `IcosahedronGeometry` with `RotateY` + bob animation
- State machine: `IDLE → SPAWNING → ACTIVE → COLLECTED/EXPIRED`

---

## 6. HTML5 HUD & Mobile Touch Controls
> **Owner: @ui_monetization** — implement in `src/ui/`

### 6.1 HUD Layout (`HUD.js`)
```
┌─────────────────────────────────────────────────────┐
│ [♥ 100]  [⚡ Speed 7s]        [Players: 23]  [⏱ 4:12] │  ← top bar
│                                                      │
│                   THREE.js canvas                    │
│                                                      │
│ ┌──────────┐                        ┌─────────────┐  │
│ │ Mini-Map │                        │ Leaderboard │  │  ← corners
│ │ (canvas) │                        │ Top 5       │  │
│ └──────────┘                        └─────────────┘  │
│                   [Kill Feed: "Snake7 killed Snake3"] │  ← bottom strip
└─────────────────────────────────────────────────────┘
```
- All HUD drawn on a **secondary Canvas** (`position: absolute; pointer-events: none`) layered over WebGL canvas
- Mini-map: 120×120px, top-down 2D canvas; snake positions from `StateSync.snapshot`
- Powerup timer bar: horizontal fill animation driven by `requestAnimationFrame`
- Kill feed: queue max 4 entries, fade-out after 4s each

### 6.2 Mobile Touch Controls (`TouchControls.js`)
- **nipplejs joystick** bottom-left, `mode: 'static'`, `size: 110`
- Joystick vector → snake direction delta, normalised, sent to `NetworkClient.sendInput()`
- **Gyroscope fallback:** `DeviceOrientationEvent` → tilt-to-steer when no joystick touch active; opt-in via settings toggle
- **Action buttons** (right side): Boost tap (double-tap joystick also works), Powerup activate
- Responsive breakpoint: `max-width: 768px` shows joystick + hides desktop keyboard hints
- Touch events use `passive: false` with `preventDefault()` to block page scroll during gameplay

### 6.3 Screen Components (`screens/`)
- **LobbyScreen:** player count, start countdown, server region selector
- **GameOverScreen:** rank, kills, length, Adsterra interstitial trigger (see §7.3)
- **LeaderboardScreen:** top-10 all-time, session ranks, share button with Direct Link

---

## 7. Adsterra Ad Placement Spec
> **Owner: @ui_monetization** — implement in `src/ui/AdManager.js` and `blogger/theme.xml`

### 7.1 Ad Unit Inventory

| Unit | Size | Placement | Format | Refresh |
|---|---|---|---|---|
| **Leaderboard** | 728×90 | Above game iframe, desktop only | Display banner | 60s |
| **Rectangle** | 300×250 | Right sidebar, desktop only | Display banner | 90s |
| **Mobile Footer** | 320×50 | Below game canvas, mobile only | Display banner | 45s |
| **Interstitial** | Full-screen | Game Over screen (1 per session) | Popunder / interstitial | Once |
| **Smartlink** | N/A | CTA buttons, Share button, "Play Again" | Direct Link | On click |

### 7.2 Ad Containers (HTML IDs — both `AdManager.js` and `theme.xml` must use these exact IDs)
```html
<div id="asr-ad-leaderboard">   <!-- 728×90 desktop -->
<div id="asr-ad-rectangle">     <!-- 300×250 desktop -->
<div id="asr-ad-mobile-footer"> <!-- 320×50 mobile -->
<div id="asr-ad-interstitial">  <!-- game-over trigger -->
```

### 7.3 `AdManager.js` Responsibilities
- On `DOMContentLoaded`: inject Adsterra `<script>` tags into their respective containers
- 60/90/45s refresh: `setInterval` → `innerHTML = ''` then re-inject script tag
- Interstitial: listen on `EventBus.on('game:over')` → open Adsterra popunder URL in `window.open` with 1-session guard (`sessionStorage.getItem('ad_interstitial_shown')`)
- Smartlink: wrap all CTA `<a>` tags with `data-adsterra-smartlink` attribute; `AdManager` intercepts click, appends UTM params, opens smartlink URL
- **Viewability guard:** do not refresh if `document.visibilityState !== 'visible'`
- **GDPR stub:** check `window.__asr_consentGiven` flag before injecting any unit; set by Blogger theme's consent banner

### 7.4 Adsterra Script Template (placeholder — replace with live publisher keys)
```html
<!-- 728×90 Leaderboard -->
<script type="text/javascript">
  atOptions = { 'key': 'ADSTERRA_KEY_728x90', 'format': 'iframe',
    'height': 90, 'width': 728, 'params': {} };
</script>
<script src="//www.highperformancedisplayformat.com/ADSTERRA_KEY_728x90/invoke.js"></script>

<!-- 300×250 Rectangle -->
<script type="text/javascript">
  atOptions = { 'key': 'ADSTERRA_KEY_300x250', 'format': 'iframe',
    'height': 250, 'width': 300, 'params': {} };
</script>
<script src="//www.highperformancedisplayformat.com/ADSTERRA_KEY_300x250/invoke.js"></script>

<!-- 320×50 Mobile Footer -->
<script type="text/javascript">
  atOptions = { 'key': 'ADSTERRA_KEY_320x50', 'format': 'iframe',
    'height': 50, 'width': 320, 'params': {} };
</script>
<script src="//www.highperformancedisplayformat.com/ADSTERRA_KEY_320x50/invoke.js"></script>
```

---

## 8. Blogger XML Theme Wrapper
> **Owner: @ui_monetization** — implement in `blogger/theme.xml`

### 8.1 Theme Structure
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html b:version='2' class='v2' expr:dir='data:blog.languageDirection'
      xmlns='http://www.w3.org/1999/xhtml'
      xmlns:b='http://www.google.com/2005/gml/b'
      xmlns:data='http://www.google.com/2005/gml/data'
      xmlns:expr='http://www.google.com/2005/gml/expr'>

<head>
  <!-- Blogger metadata, b:skin, viewport meta -->
  <!-- CSP must allow: cdn.jsdelivr.net (Three.js CDN), *.adsterra.com, wss://[game-server] -->
  <!-- Preconnect hints for CDN and game server -->
</head>

<body>
  <!-- GDPR consent banner (inline, before any ad script) -->
  <!-- asr-ad-leaderboard 728×90 (desktop only via CSS) -->
  
  <div id='game-wrapper'>
    <iframe id='game-frame' src='[GAME_URL]' 
            width='100%' height='600' 
            allow='autoplay; gyroscope; fullscreen'
            scrolling='no' frameborder='0'></iframe>
  </div>
  
  <!-- asr-ad-rectangle 300×250 sidebar -->
  <!-- asr-ad-mobile-footer 320×50 (mobile only) -->

  <b:section id='main' showaddelement='no'>
    <b:widget id='Blog1' type='Blog'>
      <!-- standard Blogger post/page rendering for SEO content -->
    </b:widget>
  </b:section>

  <!-- AdManager.js loaded AFTER game iframe -->
</body>
</html>
```

### 8.2 CSP (Content-Security-Policy) Requirements
```
default-src 'self';
script-src 'self' 'unsafe-inline' cdn.jsdelivr.net *.adsterra.com *.highperformancedisplayformat.com;
frame-src 'self' *.adsterra.com;
connect-src 'self' wss://[GAME_SERVER_HOST];
img-src 'self' data: *.adsterra.com;
```

### 8.3 SEO & Blogger Gadget Metadata
- `<title>` = `Apex Serpent Royale — 3D Battle Royale Snake Game`
- Open Graph tags for social share (uses game screenshot)
- Blogger labels: `game, snake, battle-royale, 3D, multiplayer`
- `<b:include data='blog' name='all-head-content'/>` required for Blogger functionality

---

## 9. Data & State Management

### 9.1 Client State Model
```js
// utils/Constants.js — shared by both @game_dev and @ui_monetization
export const GAME_CONSTANTS = {
  ARENA_SIZE:        1000,
  ZONE_SHRINK_TIME:  300,   // seconds
  TICK_RATE:          20,   // server Hz
  MAX_PLAYERS:        64,
  MAX_BOTS:           20,
  BASE_SPEED:          0.15,
  FOOD_VALUE:           1,
  SEGMENT_SPACING:     0.9,
};
```

### 9.2 Server → Client Snapshot (binary, every 50ms)
```
[header: 4B magic + 2B seq + 2B player_count]
[per snake: 2B id + 1B length_hi + 1B length_lo + 2B head_x + 2B head_z + 1B dir + 1B flags]
[food: 2B count + per food: 2B x + 2B z]
[zone: 2B radius]
```

### 9.3 Client → Server Input (every 50ms or on change)
```json
{ "seq": 1234, "dx": 0.71, "dz": 0.71, "boost": false, "use_powerup": false }
```

### 9.4 EventBus Events (cross-module pub/sub)
| Event | Emitter | Listeners |
|---|---|---|
| `game:start` | NetworkClient | GameEngine, HUD, AdManager |
| `game:over` | NetworkClient | GameEngine, HUD, AdManager (interstitial) |
| `snake:die` | CollisionSystem | HUD (kill feed), AudioManager |
| `food:collect` | CollisionSystem | SnakeEntity, AudioManager, HUD |
| `powerup:collect` | PowerupManager | SnakeEntity, HUD, AudioManager |
| `zone:warning` | ArenaManager | HUD, AudioManager |
| `audio:mute` | HUD settings | AudioManager |

---

## 10. Network / Multiplayer Architecture

### 10.1 Server Authority Model
- Server is fully authoritative on all positions, collisions, and powerup effects
- Client sends input vector; server applies movement, runs collision, broadcasts snapshot
- Client-side prediction: local head moves immediately on input; reconciled against server snapshot with linear interpolation (`StateSync.js`)
- **Lag compensation:** server holds 500ms of snapshot history for input replay

### 10.2 Room / Session Lifecycle
```
WAITING (< 10 players) → COUNTDOWN (10s) → IN_GAME → GAME_OVER (last 1 alive)
                                              ↓ zone ticks, powerup spawns
```
- Max 64 real players + backfill bots up to 30 total if <30 join in 60s
- Room recycled after 30s of GAME_OVER state

### 10.3 Reconnection
- Client stores `{room_id, player_token}` in `sessionStorage`
- On disconnect, `NetworkClient` auto-reconnects up to 5× with exponential backoff
- Server restores player state from token within the same GAME_OVER-free session

---

## 11. Build & Deployment Pipeline

### 11.1 `vite.config.js` Key Settings
```js
export default {
  build: {
    rollupOptions: {
      input: { main: 'src/main.js' },
      output: { manualChunks: { three: ['three'], howler: ['howler'] } }
    },
    target: 'es2020',
    minify: 'terser',
  },
  server: { port: 5173, host: '0.0.0.0' }
}
```

### 11.2 Deployment Steps
1. `npm run build` → `dist/` with chunked JS + hashed filenames
2. Upload `dist/` to static host (Cloudflare Pages, Netlify, or any CDN)
3. Set `GAME_URL` in `blogger/theme.xml` to the deployed static host URL
4. Upload `theme.xml` to Blogger → Theme → Edit HTML
5. Set real Adsterra keys in `theme.xml` (replace `ADSTERRA_KEY_*` placeholders)
6. Game server: `node server/index.js` on a VPS; configure `wss://` URL in `Constants.js`

---

## 12. Interface Contracts (Cross-Agent)

These contracts are FROZEN. Neither @game_dev nor @ui_monetization may change them without an @architect board approval.

### 12.1 `EventBus` API (utils/EventBus.js)
```js
EventBus.on(event: string, cb: Function): void
EventBus.off(event: string, cb: Function): void
EventBus.emit(event: string, payload?: any): void
```

### 12.2 `StateSync.snapshot` Shape (read by HUD, written by NetworkClient)
```js
{
  tick: number,
  zone_radius: number,
  players: Map<id, { x, z, length, dir, flags, powerup, hp }>,
  food: Array<{ x, z }>,
  my_id: number,
  player_count: number
}
```

### 12.3 `AdManager` Public API (called by GameOverScreen, LeaderboardScreen)
```js
AdManager.triggerInterstitial(): void   // one-shot per session
AdManager.attachSmartlink(el: Element): void  // wraps element with Direct Link
AdManager.refresh(unit: 'leaderboard'|'rectangle'|'mobile-footer'): void
```

### 12.4 `TouchControls` Output Interface (consumed by NetworkClient)
```js
TouchControls.onInput = (dx: number, dz: number, boost: boolean) => void
// Set by NetworkClient; TouchControls calls it on each joystick change
```

### 12.5 `PowerupManager` → `HUD` Powerup State Shape
```js
// Emitted with 'powerup:collect' event payload:
{ type: string, duration_ms: number, start_ts: number }
```

---

*Architecture v1.0 — @architect. All deviations require a board message tagged @architect.*
