/**
 * AudioManager.js  — @game_dev owns
 * Procedural Web Audio API sound engine.
 * Subscribes to EventBus events; also exposes direct play methods for engine modules.
 *
 * ARCHITECTURE §5 — no external audio files; all sounds are synthesised.
 */

import EventBus from '../utils/EventBus.js';
import { EVENTS } from '../utils/Constants.js';

class AudioManagerClass {
  constructor() {
    this._ctx        = null;
    this._master     = null;
    this._muted      = false;
    this._ready      = false;
  }

  // ── Bootstrap ────────────────────────────────────────────
  init() {
    try {
      this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
      this._master = this._ctx.createGain();
      this._master.gain.value = 0.65;
      this._master.connect(this._ctx.destination);
      this._ready = true;
    } catch (e) {
      console.warn('[AudioManager] WebAudio unavailable:', e);
    }

    // Wire EventBus
    EventBus.on(EVENTS.FOOD_COLLECT,    () => this.eat());
    EventBus.on(EVENTS.POWERUP_COLLECT, (p) => this._onPowerup(p));
    EventBus.on(EVENTS.SNAKE_DIE,       (p) => this.elimination(p?.isPlayer));
    EventBus.on(EVENTS.GAME_OVER,       (p) => { if (p?.winner) this.victory(); });
    EventBus.on(EVENTS.ZONE_WARNING,    () => this.stormAlarm());
    EventBus.on(EVENTS.AUDIO_MUTE,      (v) => this.setMute(v));

    // Unlock context on first user interaction
    const unlock = () => {
      if (this._ctx?.state === 'suspended') this._ctx.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  _resume() {
    if (this._ctx?.state === 'suspended') this._ctx.resume();
  }

  _play(buildFn) {
    if (!this._ready || this._muted) return;
    this._resume();
    try { buildFn(this._ctx, this._master); } catch (e) { /* silent */ }
  }

  setMute(muted) {
    this._muted = muted;
    if (this._master) this._master.gain.value = muted ? 0 : 0.65;
  }

  // ── Food eaten — bright pop ──────────────────────────────
  eat() {
    this._play((ctx, out) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.35, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      o.connect(g); g.connect(out);
      o.start(); o.stop(ctx.currentTime + 0.14);
    });
  }

  // ── Speed-boost whoosh ───────────────────────────────────
  boost() {
    this._play((ctx, out) => {
      const len  = Math.floor(ctx.sampleRate * 0.5);
      const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src    = ctx.createBufferSource(); src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.45);
      filter.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      src.connect(filter); filter.connect(g); g.connect(out);
      src.start();
    });
  }

  // ── Elimination boom ─────────────────────────────────────
  elimination(isPlayer = false) {
    this._play((ctx, out) => {
      const len  = Math.floor(ctx.sampleRate * 0.7);
      const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      const decay = isPlayer ? 0.25 : 0.4;
      for (let i = 0; i < len; i++)
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * decay));
      const src    = ctx.createBufferSource(); src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = isPlayer ? 200 : 350;
      const g = ctx.createGain();
      g.gain.setValueAtTime(isPlayer ? 1.4 : 0.9, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      src.connect(filter); filter.connect(g); g.connect(out);
      src.start();
    });
  }

  // ── Electric storm alarm ─────────────────────────────────
  stormAlarm() {
    this._play((ctx, out) => {
      [0, 0.22, 0.44].forEach((delay, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = i === 1 ? 460 : 345;
        g.gain.setValueAtTime(0.28, ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
        o.connect(g); g.connect(out);
        o.start(ctx.currentTime + delay);
        o.stop(ctx.currentTime + delay + 0.18);
      });
    });
  }

  // ── Victory fanfare ──────────────────────────────────────
  victory() {
    this._play((ctx, out) => {
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        const t = ctx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.45);
      });
    });
  }

  // ── Generic power-up chime ───────────────────────────────
  powerup() {
    this._play((ctx, out) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.18);
      g.gain.setValueAtTime(0.4, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      o.connect(g); g.connect(out);
      o.start(); o.stop(ctx.currentTime + 0.22);
    });
  }

  // ── Venom / bomb hit ─────────────────────────────────────
  hit() {
    this._play((ctx, out) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(220, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      o.connect(g); g.connect(out);
      o.start(); o.stop(ctx.currentTime + 0.14);
    });
  }

  // ── Route EventBus powerup events ────────────────────────
  _onPowerup(payload) {
    this.powerup();
    if (payload?.type === POWERUP_TYPES?.SPEED_BOOST) this.boost();
  }
}

const AudioManager = new AudioManagerClass();
export default AudioManager;
