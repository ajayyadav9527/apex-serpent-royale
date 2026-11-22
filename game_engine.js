/**
 * APEX SERPENT ROYALE — Game Engine
 * Three.js 3D Snake Battle Royale
 * Version: 2.0.0 — Top .io Retention & Combat Upgrade
 * Benchmarked from Slither.io, Snake.io, WormsZone, Little Big Snake
 *
 * New Features:
 * 1. DYNAMIC CAMERA AUTO-ZOOM: Smooth logarithmic altitude scaling on mass/length + FOV sprint warp (60° -> 68°)
 * 2. 3D GOLDEN CROWN & KING COMPASS: Floating 3D golden crown hovering over #1 King serpent + telemetry hook
 * 3. KILL-STREAK CALLOUTS: FIRST BLOOD, DOUBLE KILL, RAMPAGE, APEX PREDATOR + synth stings & trauma screen shake
 * 4. FLOATING POP NUMBERS: Floating popup numbers (+10, +20, +50, COMBO x2) in 3D world space
 * 5. SERPENT VISOR EYES: Cyber visor eyes tracking turn direction and squinting into attack mode during boost
 * 6. PHASE SHIELD: 3.5s translucent invulnerability bubble on revive with countdown telemetry
 */

'use strict';

(function (global) {

  /* =========================================================
   *  CONSTANTS & CONFIGURATION
   * ========================================================= */
  const CFG = {
    ARENA_SIZE:        80,          // half-extent of the square play area
    GRID:              1.5,         // snake segment spacing
    TICK_MS:           100,         // base move tick (ms)
    BASE_SPEED:        26.0,        // fast snappy serpent base velocity (was 15.0 originally)
    BOOST_MULTIPLIER:  2.3,         // high-octane turbo sprint multiplier (was 2.0 originally)
    TURN_SPEED:        11.5,        // razor-sharp angular steering velocity (rad/s, was 6.2 originally)
    BOOST_TURN_SPEED:  15.0,        // high-agility boost turn velocity (rad/s, was 7.5 originally)
    NUM_AI:            9,           // AI snakes (player = 1 → total 10)
    FOOD_COUNT:        200,         // live food pellets (abundant .io arena feel)
    POWERUP_COUNT:     8,           // live power-ups
    STORM_START_DELAY: 8000,        // ms before storm begins shrinking
    STORM_SHRINK_RATE: 0.012,       // arena fraction lost per second
    STORM_MIN_RADIUS:  10,          // smallest storm radius (units)
    STORM_DAMAGE_MS:   500,         // storm damage tick interval
    CAMERA_LERP:       0.08,        // camera follow smoothing
    PARTICLE_POOL:     600,
    BOOST_DURATION:    5000,
    MAGNET_RADIUS:     14,
    VACUUM_RADIUS:     4.5,         // natural magnetic food ingestion pull
    SHIELD_DURATION:   6000,
    GHOST_DURATION:    5000,
    SCORE_MULTI_DURATION: 7000,
    PHASE_SHIELD_DURATION: 3500,    // 3.5s revive invulnerability
    FOV_NORMAL:        60,
    FOV_BOOST:         68,
    COMBO_WINDOW_MS:   700,         // rapid eat combo timeout
  };

  /* =========================================================
   *  STATIC CONSTANT DIRECTIONAL VECTORS (Zero-GC Optimization)
   * ========================================================= */
  let DIR_RIGHT = null;
  let DIR_LEFT  = null;
  let DIR_DOWN  = null;
  let DIR_UP    = null;
  let CARDINAL_DIRECTIONS = null;
  let SAMPLE_DIRECTIONS = null;
  let ZERO_VEC  = null;

  function initStaticVectors(THREE) {
    if (DIR_RIGHT) return;
    DIR_RIGHT = Object.freeze(new THREE.Vector3(1, 0, 0));
    DIR_LEFT  = Object.freeze(new THREE.Vector3(-1, 0, 0));
    DIR_DOWN  = Object.freeze(new THREE.Vector3(0, 0, 1));
    DIR_UP    = Object.freeze(new THREE.Vector3(0, 0, -1));
    CARDINAL_DIRECTIONS = Object.freeze([DIR_RIGHT, DIR_LEFT, DIR_DOWN, DIR_UP]);

    // 16 evenly spaced candidate directions for 360-degree organic AI navigation
    const dirs = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      dirs.push(Object.freeze(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))));
    }
    SAMPLE_DIRECTIONS = Object.freeze(dirs);
    ZERO_VEC  = Object.freeze(new THREE.Vector3(0, 0, 0));
  }

  /* ── Point-to-segment distance squared (Zero-GC gap-free collision) ── */
  function distToSegmentSq(px, pz, x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 0.0001) {
      const sx = px - x1;
      const sz = pz - z1;
      return sx * sx + sz * sz;
    }
    let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const closeX = x1 + t * dx;
    const closeZ = z1 + t * dz;
    const cx = px - closeX;
    const cz = pz - closeZ;
    return cx * cx + cz * cz;
  }

  /* =========================================================
   *  WEB AUDIO ENGINE (Procedural Synthesizer)
   * ========================================================= */
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
    }

    init() {
      try {
        this.ctx = new (global.AudioContext || global.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.6;
        this.masterGain.connect(this.ctx.destination);
      } catch (e) {
        console.warn('[Audio] WebAudio unavailable:', e);
      }
    }

    _resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    _play(buildFn) {
      if (!this.ctx) return;
      this._resume();
      try { buildFn(this.ctx, this.masterGain); } catch (e) { /* silent */ }
    }

    // ── Eating pop ──────────────────────────────────────────
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

    // ── Boost whoosh ────────────────────────────────────────
    boost() {
      this._play((ctx, out) => {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.45, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.4);
        filter.Q.value = 2.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.55, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        src.connect(filter); filter.connect(g); g.connect(out);
        src.start();
      });
    }

    // ── Elimination boom ────────────────────────────────────
    elimination() {
      this._play((ctx, out) => {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
        const src = ctx.createBufferSource(); src.buffer = buf;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 300;
        const g = ctx.createGain(); g.gain.setValueAtTime(1.0, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        src.connect(filter); filter.connect(g); g.connect(out); src.start();
      });
    }

    // ── Storm alarm ─────────────────────────────────────────
    stormAlarm() {
      this._play((ctx, out) => {
        [0, 0.25, 0.5].forEach(delay => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.value = delay === 0.25 ? 440 : 330;
          g.gain.setValueAtTime(0.3, ctx.currentTime + delay);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
          o.connect(g); g.connect(out);
          o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.2);
        });
      });
    }

    // ── Victory fanfare ─────────────────────────────────────
    victory() {
      this._play((ctx, out) => {
        const notes = [523, 659, 784, 1047, 1318];
        notes.forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = freq;
          const t = ctx.currentTime + i * 0.16;
          g.gain.setValueAtTime(0.5, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          o.connect(g); g.connect(out);
          o.start(t); o.stop(t + 0.4);
        });
      });
    }

    // ── Power-up pickup chime ───────────────────────────────
    powerup() {
      this._play((ctx, out) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.2);
        g.gain.setValueAtTime(0.4, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        o.connect(g); g.connect(out);
        o.start(); o.stop(ctx.currentTime + 0.25);
      });
    }

    // ── Kill-Streak Procedural Synth Stings ──────────────────
    killStreakSting(streak) {
      this._play((ctx, out) => {
        const t = ctx.currentTime;
        if (streak === 1) {
          // FIRST BLOOD: Punchy dual chime
          [440, 880].forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, t + i * 0.08);
            g.gain.setValueAtTime(0.5, t + i * 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
            o.connect(g); g.connect(out);
            o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.3);
          });
        } else if (streak === 2) {
          // DOUBLE KILL: Ascending triumphant power chord
          [523.25, 659.25, 1046.5].forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freq, t + i * 0.06);
            g.gain.setValueAtTime(0.45, t + i * 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.45);
            o.connect(g); g.connect(out);
            o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.45);
          });
        } else if (streak === 3) {
          // TRIPLE KILL: Aggressive arpeggio
          [587.33, 739.99, 880, 1174.66].forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freq, t + i * 0.05);
            g.gain.setValueAtTime(0.5, t + i * 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.4);
            o.connect(g); g.connect(out);
            o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.4);
          });
        } else if (streak === 4) {
          // RAMPAGE: Heavy brass bass drop + siren sweep
          const o1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          o1.type = 'sawtooth';
          o1.frequency.setValueAtTime(160, t);
          o1.frequency.exponentialRampToValueAtTime(40, t + 0.6);
          g1.gain.setValueAtTime(0.8, t);
          g1.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
          o1.connect(g1); g1.connect(out);
          o1.start(t); o1.stop(t + 0.65);

          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.type = 'sine';
          o2.frequency.setValueAtTime(600, t + 0.1);
          o2.frequency.linearRampToValueAtTime(1400, t + 0.5);
          g2.gain.setValueAtTime(0.4, t + 0.1);
          g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
          o2.connect(g2); g2.connect(out);
          o2.start(t + 0.1); o2.stop(t + 0.6);
        } else {
          // APEX PREDATOR (5+): Thunderous apocalyptic warhorn
          [110, 220, 330, 660].forEach((freq) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freq, t);
            o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.8);
            g.gain.setValueAtTime(0.55, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
            o.connect(g); g.connect(out);
            o.start(t); o.stop(t + 0.9);
          });
        }
      });
    }

    // ── Phase Shield Hum ────────────────────────────────────
    phaseShieldHum() {
      this._play((ctx, out) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(440, ctx.currentTime);
        o.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.3);
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        o.connect(g); g.connect(out);
        o.start(); o.stop(ctx.currentTime + 0.35);
      });
    }
  }

  /* =========================================================
   *  PARTICLE SYSTEM
   * ========================================================= */
  class ParticleSystem {
    constructor(scene, THREE) {
      this.THREE = THREE;
      this.scene = scene;
      this.pool = [];
      this.burstScale = 1.0;
      this._buildPool();
    }

    _buildPool() {
      const geo = new this.THREE.SphereGeometry(0.15, 4, 4);
      for (let i = 0; i < CFG.PARTICLE_POOL; i++) {
        const mat = new this.THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
        const mesh = new this.THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.scene.add(mesh);
        this.pool.push({ mesh, vel: new this.THREE.Vector3(), life: 0, maxLife: 1 });
      }
    }

    burst(position, color, count = 20) {
      const effectiveCount = Math.max(1, Math.round(count * (this.burstScale || 1.0)));
      let spawned = 0;
      for (let i = 0; i < this.pool.length && spawned < effectiveCount; i++) {
        const p = this.pool[i];
        if (p.life > 0) continue;
        p.mesh.material.color.set(color);
        p.mesh.position.copy(position);
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.random() * Math.PI;
        const spd   = 2.2 + Math.random() * 4.5;
        p.vel.set(
          Math.sin(phi) * Math.cos(theta) * spd,
          Math.abs(Math.cos(phi)) * spd * 1.2,
          Math.sin(phi) * Math.sin(theta) * spd
        );
        p.maxLife = 0.4 + Math.random() * 0.4;
        p.life = p.maxLife;
        p.mesh.visible = true;
        spawned++;
      }
    }

    update(dt) {
      for (const p of this.pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.mesh.visible = false; continue; }
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y -= 7 * dt;
        p.mesh.material.opacity = p.life / p.maxLife;
      }
    }
  }

  /* =========================================================
   *  FLOATING POP NUMBERS (3D Floating Canvas Sprites)
   * ========================================================= */
  class FloatingPopSystem {
    constructor(scene, THREE) {
      this.THREE = THREE;
      this.scene = scene;
      this.activePops = [];
      this.canvasCache = new Map();
    }

    _getTexture(text, colorStr) {
      const key = `${text}_${colorStr}`;
      if (this.canvasCache.has(key)) return this.canvasCache.get(key);

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, 256, 128);

      // Glow outline
      ctx.font = '900 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = colorStr;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000000';
      if (typeof ctx.strokeText === 'function') ctx.strokeText(text, 128, 64);

      // Solid text
      ctx.fillStyle = colorStr;
      if (typeof ctx.fillText === 'function') ctx.fillText(text, 128, 64);

      const texture = new this.THREE.CanvasTexture(canvas);
      texture.minFilter = this.THREE.LinearFilter;
      this.canvasCache.set(key, texture);
      return texture;
    }

    spawn(text, pos, colorHex = 0x00ff88) {
      const colorStr = '#' + new this.THREE.Color(colorHex).getHexString();
      const texture = this._getTexture(text, colorStr);

      const mat = new this.THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1.0,
        depthTest: false,
      });
      const sprite = new this.THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.position.y += 1.4 + Math.random() * 0.3;
      sprite.position.x += (Math.random() - 0.5) * 0.8;
      sprite.position.z += (Math.random() - 0.5) * 0.8;
      sprite.scale.set(3.2, 1.6, 1.0);

      this.scene.add(sprite);
      this.activePops.push({
        sprite,
        life: 0.65,
        maxLife: 0.65,
        vy: 4.5,
      });
    }

    update(dt) {
      for (let i = this.activePops.length - 1; i >= 0; i--) {
        const p = this.activePops[i];
        p.life -= dt * 1.1;
        p.sprite.position.y += p.vy * dt;
        p.vy *= 0.94; // slight drag

        const progress = 1 - p.life / p.maxLife;
        // Elastic bounce scale on spawn
        if (progress < 0.25) {
          const sc = 2.0 + (progress / 0.25) * 1.0;
          p.sprite.scale.set(sc * 1.1, sc * 0.55, 1.0);
        }

        p.sprite.material.opacity = Math.max(0, p.life / p.maxLife);

        if (p.life <= 0) {
          this.scene.remove(p.sprite);
          p.sprite.material.dispose();
          this.activePops.splice(i, 1);
        }
      }
    }
  }

  /* =========================================================
   *  SNAKE CLASS (With Visor Eyes & Phase Shield)
   * ========================================================= */
  const POWERUP_TYPES = ['LIGHTNING_BOOST', 'MAGNET', 'SHIELD', 'GHOST', 'SCORE_2X'];

  class Snake {
    constructor(id, isPlayer, color, startPos, scene, THREE, engine = null) {
      this.THREE    = THREE;
      this.scene    = scene;
      this.engine   = engine;
      this.id       = id;
      this.isPlayer = isPlayer;
      this.alive    = true;
      this.score    = 0;
      this.length   = 5;
      this.color    = color;
      this.segments = [];          // Three.js meshes
      this.positions = [];         // Vector3 history
      this.dir      = new THREE.Vector3(1, 0, 0);
      this.nextDir  = new THREE.Vector3(1, 0, 0);
      this.speed    = 1;            // multiplier
      this.isBoosting = false;
      this.tickAccum = 0;
      this.scale    = 1.0;
      this.slitherTime = Math.random() * 10;
      this.turnSpeed = CFG.TURN_SPEED;
      this.baseSpeed = CFG.BASE_SPEED;
      this.boostTurnSpeed = CFG.BOOST_TURN_SPEED;
      this.boostMultiplier = CFG.BOOST_MULTIPLIER;
      this.segmentSpacing = 1.05;
      this._prevHeadX = startPos.x;
      this._prevHeadZ = startPos.z;

      // Active power-ups: map type -> expiry timestamp
      this.powerups = {};

      // Phase Shield Invulnerability (on revive)
      this.isPhaseShielded = false;
      this.phaseShieldExpiry = 0;
      this._phaseShieldMesh = null;

      // AI personality
      this.aiMode  = ['aggressive', 'defensive', 'opportunist', 'random'][Math.floor(Math.random() * 4)];
      this.aiTarget = null;

      // Visuals: rounded neon cyber-spheres with seamless overlap for continuous organic serpent body
      this._geo     = new THREE.SphereGeometry(0.72, 12, 10);
      this._headGeo = new THREE.SphereGeometry(0.82, 14, 12);
      this._mat  = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.75,
        roughness: 0.2,
        metalness: 0.25,
      });
      this._headMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.15,
        roughness: 0.1,
        metalness: 0.35,
      });

      // Visor Eyes (Cyber Visor)
      this._leftEye  = null;
      this._rightEye = null;

      // Seed segments
      for (let i = 0; i < this.length; i++) {
        const pos = new THREE.Vector3(
          startPos.x - i * this.segmentSpacing * this.dir.x,
          startPos.y,
          startPos.z - i * this.segmentSpacing * this.dir.z
        );
        this.positions.push(pos.clone());
        const mesh = new THREE.Mesh(i === 0 ? this._headGeo : this._geo, i === 0 ? this._headMat : this._mat);
        mesh.position.copy(pos);
        mesh.castShadow = i === 0 || (this.engine ? this.engine.castBodyShadows : true);
        scene.add(mesh);
        this.segments.push(mesh);
      }

      // Attach Cyber Visor Eyes to head segment
      this._attachVisorEyes();

      // Pre-allocated circular ring buffer for exact zero-GC path following
      this._maxTrail = 4096;
      this._trailX = new Float32Array(this._maxTrail);
      this._trailZ = new Float32Array(this._maxTrail);
      this._trailHead = 0;
      this._trailCount = 0;

      // Seed initial trail behind head along -dir so body segments immediately track
      const seedDist = this.length * this.segmentSpacing * 2.5;
      const seedStep = 0.12;
      const seedCount = Math.ceil(seedDist / seedStep);
      for (let i = seedCount; i >= 0; i--) {
        const idx = this._trailCount % this._maxTrail;
        this._trailX[idx] = startPos.x - i * seedStep * this.dir.x;
        this._trailZ[idx] = startPos.z - i * seedStep * this.dir.z;
        this._trailCount++;
      }
      this._trailHead = (this._trailCount - 1) % this._maxTrail;
    }

    // ── Cyber Visor Eyes ─────────────────────────────────────
    _attachVisorEyes() {
      const eyeGeo = new this.THREE.BoxGeometry(0.24, 0.18, 0.24);
      const eyeMat = new this.THREE.MeshStandardMaterial({
        color: this.isPlayer ? 0x00ffff : 0xff3300,
        emissive: this.isPlayer ? 0x00ffff : 0xff2200,
        emissiveIntensity: 2.0,
        roughness: 0.1,
        metalness: 0.9,
      });

      this._leftEye  = new this.THREE.Mesh(eyeGeo, eyeMat);
      this._rightEye = new this.THREE.Mesh(eyeGeo, eyeMat);

      // Position prominently on brow surface of head sphere (r=0.82)
      this._leftEye.position.set(0.72, 0.28, 0.36);
      this._rightEye.position.set(0.72, 0.28, -0.36);
      this._leftEye.rotation.y = 0.25;
      this._rightEye.rotation.y = -0.25;

      this.segments[0].add(this._leftEye);
      this.segments[0].add(this._rightEye);
    }

    _updateVisorEyes() {
      if (!this._leftEye || !this._rightEye || !this.alive) return;
      // Eye orientation tracks current direction
      const angle = Math.atan2(this.dir.z, this.dir.x);
      this.segments[0].rotation.y = -angle;

      // Squint mode on sprint / boost
      const boosting = this.speed > 1 || this.isBoosting || this.hasPowerup('LIGHTNING_BOOST');
      const targetSquintY = boosting ? 0.35 : 1.0;
      const targetIntensity = boosting ? 2.8 : 2.0;

      this._leftEye.scale.y  += (targetSquintY - this._leftEye.scale.y) * 0.2;
      this._rightEye.scale.y += (targetSquintY - this._rightEye.scale.y) * 0.2;

      this._leftEye.material.emissiveIntensity += (targetIntensity - this._leftEye.material.emissiveIntensity) * 0.2;
    }

    // ── Phase Shield Management (Invulnerability Bubble) ─────
    activatePhaseShield(durationMs, now) {
      this.isPhaseShielded = true;
      this.phaseShieldExpiry = now + durationMs;

      if (!this._phaseShieldMesh) {
        const shieldGeo = new this.THREE.SphereGeometry(2.2, 24, 24);
        const shieldMat = new this.THREE.MeshStandardMaterial({
          color: 0x00ffff,
          emissive: 0x00aaff,
          emissiveIntensity: 2.8,
          transparent: true,
          opacity: 0.50,
          wireframe: true,
          roughness: 0.1,
          metalness: 0.8,
        });
        this._phaseShieldMesh = new this.THREE.Mesh(shieldGeo, shieldMat);
        this.segments[0].add(this._phaseShieldMesh);
      }
      this._phaseShieldMesh.visible = true;
    }

    tickPhaseShield(now) {
      if (!this.isPhaseShielded) return;
      if (now >= this.phaseShieldExpiry) {
        this.isPhaseShielded = false;
        if (this._phaseShieldMesh) this._phaseShieldMesh.visible = false;
      } else if (this._phaseShieldMesh) {
        // Pulsing holographic effect
        const rem = this.phaseShieldExpiry - now;
        const pulse = 0.35 + Math.sin(now * 0.015) * 0.15;
        this._phaseShieldMesh.material.opacity = pulse;
        this._phaseShieldMesh.rotation.y += 0.04;
        this._phaseShieldMesh.rotation.x += 0.02;
        // Blink fast in final 1 second
        if (rem < 1000) {
          this._phaseShieldMesh.visible = Math.sin(now * 0.04) > 0;
        }
      }
    }

    // ── Power-up management ─────────────────────────────────
    activatePowerup(type, now) {
      const durations = {
        LIGHTNING_BOOST: CFG.BOOST_DURATION,
        MAGNET:          CFG.BOOST_DURATION,
        SHIELD:          CFG.SHIELD_DURATION,
        GHOST:           CFG.GHOST_DURATION,
        SCORE_2X:        CFG.SCORE_MULTI_DURATION,
      };
      this.powerups[type] = now + (durations[type] || 5000);
      if (type === 'LIGHTNING_BOOST') this.speed = (this.boostMultiplier || CFG.BOOST_MULTIPLIER);
    }

    tickPowerups(now) {
      for (const type of Object.keys(this.powerups)) {
        if (now >= this.powerups[type]) {
          delete this.powerups[type];
          if (type === 'LIGHTNING_BOOST') this.speed = this.isBoosting ? (this.boostMultiplier || CFG.BOOST_MULTIPLIER) : 1;
        }
      }
      this.tickPhaseShield(now);
    }

    hasPowerup(type) { return !!this.powerups[type]; }

    // ── Grow on eat ─────────────────────────────────────────
    grow(amount = 1) {
      for (let i = 0; i < amount; i++) {
        const tail = this.positions[this.positions.length - 1].clone();
        this.positions.push(tail);
        const mesh = new this.THREE.Mesh(this._geo, this._mat);
        mesh.position.copy(tail);
        mesh.castShadow = this.engine ? this.engine.castBodyShadows : true;
        this.scene.add(mesh);
        this.segments.push(mesh);
        this.length++;
      }
      this.scale = 1.0 + Math.log10(Math.max(1, this.length / 5)) * 0.22;
    }

    // ── Movement step (Continuous Trail-Following & Zero-GC) ──────
    step(dt) {
      if (!this.alive) return;
      if (dt === undefined || dt <= 0) dt = 0.016;

      // 1. Butter-smooth continuous angular turning interpolation
      const curAngle = Math.atan2(this.dir.z, this.dir.x);
      const targetAngle = Math.atan2(this.nextDir.z, this.nextDir.x);
      let diff = targetAngle - curAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      const isBoosting = this.isBoosting || this.speed > 1 || this.hasPowerup('LIGHTNING_BOOST');
      const turnRate = isBoosting ? (this.boostTurnSpeed || CFG.BOOST_TURN_SPEED) : (this.turnSpeed || CFG.TURN_SPEED);
      const maxTurn = turnRate * dt;
      const clampedTurn = Math.max(-maxTurn, Math.min(maxTurn, diff));
      const newAngle = curAngle + clampedTurn;
      this.dir.x = Math.cos(newAngle);
      this.dir.z = Math.sin(newAngle);

      // 2. Continuous forward translation
      this._prevHeadX = this.positions[0].x;
      this._prevHeadZ = this.positions[0].z;
      const baseSpeed = this.baseSpeed || CFG.BASE_SPEED;
      const currentMultiplier = isBoosting ? Math.max(this.speed, (this.boostMultiplier || CFG.BOOST_MULTIPLIER)) : this.speed;
      const moveDist = baseSpeed * currentMultiplier * dt;
      this.positions[0].x += this.dir.x * moveDist;
      this.positions[0].z += this.dir.z * moveDist;

      // 3. Record head trajectory into circular path buffer (Zero-GC)
      const lastX = this._trailX[this._trailHead];
      const lastZ = this._trailZ[this._trailHead];
      const dx = this.positions[0].x - lastX;
      const dz = this.positions[0].z - lastZ;
      const dFromLast = Math.hypot(dx, dz);

      if (dFromLast >= 0.10) {
        const steps = Math.max(1, Math.min(8, Math.floor(dFromLast / 0.10)));
        if (steps <= 1) {
          this._trailHead = (this._trailHead + 1) % this._maxTrail;
          this._trailX[this._trailHead] = this.positions[0].x;
          this._trailZ[this._trailHead] = this.positions[0].z;
          if (this._trailCount < this._maxTrail) this._trailCount++;
        } else {
          for (let s = 1; s <= steps; s++) {
            const frac = s / steps;
            this._trailHead = (this._trailHead + 1) % this._maxTrail;
            this._trailX[this._trailHead] = lastX + dx * frac;
            this._trailZ[this._trailHead] = lastZ + dz * frac;
            if (this._trailCount < this._maxTrail) this._trailCount++;
          }
        }
      }

      // 4. Exact path-following interpolation for all body segments (No corner cutting)
      const scale = this.scale || 1.0;
      const spacing = (this.segmentSpacing || 1.05) * scale;
      let currIdx = this._trailHead;
      let pNearX = this.positions[0].x;
      let pNearZ = this.positions[0].z;
      let pFarX = this._trailX[currIdx];
      let pFarZ = this._trailZ[currIdx];
      let segD = Math.hypot(pNearX - pFarX, pNearZ - pFarZ);
      let distNear = 0;
      let distFar = segD;
      let targetD = spacing;
      let stepsBack = 0;
      const maxSteps = Math.min(this._trailCount, this._maxTrail) - 1;

      for (let seg = 1; seg < this.positions.length; seg++) {
        while (distFar < targetD && stepsBack < maxSteps) {
          distNear = distFar;
          pNearX = pFarX;
          pNearZ = pFarZ;
          currIdx = (currIdx - 1 + this._maxTrail) % this._maxTrail;
          pFarX = this._trailX[currIdx];
          pFarZ = this._trailZ[currIdx];
          const d = Math.hypot(pNearX - pFarX, pNearZ - pFarZ);
          segD = d;
          distFar += d;
          stepsBack++;
        }

        const span = distFar - distNear;
        const t = span > 0.0001 ? Math.max(0, Math.min(1, (targetD - distNear) / span)) : 0;
        this.positions[seg].x = pNearX + (pFarX - pNearX) * t;
        this.positions[seg].z = pNearZ + (pFarZ - pNearZ) * t;

        targetD += spacing;
      }

      // 5. Update Three.js meshes with natural slither undulation
      this.slitherTime = (this.slitherTime || 0) + dt * currentMultiplier * 8.0;
      for (let i = 0; i < this.segments.length; i++) {
        const m = this.segments[i];
        const p = this.positions[i];
        if (i === 0) {
          m.position.set(p.x, p.y, p.z);
          m.rotation.y = -newAngle;
        } else {
          const prev = this.positions[i - 1];
          const segAngle = Math.atan2(prev.z - p.z, prev.x - p.x);
          m.rotation.y = -segAngle;
          // Fluid organic wave undulation
          const wave = Math.sin(this.slitherTime + i * 0.42) * 0.10 * Math.min(1.0, i * 0.25);
          m.position.set(
            p.x - Math.sin(segAngle) * wave,
            p.y,
            p.z + Math.cos(segAngle) * wave
          );
        }
        // Subtle tail taper
        const segScale = scale * (i > this.segments.length - 4 ? (0.6 + (this.segments.length - i) * 0.13) : 1.0);
        m.scale.set(segScale, segScale, segScale);
      }

      this._updateVisorEyes();
    }

    // ── Eliminate ───────────────────────────────────────────
    eliminate(particles) {
      this.alive = false;
      if (particles) {
        for (const pos of this.positions) {
          particles.burst(pos, this.color, 5);
        }
      }
      if (this._phaseShieldMesh) {
        this.segments[0].remove(this._phaseShieldMesh);
        this._phaseShieldMesh = null;
      }
      for (const m of this.segments) {
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
      this.segments = [];
      this.positions = [];
    }

    // ── Convenience ─────────────────────────────────────────
    headPos() { return this.positions[0]; }

    setVisible(v) {
      for (const m of this.segments) m.visible = v;
    }
  }

  /* =========================================================
   *  AI DIRECTOR (Zero-Allocation GC Optimization)
   * ========================================================= */
  class AIDirector {
    constructor(THREE) {
      this.THREE = THREE;
      initStaticVectors(THREE);
      this._scratchNext = new THREE.Vector3();
    }

    steer(snake, foods, powerups, stormCenter, stormRadius, allSnakes, now) {
      if (!snake.alive || snake.isPlayer) return;

      const head = snake.headPos();
      let best = null;
      let bestScore = -Infinity;

      const speedMult = (snake.speed > 1 || snake.isBoosting) ? 1.5 : 1.0;
      const lookAhead = Math.max(10.0, (15.0 * speedMult) * (snake.scale || 1.0));
      const A = CFG.ARENA_SIZE - 2.5;
      const dirs = SAMPLE_DIRECTIONS || CARDINAL_DIRECTIONS;

      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        if (d.dot(snake.dir) < -0.72) continue; // Allow agile turns up to 136°

        const candX = head.x + d.x * lookAhead;
        const candZ = head.z + d.z * lookAhead;
        let score = 0;

        // 1. Arena boundary avoidance
        if (Math.abs(candX) > A || Math.abs(candZ) > A) {
          score -= 8000;
        } else {
          const edgeDist = Math.min(A - Math.abs(candX), A - Math.abs(candZ));
          if (edgeDist < 12) score -= (12 - edgeDist) * 350;
        }

        // 2. Storm boundary avoidance
        const dxStorm = candX - stormCenter.x;
        const dzStorm = candZ - stormCenter.z;
        const distStorm = Math.hypot(dxStorm, dzStorm);
        if (distStorm > stormRadius - 2) {
          score -= 5000;
        } else {
          score += (stormRadius - distStorm) * 3.0;
        }

        // 3. Enemy body avoidance & tactical combat
        let nearHazard = false;
        for (let j = 0; j < allSnakes.length; j++) {
          const other = allSnakes[j];
          if (!other.alive || other === snake) continue;

          // Check distance to other's head
          const oHead = other.headPos();
          const distToOHead = Math.hypot(candX - oHead.x, candZ - oHead.z);
          if (other.length >= snake.length) {
            // Flee larger snakes
            if (distToOHead < 15) {
              score -= (15 - distToOHead) * 450;
              nearHazard = true;
            }
          } else if (snake.aiMode === 'aggressive' && distToOHead < 20) {
            // Cut off smaller snakes (aim slightly ahead)
            const cutoffX = oHead.x + other.dir.x * 4.0;
            const cutoffZ = oHead.z + other.dir.z * 4.0;
            const distCutoff = Math.hypot(candX - cutoffX, candZ - cutoffZ);
            score += (25 - distCutoff) * 20;
          }

          // Check distance to other's body segments
          for (let k = 1; k < other.positions.length; k += 2) {
            const p = other.positions[k];
            const distToSeg = Math.hypot(candX - p.x, candZ - p.z);
            if (distToSeg < 5.2 * (other.scale || 1.0)) {
              score -= (5.2 - distToSeg) * 950;
              nearHazard = true;
            }
          }
        }

        // 4. Food & Nutrient pellets attraction
        if (!nearHazard) {
          const maxFoods = Math.min(30, foods.length);
          for (let f = 0; f < maxFoods; f++) {
            const fPos = foods[f].mesh.position;
            const distF = Math.hypot(candX - fPos.x, candZ - fPos.z);
            if (distF < 32) {
              const val = foods[f].isDeathPellet ? 12.0 : 4.5;
              score += (32 - distF) * val;
            }
          }
          const maxPowerups = Math.min(6, powerups.length);
          for (let p = 0; p < maxPowerups; p++) {
            const pPos = powerups[p].mesh.position;
            const distP = Math.hypot(candX - pPos.x, candZ - pPos.z);
            if (distP < 28) {
              score += (28 - distP) * 8.0;
            }
          }
        }

        // Forward momentum bias
        score += d.dot(snake.dir) * 20;

        if (score > bestScore) {
          bestScore = score;
          best = d;
        }
      }

      if (best) snake.nextDir.copy(best);

      // Tactical boosting logic for AI (with burst duration & cooldown)
      if (!snake.aiBoostCooldown) snake.aiBoostCooldown = 0;
      if (!snake.aiBoostDuration) snake.aiBoostDuration = 0;

      if (snake.aiBoostDuration > 0) {
        snake.aiBoostDuration -= 0.05;
        snake.isBoosting = true;
        snake.speed = (snake.boostMultiplier || CFG.BOOST_MULTIPLIER);
      } else {
        if (snake.aiBoostCooldown > 0) {
          snake.aiBoostCooldown -= 0.05;
        }
        if (snake.aiBoostCooldown <= 0 && ((snake.aiMode === 'aggressive' && bestScore > 60) || bestScore < -600)) {
          // Trigger a 1.2-second tactical sprint
          snake.aiBoostDuration = 1.2;
          snake.aiBoostCooldown = 3.5;
          snake.isBoosting = true;
          snake.speed = (snake.boostMultiplier || CFG.BOOST_MULTIPLIER);
        } else {
          snake.isBoosting = false;
          snake.speed = 1;
        }
      }
    }
  }

  /* =========================================================
   *  FOOD & POWER-UP MANAGER
   * ========================================================= */
  class ItemManager {
    constructor(scene, THREE) {
      this.THREE = THREE;
      this.scene = scene;
      this.foods   = [];
      this.powerups = [];
      this._puColors = {
        LIGHTNING_BOOST: 0xffff00,
        MAGNET:          0xff00ff,
        SHIELD:          0x00ffff,
        GHOST:           0xaaaaff,
        SCORE_2X:        0xff8800,
      };
      this._puLabels = Object.keys(this._puColors);
    }

    _rndPos() {
      const A = CFG.ARENA_SIZE - 2;
      return new this.THREE.Vector3(
        (Math.random() * 2 - 1) * A,
        0.6,
        (Math.random() * 2 - 1) * A
      );
    }

    spawnFood() {
      const geo = new this.THREE.SphereGeometry(0.5, 8, 8);
      const hue = Math.random();
      const color = new this.THREE.Color().setHSL(hue, 1, 0.5);
      const mat = new this.THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.0,
        roughness: 0.1,
        metalness: 0.15,
      });
      const mesh = new this.THREE.Mesh(geo, mat);
      mesh.position.copy(this._rndPos());
      // Glow halo
      const haloGeo = new this.THREE.SphereGeometry(0.75, 8, 8);
      const haloMat = new this.THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.30, side: this.THREE.BackSide });
      const halo = new this.THREE.Mesh(haloGeo, haloMat);
      mesh.add(halo);
      this.scene.add(mesh);
      this.foods.push({ mesh, halo, hue, t: Math.random() * Math.PI * 2 });
    }

    spawnPowerup() {
      const type = this._puLabels[Math.floor(Math.random() * this._puLabels.length)];
      const color = this._puColors[type];
      const geo = new this.THREE.OctahedronGeometry(0.7);
      const mat = new this.THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.4,
        roughness: 0.05,
        metalness: 0.85,
      });
      const mesh = new this.THREE.Mesh(geo, mat);
      mesh.position.copy(this._rndPos());
      // Ring
      const ringGeo = new this.THREE.TorusGeometry(1.0, 0.07, 8, 32);
      const ringMat = new this.THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });
      const ring = new this.THREE.Mesh(ringGeo, ringMat);
      mesh.add(ring);
      this.scene.add(mesh);
      this.powerups.push({ mesh, ring, type, t: Math.random() * Math.PI * 2 });
    }

    // ── Glowing Death Burst Nutrient Pellets (Dispersal on snake elimination) ──
    spawnDeathPellets(positions, color, length) {
      if (!positions || positions.length === 0) return;
      const count = Math.min(25, Math.max(5, Math.floor(positions.length * 0.75)));
      const step = Math.max(1, Math.floor(positions.length / count));
      const col = new this.THREE.Color(color);

      for (let i = 0; i < positions.length; i += step) {
        const p = positions[i];
        const geo = new this.THREE.SphereGeometry(0.65, 8, 8);
        const mat = new this.THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 2.4,
          roughness: 0.1,
          metalness: 0.2,
        });
        const mesh = new this.THREE.Mesh(geo, mat);
        mesh.position.set(
          p.x + (Math.random() - 0.5) * 1.5,
          0.6,
          p.z + (Math.random() - 0.5) * 1.5
        );
        const haloGeo = new this.THREE.SphereGeometry(0.95, 8, 8);
        const haloMat = new this.THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.35,
          side: this.THREE.BackSide,
        });
        const halo = new this.THREE.Mesh(haloGeo, haloMat);
        mesh.add(halo);
        this.scene.add(mesh);
        this.foods.push({
          mesh,
          halo,
          isDeathPellet: true,
          value: 20,
          t: Math.random() * Math.PI * 2,
        });
      }
    }

    fill() {
      while (this.foods.length < CFG.FOOD_COUNT)   this.spawnFood();
      while (this.powerups.length < CFG.POWERUP_COUNT) this.spawnPowerup();
    }

    removeFood(idx) {
      const f = this.foods[idx];
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      this.foods.splice(idx, 1);
    }

    removePowerup(idx) {
      const p = this.powerups[idx];
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      this.powerups.splice(idx, 1);
    }

    animate(elapsed) {
      for (const f of this.foods) {
        f.t += 0.03;
        f.mesh.position.y = 0.6 + Math.sin(f.t) * 0.2;
        f.mesh.rotation.y += 0.02;
        if (f.isDeathPellet) {
          f.mesh.material.emissiveIntensity = 2.4 + Math.sin(f.t * 2) * 0.4;
          f.halo.material.opacity = 0.35 + Math.sin(f.t * 2) * 0.15;
        } else {
          f.mesh.material.emissiveIntensity = 1.9 + Math.sin(f.t * 1.5) * 0.4;
          f.halo.material.opacity = 0.25 + Math.sin(f.t * 2) * 0.10;
        }
      }
      for (const p of this.powerups) {
        p.t += 0.025;
        p.mesh.position.y = 1.0 + Math.sin(p.t) * 0.3;
        p.mesh.rotation.y += 0.03;
        p.ring.rotation.x += 0.05;
        p.ring.rotation.z += 0.03;
      }
    }
  }

  /* =========================================================
   *  ELECTRIC STORM ZONE
   * ========================================================= */
  class StormZone {
    constructor(scene, THREE) {
      this.THREE = THREE;
      this.scene = scene;
      this.radius = CFG.ARENA_SIZE * 1.42; // diagonal
      this.center = new THREE.Vector3(0, 0, 0);
      this.active = false;
      this.lastDmgTick = 0;
      this.alarmFired  = false;

      // Visual cylinder wall
      const geo = new THREE.CylinderGeometry(this.radius, this.radius, 40, 64, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff2200,
        transparent: true,
        opacity: 0.28,
        side: THREE.BackSide,
        wireframe: false,
      });
      this.wall = new THREE.Mesh(geo, mat);
      this.wall.position.y = 0;
      scene.add(this.wall);

      // Lightning arc ring
      const ringGeo = new THREE.TorusGeometry(this.radius, 0.4, 4, 128);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.95 });
      this.ring = new THREE.Mesh(ringGeo, ringMat);
      this.ring.rotation.x = Math.PI / 2;
      scene.add(this.ring);
    }

    shrink(dt) {
      if (!this.active) return;
      this.radius = Math.max(CFG.STORM_MIN_RADIUS, this.radius - CFG.STORM_SHRINK_RATE * dt * CFG.ARENA_SIZE);
      this._refresh();
    }

    _refresh() {
      this.wall.scale.set(this.radius / (CFG.ARENA_SIZE * 1.42), 1, this.radius / (CFG.ARENA_SIZE * 1.42));
      this.ring.scale.set(this.radius / (CFG.ARENA_SIZE * 1.42), this.radius / (CFG.ARENA_SIZE * 1.42), 1);
    }

    isOutside(pos) {
      return pos.distanceTo(this.center) > this.radius;
    }

    animate(elapsed) {
      const flicker = 0.22 + Math.sin(elapsed * 7) * 0.08 + Math.sin(elapsed * 13) * 0.04;
      this.wall.material.opacity = this.active ? flicker : 0;
      this.ring.material.opacity = this.active ? (0.85 + Math.sin(elapsed * 10) * 0.12) : 0;
      // Electric red-orange HSL: hue 0.03–0.07 (red-orange), full saturation, vivid
      this.wall.material.color.setHSL(0.04 + Math.sin(elapsed * 3) * 0.02, 1, 0.55);
    }
  }

  /* =========================================================
   *  ARENA BUILDER
   * ========================================================= */
  function buildArena(scene, THREE, isMobile = false) {
    // Ground - extended to 4x arena size so camera never clips into empty void
    const groundGeo = new THREE.PlaneGeometry(CFG.ARENA_SIZE * 4, CFG.ARENA_SIZE * 4, 60, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070e28,
      roughness: 0.85,
      metalness: 0.15,
      emissive: 0x050a1e,
      emissiveIntensity: 0.25,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid lines - crisp glowing cyber grid lifted 0.025 to avoid z-fighting
    const gridHelper = new THREE.GridHelper(CFG.ARENA_SIZE * 2, 60, 0x00f3ff, 0x224a8c);
    gridHelper.position.y = 0.025;
    scene.add(gridHelper);

    // 3D Cyber Forcefield Perimeter Barrier Walls (Translucent Glowing Energy Fence)
    const wallColor = 0x0088ff;
    const A = CFG.ARENA_SIZE;
    const wallHeight = 5.5;
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x0099ff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });
    const railMat = new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.90
    });

    const wallGeoH = new THREE.PlaneGeometry(A * 2, wallHeight);
    const wallN = new THREE.Mesh(wallGeoH, wallMat);
    wallN.position.set(0, wallHeight / 2, -A);
    scene.add(wallN);
    const wallS = new THREE.Mesh(wallGeoH, wallMat);
    wallS.position.set(0, wallHeight / 2, A);
    scene.add(wallS);
    const wallE = new THREE.Mesh(wallGeoH, wallMat);
    wallE.position.set(A, wallHeight / 2, 0);
    wallE.rotation.y = Math.PI / 2;
    scene.add(wallE);
    const wallW = new THREE.Mesh(wallGeoH, wallMat);
    wallW.position.set(-A, wallHeight / 2, 0);
    wallW.rotation.y = Math.PI / 2;
    scene.add(wallW);

    // Glowing top laser rail along each wall
    const railGeoH = new THREE.CylinderGeometry(0.12, 0.12, A * 2, 8);
    const railN = new THREE.Mesh(railGeoH, railMat);
    railN.rotation.z = Math.PI / 2;
    railN.position.set(0, wallHeight, -A);
    scene.add(railN);
    const railS = new THREE.Mesh(railGeoH, railMat);
    railS.rotation.z = Math.PI / 2;
    railS.position.set(0, wallHeight, A);
    scene.add(railS);
    const railE = new THREE.Mesh(railGeoH, railMat);
    railE.rotation.x = Math.PI / 2;
    railE.position.set(A, wallHeight, 0);
    scene.add(railE);
    const railW = new THREE.Mesh(railGeoH, railMat);
    railW.rotation.x = Math.PI / 2;
    railW.position.set(-A, wallHeight, 0);
    scene.add(railW);

    // 4 Corner Cyber Energy Beacons
    const beaconGeo = new THREE.CylinderGeometry(0.3, 0.45, wallHeight * 1.4, 8);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x00f3ff,
      emissive: 0x00aaff,
      emissiveIntensity: 2.4,
      metalness: 0.8,
      roughness: 0.2
    });
    [[-A, -A], [A, -A], [A, A], [-A, A]].forEach(([px, pz]) => {
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(px, (wallHeight * 1.4) / 2, pz);
      scene.add(beacon);
    });

    // Ambient + directional lights
    scene.add(new THREE.AmbientLight(0x2c4070, 0.90));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    const initialShadowSize = isMobile ? 1024 : 2048;
    sun.shadow.mapSize.width  = initialShadowSize;
    sun.shadow.mapSize.height = initialShadowSize;
    scene.add(sun);

    // Neon point lights (4 corners)
    const ptColors = [0x00f3ff, 0xff00aa, 0x00ff88, 0xffaa00];
    for (let i = 0; i < 4; i++) {
      const pt = new THREE.PointLight(ptColors[i], 2.0, 55);
      const ang = (i / 4) * Math.PI * 2;
      pt.position.set(Math.cos(ang) * A * 0.9, 8, Math.sin(ang) * A * 0.9);
      scene.add(pt);
    }

    return { sun, ground };
  }

  /* =========================================================
   *  SNAKE COLORS
   * ========================================================= */
  const SNAKE_COLORS = [
    0x00ff88, // player  — neon green
    0xff3366, // AI 1
    0xffaa00, // AI 2
    0x00aaff, // AI 3
    0xff00ff, // AI 4
    0xffff00, // AI 5
    0xff6600, // AI 6
    0x00ffff, // AI 7
    0xaa00ff, // AI 8
    0xff0066, // AI 9
  ];

  /* =========================================================
   *  MAIN ENGINE CLASS
   * ========================================================= */
  class ApexSerpentEngine {
    constructor() {
      this.THREE      = null;
      this.renderer   = null;
      this.scene      = null;
      this.camera     = null;
      this.snakes     = [];
      this.player     = null;
      this.items      = null;
      this.storm      = null;
      this.particles  = null;
      this.popups     = null;
      this.audio      = new AudioEngine();
      this.ai         = null;
      this.running    = false;
      this.paused     = false;
      this.elapsed    = 0;
      this.startTime  = 0;
      this._lastTick  = 0;
      this._lastFrame = 0;
      this._animId    = null;
      this._stormActivated = false;
      this._aliveCount = CFG.NUM_AI + 1;

      // Camera & Effects
      this._camTarget = null;
      this._camPos    = null;
      this.cameraTrauma = 0;   // Screen shake trauma (decays over time)

      // 3D Golden Crown for #1 King
      this.crownMesh  = null;
      this.currentKing = null;

      // Combat Kill-Streak System
      this.playerKills   = 0;
      this.killStreak    = 0;
      this.lastKillTime  = 0;
      this.lastEatTime   = 0;
      this.eatComboCount = 0;

      // ── Public event hooks (HUD / Ad layer calls these) ───
      this.hooks = {
        onScoreUpdate:      null, // (playerScore, rank)
        onLengthUpdate:     null, // (playerLength)
        onPowerupActivated: null, // (type, expiresIn_ms)
        onPowerupExpired:   null, // (type)
        onElimination:      null, // (snakeId, isPlayer)
        onPlayerDeath:      null, // (finalScore, rank)
        onVictory:          null, // (finalScore, isPlayer)
        onStormWarning:     null, // ()
        onStormShrink:      null, // (radius)
        onGameReady:        null, // ()
        onShowInterstitial: null, // () — ad hook: player died, show ad
        onShowRewardedAd:   null, // () — ad hook: player wants revive
        onKillStreak:       null, // (streakData: { title, streak, totalKills })
        onKingUpdate:       null, // (kingData: { id, isPlayer, position, score, bearingAngleDeg, distanceToPlayer })
        onPhaseShield:      null, // (active, remainingMs)
        onFloatingPop:      null, // (text, worldPos, colorHex)
        onQualityTierChange: null, // (qualityData: { tier, averageFps, pixelRatio, shadowMapType })
      };

      // Player direction input queue & recyclable vector pool
      this._inputQueue = [];
      this._inputVecPool = [];

      // Adaptive FPS Monitor & Quality Tier
      this.fpsWindow = new Float32Array(60);
      this.fpsWindowIndex = 0;
      this.fpsSampleCount = 0;
      this.runningFpsSum = 0;
      this.averageFps = 60;
      this.isPerformanceTier = false;
      this.particleBurstScale = 1.0;
      this.castBodyShadows = true;
      this.isMobile = false;
      this.sunLight = null;

      // Zero-Allocation Scratch Calculation Vectors
      this._scratchVec   = null;
      this._camOffset    = null;
      this._camDesired   = null;
      this._inputScratch = null;
    }

    /* ── init ───────────────────────────────────────────────── */
    async init(canvas) {
      if (!global.THREE) {
        await this._loadThree();
      }
      this.THREE = global.THREE;
      initStaticVectors(this.THREE);

      this._scratchVec   = new this.THREE.Vector3();
      this._camOffset    = new this.THREE.Vector3();
      this._camDesired   = new this.THREE.Vector3();
      this._inputScratch = new this.THREE.Vector3();
      for (let i = 0; i < 6; i++) {
        this._inputVecPool.push(new this.THREE.Vector3());
      }

      // Detect mobile / coarse pointer / low power
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (global.matchMedia && (global.matchMedia('(pointer: coarse)').matches || global.matchMedia('(max-width: 768px)').matches));
      this.isMobile = !!isMobile;

      // Cap initial pixel ratio to Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2)
      const maxInitialDpr = this.isMobile ? 1.5 : 2.0;
      const initialPixelRatio = Math.min(global.devicePixelRatio || 1, maxInitialDpr);

      // WebGLRenderer setup with high-performance powerPreference
      this.renderer = new this.THREE.WebGLRenderer({
        canvas,
        antialias: !this.isMobile,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(initialPixelRatio);
      this.renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type    = this.THREE.PCFSoftShadowMap;
      this.renderer.toneMapping       = this.THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      if (typeof this.renderer.setClearColor === 'function') {
        this.renderer.setClearColor(0x060d24, 1.0);
      }

      // Scene
      this.scene = new this.THREE.Scene();
      this.scene.background = new this.THREE.Color(0x060d24);
      this.scene.fog         = new this.THREE.FogExp2(0x060d24, 0.0075);

      // Camera with Dynamic FOV
      this.camera = new this.THREE.PerspectiveCamera(CFG.FOV_NORMAL, (canvas.clientWidth || 800) / (canvas.clientHeight || 600), 0.1, 500);
      this.camera.position.set(0, 35, 40);
      this.camera.lookAt(0, 0, 0);
      this._camTarget = new this.THREE.Vector3(0, 0, 0);
      this._camPos    = new this.THREE.Vector3(0, 35, 40);

      // Build arena world
      const arena = buildArena(this.scene, this.THREE, this.isMobile);
      this.sunLight = arena.sun;

      // Systems
      this.particles = new ParticleSystem(this.scene, this.THREE);
      this.popups    = new FloatingPopSystem(this.scene, this.THREE);
      this.storm     = new StormZone(this.scene, this.THREE);
      this.items     = new ItemManager(this.scene, this.THREE);
      this.items.fill();
      this.ai        = new AIDirector(this.THREE);

      // Build 3D Golden Crown for the #1 King
      this._buildCrown();

      // Spawn snakes
      this._spawnSnakes();

      // Audio
      this.audio.init();

      // Input
      this._bindInput();

      // Resize handler
      this._onResize = () => {
        const w = canvas.clientWidth || (global.innerWidth || 800);
        const h = canvas.clientHeight || (global.innerHeight || 600);
        if (w <= 0 || h <= 0) return;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      };
      global.addEventListener('resize', this._onResize, { passive: true });

      this.running   = true;
      this.startTime = performance.now();
      this._lastTick = this.startTime;
      this._lastFrame = this.startTime;

      this._fire('onGameReady');
      this._loop();
    }

    /* ── Dynamic Quality Scaling & Performance Tier ───────────── */
    setPerformanceTier() {
      if (this.isPerformanceTier) return;
      this.isPerformanceTier = true;
      console.warn(`[Apex Engine] Dynamic Adaptive Scaler: Running average FPS dropped to ${this.averageFps.toFixed(1)} (< 48 FPS). Throttling to Performance Tier.`);

      // 1. Lower pixelRatio to 1.0 or 1.25
      const targetPixelRatio = this.isMobile ? 1.0 : 1.25;
      if (this.renderer) {
        this.renderer.setPixelRatio(targetPixelRatio);
      }

      // 2. Switch renderer.shadowMap.type from PCFSoftShadowMap to BasicShadowMap
      // and disable shadows on snake body segments (retaining head and ground shadows)
      if (this.renderer && this.renderer.shadowMap) {
        this.renderer.shadowMap.type = this.THREE.BasicShadowMap;
        this.renderer.shadowMap.needsUpdate = true;
      }
      this.castBodyShadows = false;
      for (let s = 0; s < this.snakes.length; s++) {
        const snake = this.snakes[s];
        // Keep head segment (index 0) casting shadow, disable body segments (index >= 1)
        for (let i = 1; i < snake.segments.length; i++) {
          snake.segments[i].castShadow = false;
        }
      }

      // 3. Reduce shadowMap size from 2048 to 1024/512 on mobile
      if (this.sunLight && this.sunLight.shadow) {
        const targetMapSize = this.isMobile ? 512 : 1024;
        this.sunLight.shadow.mapSize.width = targetMapSize;
        this.sunLight.shadow.mapSize.height = targetMapSize;
        if (this.sunLight.shadow.map) {
          this.sunLight.shadow.map.dispose();
          this.sunLight.shadow.map = null;
        }
        if (this.renderer && this.renderer.shadowMap) {
          this.renderer.shadowMap.needsUpdate = true;
        }
      }

      // 4. Scale particle burst count from 20 to 10
      this.particleBurstScale = 0.5;
      if (this.particles) {
        this.particles.burstScale = 0.5;
      }

      this._fire('onQualityTierChange', {
        tier: 'performance',
        averageFps: this.averageFps,
        pixelRatio: targetPixelRatio,
        shadowMapType: 'BasicShadowMap'
      });
    }

    /* ── Three.js dynamic loader ─────────────────────────────── */
    _loadThree() {
      return new Promise((resolve, reject) => {
        if (document.querySelector('script[data-three]')) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.min.js';
        s.setAttribute('data-three', '1');
        s.onload  = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    /* ── 3D Golden Crown Builder ─────────────────────────────── */
    _buildCrown() {
      const crownGroup = new this.THREE.Group();

      // Base ring
      const ringGeo = new this.THREE.TorusGeometry(0.75, 0.12, 10, 24);
      const goldMat = new this.THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xff9900,
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.95,
      });
      const ringMesh = new this.THREE.Mesh(ringGeo, goldMat);
      ringMesh.rotation.x = Math.PI / 2;
      crownGroup.add(ringMesh);

      // 5 Golden Spikes + Jewel tips
      const spikeGeo = new this.THREE.ConeGeometry(0.2, 0.55, 5);
      const jewelColors = [0xff0055, 0x00ffff, 0x00ff88, 0xff00ff, 0xffff00];
      const jewelGeo = new this.THREE.SphereGeometry(0.1, 8, 8);

      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const x = Math.cos(ang) * 0.75;
        const z = Math.sin(ang) * 0.75;

        const spike = new this.THREE.Mesh(spikeGeo, goldMat);
        spike.position.set(x, 0.28, z);
        crownGroup.add(spike);

        // Glowing jewel on spike tip
        const jewelMat = new this.THREE.MeshBasicMaterial({ color: jewelColors[i] });
        const jewel = new this.THREE.Mesh(jewelGeo, jewelMat);
        jewel.position.set(x, 0.58, z);
        crownGroup.add(jewel);
      }

      crownGroup.visible = false;
      this.scene.add(crownGroup);
      this.crownMesh = crownGroup;
    }

    /* ── Spawn all snakes ────────────────────────────────────── */
    _spawnSnakes(playerColor) {
      const pColor = playerColor || SNAKE_COLORS[0];
      for (let i = 0; i <= CFG.NUM_AI; i++) {
        const angle  = (i / (CFG.NUM_AI + 1)) * Math.PI * 2;
        const radius = 20 + Math.random() * 15;
        const startPos = new this.THREE.Vector3(
          Math.cos(angle) * radius,
          0.6,
          Math.sin(angle) * radius
        );
        const col = i === 0 ? pColor : SNAKE_COLORS[i];
        const snake = new Snake(i, i === 0, col, startPos, this.scene, this.THREE, this);
        if (i > 0) {
          const a = Math.random() * Math.PI * 2;
          snake.dir.set(Math.cos(a), 0, Math.sin(a));
          snake.nextDir.copy(snake.dir);
        }
        this.snakes.push(snake);
      }
      this.player = this.snakes[0];
    }

    /* ── Keyboard & Input Handling (Zero-Allocation Pool) ────── */
    _bindInput() {
      const dirMap = {
        ArrowUp:    DIR_UP,
        ArrowDown:  DIR_DOWN,
        ArrowLeft:  DIR_LEFT,
        ArrowRight: DIR_RIGHT,
        KeyW:       DIR_UP,
        KeyS:       DIR_DOWN,
        KeyA:       DIR_LEFT,
        KeyD:       DIR_RIGHT,
      };

      this._keyHandler = (e) => {
        const targetDir = dirMap[e.code];
        if (targetDir) {
          e.preventDefault();
          this._queueDirection(targetDir);
        }
        if (e.code === 'Space') {
          e.preventDefault();
          this.setPlayerBoost(true);
        }
      };

      this._keyUpHandler = (e) => {
        if (e.code === 'Space') {
          this.setPlayerBoost(false);
        }
      };

      global.addEventListener('keydown', this._keyHandler);
      global.addEventListener('keyup', this._keyUpHandler);
    }

    _queueDirection(targetDir) {
      if (!this.player || !this.player.alive) return;
      this.player.nextDir.copy(targetDir);
      if (this._inputQueue.length > 0) {
        this._inputQueue[this._inputQueue.length - 1].copy(targetDir);
      } else {
        const v = this._inputVecPool.pop() || new this.THREE.Vector3();
        v.copy(targetDir);
        this._inputQueue.push(v);
      }
    }

    setPlayerDirection(dx, dz) {
      if (!this.player || !this.player.alive) return;
      if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;
      this._inputScratch.set(dx, 0, dz).normalize();
      this.player.nextDir.copy(this._inputScratch);
      if (this._inputQueue.length > 0) {
        this._inputQueue[this._inputQueue.length - 1].copy(this._inputScratch);
      } else {
        const v = this._inputVecPool.pop() || new this.THREE.Vector3();
        v.copy(this._inputScratch);
        this._inputQueue.push(v);
      }
    }

    setPlayerBoost(boosting) {
      if (!this.player || !this.player.alive) return;
      this.player.isBoosting = !!boosting;
      if (boosting) {
        this.player.speed = (this.player.boostMultiplier || CFG.BOOST_MULTIPLIER);
        if (this.audio) this.audio.boost();
      } else if (!this.player.hasPowerup('LIGHTNING_BOOST')) {
        this.player.speed = 1;
      }
    }

    /* ── Main Animation Loop ────────────────────────────────── */
    _loop() {
      this._animId = requestAnimationFrame(() => this._loop());
      if (!this.running || this.paused) return;

      const now = performance.now();
      const rawDt = (now - this._lastFrame) / 1000;
      // Requirement 3: Clamp game loop delta time dt to Math.min(dt, 0.05) to prevent physics stutter or jumpiness
      const dt  = Math.min(rawDt, 0.05);
      this._lastFrame = now;
      this.elapsed = (now - this.startTime) / 1000;

      // Adaptive FPS Monitor: Track running average FPS over 60 frames
      if (rawDt > 0.0001) {
        const instantFps = 1 / rawDt;
        if (this.fpsSampleCount < 60) {
          this.fpsWindow[this.fpsWindowIndex] = instantFps;
          this.runningFpsSum += instantFps;
          this.fpsSampleCount++;
          this.fpsWindowIndex = (this.fpsWindowIndex + 1) % 60;
          this.averageFps = this.runningFpsSum / this.fpsSampleCount;
        } else {
          this.runningFpsSum -= this.fpsWindow[this.fpsWindowIndex];
          this.fpsWindow[this.fpsWindowIndex] = instantFps;
          this.runningFpsSum += instantFps;
          this.fpsWindowIndex = (this.fpsWindowIndex + 1) % 60;
          this.averageFps = this.runningFpsSum / 60;

          // If average FPS dips below 48 FPS on a device, automatically throttle down to Performance Tier
          if (!this.isPerformanceTier && this.averageFps < 48) {
            this.setPerformanceTier();
          }
        }
      }

      // Storm activation
      if (!this._stormActivated && now - this.startTime > CFG.STORM_START_DELAY) {
        this._stormActivated = true;
        this.storm.active = true;
        this.audio.stormAlarm();
        this._fire('onStormWarning');
      }

      // Storm shrink
      if (this.storm.active) {
        this.storm.shrink(dt);
        this._fire('onStormShrink', this.storm.radius);
      }

      // Animate items, storm, popups, and crown
      this.items.animate(this.elapsed);
      this.storm.animate(this.elapsed);
      this.popups.update(dt);
      this._updateCrown(dt);

      // Tick power-ups & phase shields
      for (let s = 0; s < this.snakes.length; s++) {
        if (this.snakes[s].alive) this.snakes[s].tickPowerups(now);
      }

      // Phase shield telemetry hook for player
      if (this.player && this.player.alive) {
        const isShielded = this.player.isPhaseShielded;
        const remMs = isShielded ? Math.max(0, this.player.phaseShieldExpiry - now) : 0;
        this._fire('onPhaseShield', isShielded, remMs);
      }

      // Fire pre-step hook for 0ms input-to-physics latency
      this._fire('onBeforeStep', dt);

      // Apply queued player input with zero latency before physics step
      this._applyInput();

      // AI steering updates before physics step
      for (let s = 0; s < this.snakes.length; s++) {
        const snake = this.snakes[s];
        if (!snake.isPlayer && snake.alive) {
          this.ai.steer(snake, this.items.foods, this.items.powerups, this.storm.center, this.storm.radius, this.snakes, now);
        }
      }

      // Continuous butter-smooth snake movement & curvature interpolation
      for (let s = 0; s < this.snakes.length; s++) {
        const snake = this.snakes[s];
        if (snake.alive) {
          snake.step(dt);
        }
      }

      // Physics, gap-free collision detection, vacuum food ingestion & item pickups
      this._updatePhysicsAndCollisions(now, dt);

      // Ghost flicker
      if (this.player.alive && this.player.hasPowerup('GHOST')) {
        const v = Math.sin(this.elapsed * 20) > 0;
        this.player.setVisible(v);
      } else if (this.player.alive) {
        this.player.setVisible(true);
      }

      // Dynamic Camera Auto-Zoom & Sprint Warp & Screen Shake
      this._updateCamera(dt);

      // Particles
      this.particles.update(dt);

      // Render
      this.renderer.render(this.scene, this.camera);
    }

    /* ── 3D Golden Crown & King Telemetry ───────────────────── */
    _updateCrown(dt) {
      if (!this.crownMesh) return;

      // Find top #1 alive snake by score / length
      const aliveSnakes = this.snakes.filter(s => s.alive);
      if (aliveSnakes.length === 0) {
        this.crownMesh.visible = false;
        return;
      }

      aliveSnakes.sort((a, b) => b.score !== a.score ? b.score - a.score : b.length - a.length);
      const king = aliveSnakes[0];
      this.currentKing = king;

      // Hover crown dynamically over King's head
      const head = king.headPos();
      const hoverY = 2.4 + Math.sin(this.elapsed * 4.5) * 0.35;
      this.crownMesh.position.set(head.x, head.y + hoverY, head.z);
      this.crownMesh.rotation.y += dt * 2.2;
      this.crownMesh.visible = true;

      // Calculate bearing and distance from player to King for HUD compass
      if (this.player && this.player.alive) {
        const pHead = this.player.headPos();
        const dx = head.x - pHead.x;
        const dz = head.z - pHead.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        // Angle in degrees relative to world north (z-)
        const bearingAngleDeg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;

        this._fire('onKingUpdate', {
          id: king.id,
          isPlayer: king.isPlayer,
          position: { x: head.x, y: head.y, z: head.z },
          score: king.score,
          length: king.length,
          distanceToPlayer: Math.round(dist),
          bearingAngleDeg,
        });
      }
    }

    getKingTelemetry() {
      if (!this.currentKing || !this.currentKing.alive) return null;
      const head = this.currentKing.headPos();
      let dist = 0, bearing = 0;
      if (this.player && this.player.alive) {
        const pHead = this.player.headPos();
        const dx = head.x - pHead.x;
        const dz = head.z - pHead.z;
        dist = Math.sqrt(dx * dx + dz * dz);
        bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
      }
      return {
        id: this.currentKing.id,
        isPlayer: this.currentKing.isPlayer,
        position: { x: head.x, y: head.y, z: head.z },
        score: this.currentKing.score,
        length: this.currentKing.length,
        distanceToPlayer: dist,
        bearingAngleDeg: bearing,
      };
    }

    /* ── Physics, Gap-Free Collision, Vacuum Food Ingestion & Pickups ── */
    _updatePhysicsAndCollisions(now, dt) {
      const A = CFG.ARENA_SIZE - 0.5;

      // ── Wall, Storm & Snake Combat Collisions ───────────────────
      for (let sIdx = 0; sIdx < this.snakes.length; sIdx++) {
        const s = this.snakes[sIdx];
        if (!s.alive) continue;
        const head = s.headPos();

        // 1. Arena boundary limit
        if (Math.abs(head.x) > A || Math.abs(head.z) > A) {
          if (!s.hasPowerup('GHOST') && !s.isPhaseShielded) {
            this._eliminate(s, now, null);
            continue;
          }
        }

        // 2. Storm damage tick
        if (this.storm.active && this.storm.isOutside(head)) {
          if (now - this.storm.lastDmgTick > CFG.STORM_DAMAGE_MS) {
            if (!s.hasPowerup('GHOST') && !s.isPhaseShielded) {
              this._eliminate(s, now, null);
              this.storm.lastDmgTick = now;
              continue;
            }
          }
        }

        // 3. Snake vs snake combat collision (Point-to-segment distance for 100% gap-free cylinder detection)
        let collided = false;
        const sRadius = 0.72 * (s.scale || 1.0);

        for (let oIdx = 0; oIdx < this.snakes.length; oIdx++) {
          const other = this.snakes[oIdx];
          if (!other.alive || other === s) continue;
          const otherRadius = 0.72 * (other.scale || 1.0);
          const minColDistSq = (sRadius + otherRadius) * (sRadius + otherRadius);

          // Head-on collision evaluated FIRST!
          const oHead = other.headPos();
          const headDistSq = (head.x - oHead.x) * (head.x - oHead.x) + (head.z - oHead.z) * (head.z - oHead.z);
          if (headDistSq < minColDistSq * 1.1) {
            if (!s.hasPowerup('GHOST') && !other.hasPowerup('GHOST') && !s.isPhaseShielded && !other.isPhaseShielded) {
              if (s.length === other.length) {
                this._eliminate(s, now, other);
                this._eliminate(other, now, s);
                collided = true;
                break;
              } else {
                const shorter = s.length < other.length ? s : other;
                const victor  = s.length < other.length ? other : s;
                this._eliminate(shorter, now, victor);
                if (shorter === s) {
                  collided = true;
                  break;
                }
              }
            }
          }

          // vs other's body vertebrae (i >= 2 to strictly check body, avoiding false clash on segment 0-1)
          for (let i = 2; i < other.positions.length; i++) {
            const p1 = other.positions[i - 1];
            const p2 = other.positions[i];
            const segDistSq = distToSegmentSq(head.x, head.z, p1.x, p1.z, p2.x, p2.z);
            if (segDistSq < minColDistSq) {
              if (!s.hasPowerup('GHOST') && !s.isPhaseShielded) {
                this._eliminate(s, now, other);
                collided = true;
                break;
              }
            }
          }
          if (collided) break;
        }
      }

      // ── Food Ingestion & Magnetic Vacuum Pull ────────────────────
      const foods = this.items.foods;
      for (let fi = foods.length - 1; fi >= 0; fi--) {
        const f = foods[fi];
        const fPos = f.mesh.position;

        for (let sIdx = 0; sIdx < this.snakes.length; sIdx++) {
          const s = this.snakes[sIdx];
          if (!s.alive) continue;
          const head = s.headPos();
          const dx = head.x - fPos.x;
          const dz = head.z - fPos.z;
          const dist = Math.hypot(dx, dz);
          const vacRadius = s.hasPowerup('MAGNET') ? CFG.MAGNET_RADIUS : CFG.VACUUM_RADIUS;

          // Natural smooth magnetic vacuum glide into snake mouth
          if (dist < vacRadius && dist > 0.01) {
            const pullSpeed = (s.hasPowerup('MAGNET') ? 32.0 : (dist < 2.5 ? 24.0 : 14.0)) * dt;
            fPos.x += (dx / dist) * pullSpeed;
            fPos.z += (dz / dist) * pullSpeed;
          }

          const eatDist = (s.scale || 1.0) * 1.6;
          const sweptDistSq = distToSegmentSq(fPos.x, fPos.z, s._prevHeadX !== undefined ? s._prevHeadX : head.x, s._prevHeadZ !== undefined ? s._prevHeadZ : head.z, head.x, head.z);
          if (dist < eatDist || sweptDistSq < eatDist * eatDist) {
            const baseGain = f.isDeathPellet ? (f.value || 20) : 10;
            const scoreGain = s.hasPowerup('SCORE_2X') ? baseGain * 2 : baseGain;
            s.score += scoreGain;
            s.grow(f.isDeathPellet ? 2 : 1);
            s.scale = 1.0 + Math.log10(Math.max(1, s.length / 5)) * 0.22;

            this.particles.burst(fPos, f.mesh.material.color.getHex(), 12);
            if (s.isPlayer) {
              let popText = `+${scoreGain}`;
              let popColor = f.isDeathPellet ? 0xffd700 : 0x00ff88;

              // Rapid combo detection (< 700ms)
              if (now - this.lastEatTime < CFG.COMBO_WINDOW_MS) {
                this.eatComboCount++;
                if (this.eatComboCount >= 3) {
                  popText = `COMBO x${this.eatComboCount} (+${scoreGain * 2})`;
                  popColor = 0xff00ff;
                  s.score += scoreGain;
                }
              } else {
                this.eatComboCount = 1;
              }
              this.lastEatTime = now;
              this.popups.spawn(popText, fPos, popColor);
              this._fire('onFloatingPop', popText, fPos, popColor);

              this.audio.eat();
              this._fire('onScoreUpdate', s.score, this._playerRank());
              this._fire('onLengthUpdate', s.length);
            }

            this.items.removeFood(fi);
            if (foods.length < CFG.FOOD_COUNT) {
              this.items.spawnFood();
            }
            break;
          }
        }
      }

      // ── Power-up Pickups ────────────────────────────────────────
      const powerups = this.items.powerups;
      for (let pi = powerups.length - 1; pi >= 0; pi--) {
        const pu = powerups[pi];
        const puPos = pu.mesh.position;

        for (let sIdx = 0; sIdx < this.snakes.length; sIdx++) {
          const s = this.snakes[sIdx];
          if (!s.alive) continue;
          const head = s.headPos();
          const dist = Math.hypot(head.x - puPos.x, head.z - puPos.z);
          if (dist < (s.scale || 1.0) * 1.6) {
            s.activatePowerup(pu.type, now);
            this.particles.burst(puPos, this.items._puColors[pu.type], 25);

            if (s.isPlayer) {
              this.popups.spawn(pu.type.replace('_', ' '), puPos, this.items._puColors[pu.type]);
              this.audio.powerup();
              if (pu.type === 'LIGHTNING_BOOST') this.audio.boost();
              const remaining = s.powerups[pu.type] - now;
              this._fire('onPowerupActivated', pu.type, remaining);
            }

            this.items.removePowerup(pi);
            this.items.spawnPowerup();
            break;
          }
        }
      }

      // Check win condition
      this._checkWinCondition(now);
    }

    /* ── Backward-compatible Game Tick Wrapper ───────────────── */
    _gameTick(now) {
      this._updatePhysicsAndCollisions(now, 0.1);
    }

    /* ── Elimination & Kill-Streak Processing ────────────────── */
    _eliminate(snake, now, killer) {
      if (!snake.alive) return;
      const wasPlayer = snake.isPlayer;
      const snakeHead = snake.headPos();
      const savedPositions = snake.positions.map(p => ({ x: p.x, z: p.z }));

      snake.eliminate(this.particles);
      this._aliveCount--;
      this.audio.elimination();

      // Spawn glowing death burst nutrient pellets along the fallen serpent's corpse
      if (this.items && typeof this.items.spawnDeathPellets === 'function') {
        this.items.spawnDeathPellets(savedPositions, snake.color, savedPositions.length);
      }

      this._fire('onElimination', snake.id, wasPlayer);

      // If killer was player, process combat callouts & killstreak
      if (killer && killer.isPlayer) {
        this.playerKills++;
        this.killStreak++;
        this.lastKillTime = now;

        // Screen shake trauma punch!
        this.cameraTrauma = Math.min(1.0, this.cameraTrauma + 0.45);

        // Determine Kill-Streak Tier
        let streakTitle = 'FIRST BLOOD';
        let streakColor = 0xff0055;
        if (this.killStreak === 1) {
          streakTitle = 'FIRST BLOOD';
          streakColor = 0xff0055;
        } else if (this.killStreak === 2) {
          streakTitle = 'DOUBLE KILL!';
          streakColor = 0x00ffff;
        } else if (this.killStreak === 3) {
          streakTitle = 'TRIPLE KILL!';
          streakColor = 0xffff00;
        } else if (this.killStreak === 4) {
          streakTitle = 'RAMPAGE!!';
          streakColor = 0xff5500;
        } else {
          streakTitle = `APEX PREDATOR (${this.killStreak}x)!!`;
          streakColor = 0xff00ff;
        }

        // Floating pop announcement in 3D world
        this.popups.spawn(streakTitle, snakeHead, streakColor);
        this.audio.killStreakSting(this.killStreak);

        // Fire hook for HUD Callout Banner
        this._fire('onKillStreak', {
          title: streakTitle,
          streak: this.killStreak,
          totalKills: this.playerKills,
          killerId: killer.id,
          victimId: snake.id,
        });

        // Award kill score
        killer.score += 100 * this.killStreak;
        this._fire('onScoreUpdate', killer.score, this._playerRank());
      }

      if (wasPlayer) {
        this.cameraTrauma = 0.8;
        this.audio.stormAlarm();
        this._fire('onPlayerDeath', snake.score, this._playerRank());
        this._fire('onShowInterstitial');
      }
    }

    /* ── Win condition ───────────────────────────────────────── */
    _checkWinCondition(now) {
      const alive = this.snakes.filter(s => s.alive);
      if (alive.length === 1) {
        const winner = alive[0];
        this.audio.victory();
        this._fire('onVictory', winner.score, winner.isPlayer);
        this.paused = true;
      }
      if (alive.length === 0) {
        this._fire('onVictory', 0, false);
        this.paused = true;
      }
    }

    /* ── Dynamic Camera Auto-Zoom, Sprint FOV Warp & Shake ──── */
    _updateCamera(dt) {
      if (!this.player) return;
      const target = (this.player.alive && this.player.positions.length > 0)
        ? this.player.headPos()
        : ZERO_VEC;

      // Framerate-independent camera lerp
      const lerpAlpha = 1 - Math.exp(-14.0 * (dt || 0.016));
      this._camTarget.lerp(target, lerpAlpha);

      // 1. Logarithmic Altitude & Distance Scaling based on Mass / Length
      const playerLen = this.player.alive ? this.player.length : 5;
      const zoomFactor = 1.0 + Math.log10(Math.max(1, playerLen / 5)) * 0.82;

      // Dynamic Camera Aspect Ratio Adaptation:
      // On portrait / narrow screens (aspect < 1.0, e.g. phones with aspect 0.45-0.56 or iPads 0.75),
      // Three.js's vertical FOV narrows the horizontal view into a tight slit.
      // Scale camera altitude and distance so the horizontal arena playfield remains proportional and unclipped:
      const aspect = this.camera.aspect || 1.0;
      const aspectScale = aspect < 1.0 ? Math.max(1.0, 1.0 / Math.pow(aspect, 0.75)) : 1.0;

      const baseCamY = 28 * zoomFactor * aspectScale;
      const baseCamZ = 32 * zoomFactor * aspectScale;
      this._camOffset.set(0, baseCamY, baseCamZ);
      this._camDesired.copy(this._camTarget).add(this._camOffset);

      // Smooth camera position interpolation
      this._camPos.lerp(this._camDesired, lerpAlpha);
      this.camera.position.copy(this._camPos);

      // 2. Dynamic FOV Sprint Warp during Turbo Boost
      const isBoosting = this.player.alive && (this.player.isBoosting || this.player.speed > 1 || this.player.hasPowerup('LIGHTNING_BOOST'));
      const targetFov = isBoosting ? CFG.FOV_BOOST : CFG.FOV_NORMAL;
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov += (targetFov - this.camera.fov) * (dt * 6.0);
        this.camera.updateProjectionMatrix();
      }

      // 3. Camera Trauma / Screen Shake Decay
      if (this.cameraTrauma > 0) {
        const shake = this.cameraTrauma * this.cameraTrauma * 1.8;
        this.camera.position.x += (Math.random() * 2 - 1) * shake;
        this.camera.position.y += (Math.random() * 2 - 1) * shake;
        this.camera.position.z += (Math.random() * 2 - 1) * shake;
        this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
      }

      this.camera.lookAt(this._camTarget);
    }

    /* ── Input apply ─────────────────────────────────────────── */
    _applyInput() {
      if (!this.player || !this.player.alive || this._inputQueue.length === 0) return;
      while (this._inputQueue.length > 0) {
        const d = this._inputQueue.shift();
        this.player.nextDir.copy(d);
        if (this._inputVecPool.length < 8) {
          this._inputVecPool.push(d);
        }
      }
    }

    /* ── Rank helper ─────────────────────────────────────────── */
    _playerRank() {
      const sorted = [...this.snakes].sort((a, b) => b.score - a.score);
      return sorted.findIndex(s => s.isPlayer) + 1;
    }

    /* ── Event fire ──────────────────────────────────── */
    _fire(event, ...args) {
      if (typeof this.hooks[event] === 'function') {
        try { this.hooks[event](...args); } catch (e) { console.warn('[Engine hook error]', event, e); }
      }
    }

    /* ── Public control API ─────────────────────────────────── */
    pause()  { this.paused = true; }
    resume() { this.paused = false; }

    restart(playerColor) {
      for (const s of this.snakes) {
        if (s.alive) s.eliminate(null);
      }
      this.snakes = [];
      for (const f of this.items.foods) this.scene.remove(f.mesh);
      for (const p of this.items.powerups) this.scene.remove(p.mesh);
      this.items.foods    = [];
      this.items.powerups = [];
      this.items.fill();

      this.storm.radius = CFG.ARENA_SIZE * 1.42;
      this.storm.active = false;
      this.storm._refresh();
      this._stormActivated = false;
      this._aliveCount = CFG.NUM_AI + 1;

      // Reset combat streaks
      this.playerKills = 0;
      this.killStreak = 0;
      this.cameraTrauma = 0;

      this._spawnSnakes(playerColor || (this.player ? this.player.color : null));
      this.startTime  = performance.now();
      this._lastTick  = this.startTime;
      this._lastFrame = this.startTime;
      this.paused     = false;
      this.elapsed    = 0;
    }

    // Called on Player Revive with 3.5s Phase Shield
    revivePlayer() {
      const prevScore = this.player ? this.player.score : 0;
      const prevKills = this.playerKills;
      const prevColor = this.player ? this.player.color : SNAKE_COLORS[0];

      // Respawn player in a safe zone near center
      const angle = Math.random() * Math.PI * 2;
      const startPos = new this.THREE.Vector3(Math.cos(angle) * 12, 0.6, Math.sin(angle) * 12);
      const newSnake = new Snake(0, true, prevColor, startPos, this.scene, this.THREE, this);
      newSnake.score = Math.floor(prevScore * 0.5); // retain 50% score
      this.snakes[0] = newSnake;
      this.player = newSnake;
      this.playerKills = prevKills;
      this._aliveCount++;

      // Activate 3.5s Phase Shield Invulnerability!
      const now = performance.now();
      newSnake.activatePhaseShield(CFG.PHASE_SHIELD_DURATION, now);
      this.audio.phaseShieldHum();

      // Spawn floating announcement
      this.popups.spawn('PHASE SHIELD ACTIVE!', startPos, 0x00ffff);
      this.paused = false;
    }

    destroy() {
      this.running = false;
      if (this._animId) cancelAnimationFrame(this._animId);
      if (this._keyHandler)   global.removeEventListener('keydown', this._keyHandler);
      if (this._keyUpHandler) global.removeEventListener('keyup', this._keyUpHandler);
      if (this._onResize)     global.removeEventListener('resize', this._onResize);
      this.renderer.dispose();
    }
  }

  /* =========================================================
   *  EXPORT
   * ========================================================= */
  ApexSerpentEngine.CFG = CFG;
  ApexSerpentEngine.prototype.setBoost = ApexSerpentEngine.prototype.setPlayerBoost;
  global.ApexSerpentEngine = ApexSerpentEngine;

})(typeof window !== 'undefined' ? window : global);
