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
    NUM_AI:            9,           // AI snakes (player = 1 → total 10)
    FOOD_COUNT:        35,          // live food pellets
    POWERUP_COUNT:     8,           // live power-ups
    STORM_START_DELAY: 8000,        // ms before storm begins shrinking
    STORM_SHRINK_RATE: 0.012,       // arena fraction lost per second
    STORM_MIN_RADIUS:  10,          // smallest storm radius (units)
    STORM_DAMAGE_MS:   500,         // storm damage tick interval
    CAMERA_LERP:       0.08,        // camera follow smoothing
    PARTICLE_POOL:     600,
    BOOST_DURATION:    5000,
    MAGNET_RADIUS:     12,
    SHIELD_DURATION:   6000,
    GHOST_DURATION:    5000,
    SCORE_MULTI_DURATION: 7000,
    PHASE_SHIELD_DURATION: 3500,    // 3.5s revive invulnerability
    FOV_NORMAL:        60,
    FOV_BOOST:         68,
    COMBO_WINDOW_MS:   700,         // rapid eat combo timeout
  };

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
      let spawned = 0;
      for (let i = 0; i < this.pool.length && spawned < count; i++) {
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
      ctx.clearRect(0, 0, 256, 128);

      // Glow outline
      ctx.font = '900 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = colorStr;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(text, 128, 64);

      // Solid text
      ctx.fillStyle = colorStr;
      ctx.fillText(text, 128, 64);

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
      sprite.position.y += 1.2;
      sprite.position.x += (Math.random() - 0.5) * 0.8;
      sprite.position.z += (Math.random() - 0.5) * 0.8;
      sprite.scale.set(3.5, 1.75, 1.0);

      this.scene.add(sprite);
      this.activePops.push({
        sprite,
        life: 1.0,
        maxLife: 1.0,
        vy: 2.8,
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
          const sc = 2.5 + (progress / 0.25) * 1.5;
          p.sprite.scale.set(sc * 1.2, sc * 0.6, 1.0);
        }

        p.sprite.material.opacity = Math.max(0, p.life);

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
    constructor(id, isPlayer, color, startPos, scene, THREE) {
      this.THREE    = THREE;
      this.scene    = scene;
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

      // Active power-ups: map type -> expiry timestamp
      this.powerups = {};

      // Phase Shield Invulnerability (on revive)
      this.isPhaseShielded = false;
      this.phaseShieldExpiry = 0;
      this._phaseShieldMesh = null;

      // AI personality
      this.aiMode  = ['aggressive', 'defensive', 'opportunist', 'random'][Math.floor(Math.random() * 4)];
      this.aiTarget = null;

      // Visuals
      this._geo  = new THREE.BoxGeometry(1.1, 1.1, 1.1);
      this._mat  = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.6,
      });
      this._headMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.95,
        roughness: 0.1,
        metalness: 0.8,
      });

      // Visor Eyes (Cyber Visor)
      this._leftEye  = null;
      this._rightEye = null;

      // Seed segments
      for (let i = 0; i < this.length; i++) {
        const pos = new THREE.Vector3(
          startPos.x - i * CFG.GRID,
          startPos.y,
          startPos.z
        );
        this.positions.push(pos.clone());
        const mesh = new THREE.Mesh(this._geo, i === 0 ? this._headMat : this._mat);
        mesh.position.copy(pos);
        mesh.castShadow = true;
        scene.add(mesh);
        this.segments.push(mesh);
      }

      // Attach Cyber Visor Eyes to head segment
      this._attachVisorEyes();
    }

    // ── Cyber Visor Eyes ─────────────────────────────────────
    _attachVisorEyes() {
      const eyeGeo = new this.THREE.BoxGeometry(0.28, 0.22, 0.28);
      const eyeMat = new this.THREE.MeshStandardMaterial({
        color: this.isPlayer ? 0x00ffff : 0xff2200,
        emissive: this.isPlayer ? 0x00ffff : 0xff3300,
        emissiveIntensity: 2.2,
        roughness: 0.1,
        metalness: 0.9,
      });

      this._leftEye  = new this.THREE.Mesh(eyeGeo, eyeMat);
      this._rightEye = new this.THREE.Mesh(eyeGeo, eyeMat);

      // Position on front edges of head segment
      this._leftEye.position.set(0.45, 0.2, 0.45);
      this._rightEye.position.set(0.45, 0.2, -0.45);

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
      const targetIntensity = boosting ? 4.0 : 2.2;

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
          emissiveIntensity: 1.5,
          transparent: true,
          opacity: 0.42,
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
      if (type === 'LIGHTNING_BOOST') this.speed = 2;
    }

    tickPowerups(now) {
      for (const type of Object.keys(this.powerups)) {
        if (now >= this.powerups[type]) {
          delete this.powerups[type];
          if (type === 'LIGHTNING_BOOST') this.speed = 1;
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
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.segments.push(mesh);
        this.length++;
      }
    }

    // ── Movement step ───────────────────────────────────────
    step() {
      if (!this.alive) return;
      this.dir.copy(this.nextDir);
      const newHead = this.positions[0].clone().addScaledVector(this.dir, CFG.GRID);
      this.positions.unshift(newHead);
      this.positions.pop();
      for (let i = 0; i < this.segments.length; i++) {
        this.segments[i].position.copy(this.positions[i]);
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
   *  AI DIRECTOR
   * ========================================================= */
  class AIDirector {
    constructor(THREE) { this.THREE = THREE; }

    steer(snake, foods, powerups, stormCenter, stormRadius, allSnakes, now) {
      if (!snake.alive || snake.isPlayer) return;

      const head = snake.headPos();
      const directions = [
        new this.THREE.Vector3(1, 0, 0),
        new this.THREE.Vector3(-1, 0, 0),
        new this.THREE.Vector3(0, 0, 1),
        new this.THREE.Vector3(0, 0, -1),
      ];

      // Filter out 180° reverse
      const valid = directions.filter(d => {
        const dot = d.dot(snake.dir);
        return dot >= 0; // no 180
      });

      let best = null;
      let bestScore = -Infinity;

      for (const d of valid) {
        const next = head.clone().addScaledVector(d, CFG.GRID);
        let score = 0;

        // Stay inside storm
        const distToStormCenter = next.distanceTo(stormCenter);
        if (distToStormCenter > stormRadius) score -= 1000;
        else score += (stormRadius - distToStormCenter) * 0.5;

        // Stay inside arena
        const A = CFG.ARENA_SIZE;
        if (Math.abs(next.x) > A || Math.abs(next.z) > A) score -= 2000;

        // Avoid own body
        for (let i = 1; i < snake.positions.length; i++) {
          if (next.distanceTo(snake.positions[i]) < CFG.GRID * 0.9) score -= 500;
        }

        // Mode-based scoring
        if (snake.aiMode === 'aggressive') {
          // Chase nearest other snake's head
          for (const other of allSnakes) {
            if (other === snake || !other.alive || other.isPlayer) continue;
            const d2 = next.distanceTo(other.headPos());
            score -= d2 * 0.3;
          }
        }

        if (snake.aiMode === 'opportunist' || snake.aiMode === 'aggressive') {
          // Seek food
          for (const f of foods) {
            const d2 = next.distanceTo(f.mesh.position);
            score += (50 - d2) * 0.4;
          }
          // Seek power-ups
          for (const p of powerups) {
            const d2 = next.distanceTo(p.mesh.position);
            score += (30 - d2) * 0.3;
          }
        }

        if (snake.aiMode === 'defensive') {
          // Avoid other snakes' heads
          for (const other of allSnakes) {
            if (other === snake || !other.alive) continue;
            const d2 = next.distanceTo(other.headPos());
            if (d2 < 10) score -= (10 - d2) * 15;
          }
          // Still want food
          for (const f of foods) {
            const d2 = next.distanceTo(f.mesh.position);
            score += (40 - d2) * 0.2;
          }
        }

        if (snake.aiMode === 'random') {
          score += Math.random() * 100;
        }

        if (score > bestScore) { bestScore = score; best = d; }
      }

      if (best) snake.nextDir.copy(best);
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
        emissiveIntensity: 1.5,
        roughness: 0.1,
        metalness: 0.1,
      });
      const mesh = new this.THREE.Mesh(geo, mat);
      mesh.position.copy(this._rndPos());
      // Glow halo
      const haloGeo = new this.THREE.SphereGeometry(0.75, 8, 8);
      const haloMat = new this.THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: this.THREE.BackSide });
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
        emissiveIntensity: 2,
        roughness: 0.05,
        metalness: 0.9,
      });
      const mesh = new this.THREE.Mesh(geo, mat);
      mesh.position.copy(this._rndPos());
      // Ring
      const ringGeo = new this.THREE.TorusGeometry(1.0, 0.07, 8, 32);
      const ringMat = new this.THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const ring = new this.THREE.Mesh(ringGeo, ringMat);
      mesh.add(ring);
      this.scene.add(mesh);
      this.powerups.push({ mesh, ring, type, t: Math.random() * Math.PI * 2 });
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
        f.mesh.material.emissiveIntensity = 1.2 + Math.sin(f.t * 1.5) * 0.5;
        f.halo.material.opacity = 0.15 + Math.sin(f.t * 2) * 0.1;
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
        color: 0x4400ff,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
        wireframe: false,
      });
      this.wall = new THREE.Mesh(geo, mat);
      this.wall.position.y = 0;
      scene.add(this.wall);

      // Lightning arc ring
      const ringGeo = new THREE.TorusGeometry(this.radius, 0.3, 4, 128);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x8800ff, transparent: true, opacity: 0.7 });
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
      const flicker = 0.14 + Math.sin(elapsed * 7) * 0.06 + Math.sin(elapsed * 13) * 0.03;
      this.wall.material.opacity = this.active ? flicker : 0;
      this.ring.material.opacity = this.active ? (0.6 + Math.sin(elapsed * 10) * 0.3) : 0;
      this.wall.material.color.setHSL(0.72 + Math.sin(elapsed * 3) * 0.05, 1, 0.5);
    }
  }

  /* =========================================================
   *  ARENA BUILDER
   * ========================================================= */
  function buildArena(scene, THREE) {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(CFG.ARENA_SIZE * 2, CFG.ARENA_SIZE * 2, 40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x050520,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid lines
    const gridHelper = new THREE.GridHelper(CFG.ARENA_SIZE * 2, 40, 0x111144, 0x111144);
    scene.add(gridHelper);

    // Walls (4 neon border lines)
    const wallColor = 0x0088ff;
    const A = CFG.ARENA_SIZE;
    const corners = [
      [[-A, 0, -A], [A, 0, -A]],
      [[A, 0, -A],  [A, 0, A]],
      [[A, 0, A],   [-A, 0, A]],
      [[-A, 0, A],  [-A, 0, -A]],
    ];
    for (const [from, to] of corners) {
      const pts = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: wallColor, linewidth: 2 });
      const line = new THREE.Line(geo, mat);
      line.position.y = 0.05;
      scene.add(line);
    }

    // Ambient + directional lights
    scene.add(new THREE.AmbientLight(0x111133, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    scene.add(sun);

    // Neon point lights (4 corners)
    const ptColors = [0xff00ff, 0x00ffff, 0xffff00, 0xff4400];
    for (let i = 0; i < 4; i++) {
      const pt = new THREE.PointLight(ptColors[i], 2, 60);
      const ang = (i / 4) * Math.PI * 2;
      pt.position.set(Math.cos(ang) * A * 0.9, 10, Math.sin(ang) * A * 0.9);
      scene.add(pt);
    }
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
      };

      // Player direction input queue
      this._inputQueue = [];
    }

    /* ── init ───────────────────────────────────────────────── */
    async init(canvas) {
      if (!global.THREE) {
        await this._loadThree();
      }
      this.THREE = global.THREE;

      // Renderer
      this.renderer = new this.THREE.WebGLRenderer({ canvas, antialias: true });
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      this.renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type    = this.THREE.PCFSoftShadowMap;
      this.renderer.toneMapping       = this.THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.25;

      // Scene
      this.scene = new this.THREE.Scene();
      this.scene.background = new this.THREE.Color(0x020210);
      this.scene.fog         = new this.THREE.FogExp2(0x020210, 0.012);

      // Camera with Dynamic FOV
      this.camera = new this.THREE.PerspectiveCamera(CFG.FOV_NORMAL, (canvas.clientWidth || 800) / (canvas.clientHeight || 600), 0.1, 500);
      this.camera.position.set(0, 35, 40);
      this.camera.lookAt(0, 0, 0);
      this._camTarget = new this.THREE.Vector3(0, 0, 0);
      this._camPos    = new this.THREE.Vector3(0, 35, 40);

      // Build arena world
      buildArena(this.scene, this.THREE);

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
        const w = canvas.clientWidth, h = canvas.clientHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      };
      global.addEventListener('resize', this._onResize);

      this.running   = true;
      this.startTime = performance.now();
      this._lastTick = this.startTime;
      this._lastFrame = this.startTime;

      this._fire('onGameReady');
      this._loop();
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
        emissiveIntensity: 0.6,
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
    _spawnSnakes() {
      for (let i = 0; i <= CFG.NUM_AI; i++) {
        const angle  = (i / (CFG.NUM_AI + 1)) * Math.PI * 2;
        const radius = 20 + Math.random() * 15;
        const startPos = new this.THREE.Vector3(
          Math.cos(angle) * radius,
          0.6,
          Math.sin(angle) * radius
        );
        const snake = new Snake(i, i === 0, SNAKE_COLORS[i], startPos, this.scene, this.THREE);
        if (i > 0) {
          const dirs = [
            new this.THREE.Vector3(1, 0, 0),
            new this.THREE.Vector3(-1, 0, 0),
            new this.THREE.Vector3(0, 0, 1),
            new this.THREE.Vector3(0, 0, -1),
          ];
          const d = dirs[Math.floor(Math.random() * 4)];
          snake.dir.copy(d);
          snake.nextDir.copy(d);
        }
        this.snakes.push(snake);
      }
      this.player = this.snakes[0];
    }

    /* ── Keyboard & Input Handling ──────────────────────────── */
    _bindInput() {
      this._keyHandler = (e) => {
        const dirMap = {
          ArrowUp:    new this.THREE.Vector3(0, 0, -1),
          ArrowDown:  new this.THREE.Vector3(0, 0, 1),
          ArrowLeft:  new this.THREE.Vector3(-1, 0, 0),
          ArrowRight: new this.THREE.Vector3(1, 0, 0),
          KeyW:       new this.THREE.Vector3(0, 0, -1),
          KeyS:       new this.THREE.Vector3(0, 0, 1),
          KeyA:       new this.THREE.Vector3(-1, 0, 0),
          KeyD:       new this.THREE.Vector3(1, 0, 0),
        };
        if (dirMap[e.code]) {
          e.preventDefault();
          this._inputQueue.push(dirMap[e.code]);
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

    setPlayerDirection(dx, dz) {
      if (!this.player || !this.player.alive) return;
      const d = new this.THREE.Vector3(dx, 0, dz).normalize();
      if (d.dot(this.player.dir) >= 0) {
        this._inputQueue.push(d);
      }
    }

    setPlayerBoost(boosting) {
      if (!this.player || !this.player.alive) return;
      this.player.isBoosting = boosting;
      if (boosting) {
        this.player.speed = 2;
        this.audio.boost();
      } else if (!this.player.hasPowerup('LIGHTNING_BOOST')) {
        this.player.speed = 1;
      }
    }

    /* ── Main Animation Loop ────────────────────────────────── */
    _loop() {
      this._animId = requestAnimationFrame(() => this._loop());
      if (!this.running || this.paused) return;

      const now = performance.now();
      const dt  = Math.min((now - this._lastFrame) / 1000, 0.1);
      this._lastFrame = now;
      this.elapsed = (now - this.startTime) / 1000;

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
      for (const s of this.snakes) {
        if (s.alive) s.tickPowerups(now);
      }

      // Phase shield telemetry hook for player
      if (this.player && this.player.alive) {
        const isShielded = this.player.isPhaseShielded;
        const remMs = isShielded ? Math.max(0, this.player.phaseShieldExpiry - now) : 0;
        this._fire('onPhaseShield', isShielded, remMs);
      }

      // Snake movement tick
      const tickInterval = CFG.TICK_MS / (this.player.alive ? this.player.speed : 1);
      if (now - this._lastTick >= tickInterval) {
        this._lastTick = now;
        this._gameTick(now);
      }

      // Apply queued player input
      this._applyInput();

      // AI steering
      for (const s of this.snakes) {
        if (!s.isPlayer && s.alive) {
          this.ai.steer(s, this.items.foods, this.items.powerups, this.storm.center, this.storm.radius, this.snakes, now);
        }
      }

      // Magnet pull
      if (this.player.alive && this.player.hasPowerup('MAGNET')) {
        for (const f of this.items.foods) {
          const toPlayer = this.player.headPos().clone().sub(f.mesh.position);
          if (toPlayer.length() < CFG.MAGNET_RADIUS) {
            toPlayer.normalize().multiplyScalar(dt * 8);
            f.mesh.position.add(toPlayer);
          }
        }
      }

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
          distanceToPlayer: dist,
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

    /* ── Game tick (discrete snake steps) ───────────────────── */
    _gameTick(now) {
      for (const s of this.snakes) {
        if (s.alive) s.step();
      }

      // Collisions & pickups
      for (const s of this.snakes) {
        if (!s.alive) continue;
        const head = s.headPos();

        // ── Wall collision ──────────────────────────────────
        const A = CFG.ARENA_SIZE;
        if (Math.abs(head.x) > A || Math.abs(head.z) > A) {
          if (!s.hasPowerup('GHOST') && !s.isPhaseShielded) {
            this._eliminate(s, now, null);
          }
          continue;
        }

        // ── Storm damage ────────────────────────────────────
        if (this.storm.active && this.storm.isOutside(head)) {
          if (now - this.storm.lastDmgTick > CFG.STORM_DAMAGE_MS) {
            if (!s.hasPowerup('GHOST') && !s.isPhaseShielded) {
              this._eliminate(s, now, null);
              this.storm.lastDmgTick = now;
              continue;
            }
          }
        }

        // ── Snake vs snake collision ────────────────────────
        let collided = false;
        for (const other of this.snakes) {
          if (!other.alive || other === s) continue;
          // vs other's body
          for (let i = 1; i < other.positions.length; i++) {
            if (head.distanceTo(other.positions[i]) < CFG.GRID * 0.8) {
              if (!s.hasPowerup('GHOST') && !s.isPhaseShielded) {
                this._eliminate(s, now, other);
                collided = true;
                break;
              }
            }
          }
          if (collided) break;

          // Head-on collision
          if (head.distanceTo(other.headPos()) < CFG.GRID * 0.8) {
            if (!s.hasPowerup('GHOST') && !other.hasPowerup('GHOST') && !s.isPhaseShielded && !other.isPhaseShielded) {
              const shorter = s.length <= other.length ? s : other;
              const victor  = s.length <= other.length ? other : s;
              this._eliminate(shorter, now, victor);
              collided = true;
              break;
            }
          }
        }
        if (collided) continue;

        // ── Self collision ─────────────────────────────────
        for (let i = 2; i < s.positions.length; i++) {
          if (head.distanceTo(s.positions[i]) < CFG.GRID * 0.7) {
            if (!s.hasPowerup('GHOST') && !s.isPhaseShielded) {
              this._eliminate(s, now, null);
              break;
            }
          }
        }
        if (!s.alive) continue;

        // ── Food pickup & Floating Popups ───────────────────
        for (let fi = this.items.foods.length - 1; fi >= 0; fi--) {
          const f = this.items.foods[fi];
          if (head.distanceTo(f.mesh.position) < CFG.GRID * 1.1) {
            const scoreGain = s.hasPowerup('SCORE_2X') ? 20 : 10;
            s.score += scoreGain;
            s.grow(1);
            this.particles.burst(f.mesh.position.clone(), f.mesh.material.color.getHex(), 15);

            // Floating Pop Number
            let popText = `+${scoreGain}`;
            let popColor = s.isPlayer ? 0x00ff88 : 0xffaa00;

            if (s.isPlayer) {
              // Rapid combo detection (< 700ms)
              if (now - this.lastEatTime < CFG.COMBO_WINDOW_MS) {
                this.eatComboCount++;
                if (this.eatComboCount >= 3) {
                  popText = `COMBO x${this.eatComboCount} (+${scoreGain * 2})`;
                  popColor = 0xff00ff;
                  s.score += scoreGain; // bonus combo points
                }
              } else {
                this.eatComboCount = 1;
              }
              this.lastEatTime = now;
              this.popups.spawn(popText, f.mesh.position, popColor);
              this._fire('onFloatingPop', popText, f.mesh.position, popColor);

              this.audio.eat();
              this._fire('onScoreUpdate', s.score, this._playerRank());
              this._fire('onLengthUpdate', s.length);
            }

            this.items.removeFood(fi);
            this.items.spawnFood();
            break;
          }
        }

        // ── Power-up pickup ────────────────────────────────
        for (let pi = this.items.powerups.length - 1; pi >= 0; pi--) {
          const pu = this.items.powerups[pi];
          if (head.distanceTo(pu.mesh.position) < CFG.GRID * 1.3) {
            s.activatePowerup(pu.type, now);
            this.particles.burst(pu.mesh.position.clone(), this.items._puColors[pu.type], 25);

            if (s.isPlayer) {
              this.popups.spawn(pu.type.replace('_', ' '), pu.mesh.position, this.items._puColors[pu.type]);
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

    /* ── Elimination & Kill-Streak Processing ────────────────── */
    _eliminate(snake, now, killer) {
      if (!snake.alive) return;
      const wasPlayer = snake.isPlayer;
      const snakeHead = snake.headPos().clone();
      snake.eliminate(this.particles);
      this._aliveCount--;
      this.audio.elimination();
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
      const target = this.player.alive
        ? this.player.headPos()
        : new this.THREE.Vector3(0, 0, 0);

      this._camTarget.lerp(target, CFG.CAMERA_LERP);

      // 1. Logarithmic Altitude & Distance Scaling based on Mass / Length
      const playerLen = this.player.alive ? this.player.length : 5;
      const zoomFactor = 1.0 + Math.log10(Math.max(1, playerLen / 5)) * 0.82;

      const baseCamY = 28 * zoomFactor;
      const baseCamZ = 32 * zoomFactor;
      const camOffset = new this.THREE.Vector3(0, baseCamY, baseCamZ);
      const desired   = this._camTarget.clone().add(camOffset);

      // Smooth camera position interpolation
      this._camPos.lerp(desired, CFG.CAMERA_LERP);
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
      if (!this.player.alive || this._inputQueue.length === 0) return;
      const d = this._inputQueue.shift();
      if (d.dot(this.player.dir) < 0) return;
      this.player.nextDir.copy(d);
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

    restart() {
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

      this._spawnSnakes();
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

      // Respawn player in a safe zone near center
      const angle = Math.random() * Math.PI * 2;
      const startPos = new this.THREE.Vector3(Math.cos(angle) * 12, 0.6, Math.sin(angle) * 12);
      const newSnake = new Snake(0, true, SNAKE_COLORS[0], startPos, this.scene, this.THREE);
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
  global.ApexSerpentEngine = ApexSerpentEngine;

})(typeof window !== 'undefined' ? window : global);
