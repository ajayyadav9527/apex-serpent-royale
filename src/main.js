/**
 * main.js — Apex Serpent Royale entry point
 * Bootstraps Three.js GameEngine, NetworkClient, HUD, and TouchControls.
 * @game_dev owns engine/ — do not edit those files here.
 * @ui_monetization owns ui/ — do not edit those files here.
 *
 * ARCHITECTURE §2, §12
 */

import { GameEngine }  from './engine/GameEngine.js';
import NetworkClient   from './net/NetworkClient.js';
import StateSync       from './net/StateSync.js';
import EventBus        from './utils/EventBus.js';
import { EVENTS }      from './utils/Constants.js';

// UI modules owned by @ui_monetization (stubs if not yet present)
let HUD, TouchControls, AdManager;
try {
  ({ default: HUD }           = await import('./ui/HUD.js'));
  ({ default: TouchControls } = await import('./ui/TouchControls.js'));
  ({ default: AdManager }     = await import('./ui/AdManager.js'));
} catch (e) {
  console.info('[main] UI modules not yet built — running engine-only mode.', e.message);
  HUD = TouchControls = AdManager = { init: () => {}, update: () => {}, onInput: null };
}

// ── Instantiate engine (class-based, not singleton) ─────────
const engine = new GameEngine();
window.__apexEngine = engine; // expose for HUD/Ad access

// ── Wire TouchControls → engine + NetworkClient (§12.4) ─────
TouchControls.onInput = (dx, dz, boost) => {
  engine.setPlayerDirection(dx, dz);
  NetworkClient.sendInput(dx, dz, boost, false);
};

// ── Boot sequence ────────────────────────────────────────────
if (AdManager.init)   AdManager.init();
if (HUD.init)         HUD.init(document.getElementById('hud-canvas'));
if (TouchControls.init) TouchControls.init(document.getElementById('joystick-zone'));

// Init 3D engine
await engine.init(document.getElementById('game-canvas'));

// ── Network (optional — falls back to local AI mode) ────────
const roomId = new URLSearchParams(location.search).get('room') || 'lobby';
try {
  NetworkClient.connect(roomId);

  // When network sends a snapshot, relay it to the engine
  EventBus.on('net:snapshot', (snapshot) => {
    StateSync.apply(snapshot);
    engine.applyServerSnapshot(StateSync.snapshot);
    if (HUD.update) HUD.update(StateSync.snapshot);
  });
} catch (e) {
  console.info('[main] Network unavailable — running local AI mode.');
}

// ── EventBus → AdManager ad triggers ────────────────────────
EventBus.on(EVENTS.GAME_OVER, (payload) => {
  if (!payload.winner && AdManager.triggerInterstitial) {
    AdManager.triggerInterstitial();
  }
});
