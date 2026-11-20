/**
 * GameEngine.js  — @game_dev owns
 * Three.js scene orchestrator: renderer, camera, game-loop, AI, particle system.
 * Coordinates ArenaManager, SnakeEntity, CollisionSystem, PowerupManager, AudioManager.
 * Publishes all EVENTS via EventBus.
 *
 * ARCHITECTURE §4, §5
 *
 * Usage:
 *   import { GameEngine } from './engine/GameEngine.js';
 *   const engine = new GameEngine();
 *   await engine.init(canvasElement);
 */

import * as THREE from 'three';
import EventBus from '../utils/EventBus.js';
import { GAME_CONSTANTS, POWERUP_TYPES, EVENTS } from '../utils/Constants.js';
import { lerp, clamp } from '../utils/MathUtils.js';
import { ArenaManager }   from './ArenaManager.js';
import { SnakeEntity }    from './SnakeEntity.js';
import { CollisionSystem } from './CollisionSystem.js';
import { PowerupManager }  from './PowerupManager.js';
import AudioManager        from './AudioManager.js';

// ── Particle System (self-contained) ────────────────────────
class ParticleSystem {
  constructor(scene) {
    this.scene  = scene;
    this._pool  = [];
    const geo   = new THREE.SphereGeometry(0.14, 4, 4);
    for (let i = 0; i < 700; i++) {
      const mat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this._pool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
  }

  burst(position, color, count = 18) {
    let spawned = 0;
    for (const p of this._pool) {
      if (spawned >= count) break;
      if (p.life > 0) continue;
      p.mesh.material.color.set(color);
      p.mesh.position.copy(position);
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI;
      const spd   = 2.5 + Math.random() * 5;
      p.vel.set(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.abs(Math.cos(phi)) * spd * 1.3,
        Math.sin(phi) * Math.sin(theta) * spd
      );
      p.maxLife = 0.35 + Math.random() * 0.45;
      p.life    = p.maxLife;
      p.mesh.visible = true;
      spawned++;
    }
  }

  update(dt) {
    for (const p of this._pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 8 * dt;    // gravity
      p.mesh.material.opacity = p.life / p.maxLife;
      const scale = 0.5 + (p.life / p.maxLife) * 0.5;
      p.mesh.scale.setScalar(scale);
    }
  }
}

// ── AI Director ──────────────────────────────────────────────
class AIDirector {
  constructor() {
    this._dirs = [
      new THREE.Vector3( 1, 0,  0),
      new THREE.Vector3(-1, 0,  0),
      new THREE.Vector3( 0, 0,  1),
      new THREE.Vector3( 0, 0, -1),
    ];
  }

  steer(snake, foods, powerups, stormCenter, stormRadius) {
    if (!snake.alive || snake.isPlayer) return;

    const head  = snake.headPos();
    const valid = this._dirs.filter(d => d.dot(snake.dir) >= 0);
    let   best  = null;
    let   bestScore = -Infinity;

    for (const d of valid) {
      const next = head.clone().addScaledVector(d, GAME_CONSTANTS.SEGMENT_SPACING);
      let score = 0;

      // Stay in arena
      const A = GAME_CONSTANTS.ARENA_SIZE / 2 - 1;
      if (Math.abs(next.x) > A || Math.abs(next.z) > A) { score -= 3000; }

      // Stay in storm zone
      if (stormRadius > 0) {
        const distToCenter = next.distanceTo(stormCenter);
        if (distToCenter > stormRadius) score -= 2000;
        else score += (stormRadius - distToCenter) * 0.4;
      }

      // Avoid own body (simple)
      for (let i = 2; i < Math.min(snake.positions.length, 12); i++) {
        const sp  = snake.positions[i];
        const ds2 = (next.x - sp.x) ** 2 + (next.z - sp.z) ** 2;
        const minD = GAME_CONSTANTS.SEGMENT_SPACING * 0.8;
        if (ds2 < minD * minD) score -= 400;
      }

      // Mode-based scoring
      switch (snake.aiMode) {
        case 'aggressive':
          // Seek foods + head-hunt
          for (const f of foods) {
            const d2 = (next.x - f.mesh.position.x) ** 2 + (next.z - f.mesh.position.z) ** 2;
            score += clamp(80 - Math.sqrt(d2), 0, 80) * 0.6;
          }
          break;
        case 'defensive':
          // Food but retreat from danger
          for (const f of foods) {
            const d2 = (next.x - f.mesh.position.x) ** 2 + (next.z - f.mesh.position.z) ** 2;
            score += clamp(60 - Math.sqrt(d2), 0, 60) * 0.3;
          }
          break;
        case 'opportunist':
          // Food + power-ups
          for (const f of foods) {
            const d2 = (next.x - f.mesh.position.x) ** 2 + (next.z - f.mesh.position.z) ** 2;
            score += clamp(70 - Math.sqrt(d2), 0, 70) * 0.5;
          }
          for (const p of powerups) {
            const d2 = (next.x - p.mesh.position.x) ** 2 + (next.z - p.mesh.position.z) ** 2;
            score += clamp(50 - Math.sqrt(d2), 0, 50) * 0.5;
          }
          break;
        case 'random':
          score += Math.random() * 120;
          break;
        case 'patrol':
          // Circular patrol
          score += Math.sin(next.x * 0.05 + next.z * 0.05) * 30;
          break;
      }

      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (best) snake.nextDir.copy(best);
  }
}

// ── Snake colour palette ─────────────────────────────────────
const SNAKE_COLORS = [
  0x00ff88, // player  — neon emerald
  0xff2255, // AI 1   — hot pink
  0xffaa00, // AI 2   — amber
  0x00aaff, // AI 3   — sky blue
  0xff00ff, // AI 4   — magenta
  0xffff00, // AI 5   — yellow
  0xff5500, // AI 6   — orange
  0x00ffff, // AI 7   — cyan
  0xaa00ff, // AI 8   — violet
  0xff0066, // AI 9   — crimson
];

const AI_MODES = ['aggressive', 'defensive', 'opportunist', 'random', 'patrol'];

// ── Tick rate ────────────────────────────────────────────────
const LOCAL_TICK_MS = 1000 / GAME_CONSTANTS.TICK_RATE; // 50ms @ 20 TPS

// ── GameEngine ───────────────────────────────────────────────
export class GameEngine {
  constructor() {
    // Three.js
    this.renderer  = null;
    this.scene     = null;
    this.camera    = null;
    this.canvas    = null;

    // Sub-systems
    this.arena     = null;
    this.collision = null;
    this.items     = null;
    this.particles = null;
    this.ai        = null;

    // Snakes
    this.snakes    = [];
    this.player    = null;

    // State
    this.running   = false;
    this.paused    = false;
    this.elapsed   = 0;
    this._startTs  = 0;
    this._lastFrame = 0;
    this._tickAccum = 0;
    this._animId   = null;
    this._aliveCount = 0;

    // Camera target smoothing
    this._camTarget = null;
    this._camPos    = null;
    this._camLookAt = null;

    // Input
    this._inputQueue = [];
    this._keyHandler = null;
    this._resizeHandler = null;

    // Network mode flag (set by StateSync when server-driven)
    this.networkMode = false;
  }

  /* ══════════════════════════════════════════════════════════
   * INIT
   * ══════════════════════════════════════════════════════════ */
  async init(canvas) {
    this.canvas = canvas;

    // ── Renderer ───────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace   = THREE.SRGBColorSpace;

    // ── Scene ──────────────────────────────────────────────
    this.scene = new THREE.Scene();

    // ── Camera ─────────────────────────────────────────────
    const aspect  = (canvas.clientWidth || 800) / (canvas.clientHeight || 600);
    this.camera   = new THREE.PerspectiveCamera(55, aspect, 0.1, 1200);
    this.camera.position.set(0, 40, 50);
    this.camera.lookAt(0, 0, 0);
    this._camTarget = new THREE.Vector3(0, 0, 0);
    this._camPos    = new THREE.Vector3(0, 40, 50);
    this._camLookAt = new THREE.Vector3(0, 0, 0);

    // ── Sub-systems ────────────────────────────────────────
    this.arena     = new ArenaManager(this.scene);
    this.collision = new CollisionSystem();
    this.items     = new PowerupManager(this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.ai        = new AIDirector();
    AudioManager.init();

    // Fill foods + powerups
    this.items.fill();

    // ── Spawn snakes ───────────────────────────────────────
    this._spawnSnakes();

    // ── Input ──────────────────────────────────────────────
    this._bindInput();

    // ── Resize ─────────────────────────────────────────────
    this._resizeHandler = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._resizeHandler);

    // ── Start ──────────────────────────────────────────────
    this.running    = true;
    this._startTs   = performance.now();
    this._lastFrame = this._startTs;
    EventBus.emit(EVENTS.GAME_START, { playerCount: this.snakes.length });
    this._loop();
  }

  /* ══════════════════════════════════════════════════════════
   * SNAKE SPAWNING
   * ══════════════════════════════════════════════════════════ */
  _spawnSnakes() {
    const total = GAME_CONSTANTS.MAX_BOTS + 1; // 1 player + 20 bots by default; cap at 10 for local
    const spawnCount = Math.min(10, total);
    for (let i = 0; i < spawnCount; i++) {
      const angle  = (i / spawnCount) * Math.PI * 2;
      const radius = 25 + Math.random() * 20;
      const startPos = new THREE.Vector3(
        Math.cos(angle) * radius, 0, Math.sin(angle) * radius
      );
      const snake = new SnakeEntity({
        id:            i,
        isPlayer:      i === 0,
        color:         SNAKE_COLORS[i] ?? SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)],
        startPos,
        scene:         this.scene,
        initialLength: 5,
      });

      if (i > 0) {
        // Assign AI mode
        snake.aiMode = AI_MODES[Math.floor(Math.random() * AI_MODES.length)];
        // Random starting direction
        const dirs = [
          new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
          new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
        ];
        const d = dirs[Math.floor(Math.random() * 4)];
        snake.dir.copy(d); snake.nextDir.copy(d);
      }

      this.snakes.push(snake);
    }
    this.player       = this.snakes[0];
    this._aliveCount  = this.snakes.length;
  }

  /* ══════════════════════════════════════════════════════════
   * MAIN RENDER LOOP
   * ══════════════════════════════════════════════════════════ */
  _loop() {
    this._animId = requestAnimationFrame(() => this._loop());
    if (!this.running || this.paused) return;

    const now = performance.now();
    const dt  = Math.min((now - this._lastFrame) / 1000, 0.1);
    this._lastFrame = now;
    this.elapsed    = (now - this._startTs) / 1000;

    // Arena (storm update)
    this.arena.update(dt, this.elapsed);

    // Animate items
    this.items.animate(this.elapsed);

    // Tick power-ups for all snakes
    for (const s of this.snakes) {
      if (s.alive) {
        s.tickPowerups(now);
        s.animate(this.elapsed);
        s.updateGhostFlicker(this.elapsed);
      }
    }

    // AI steering (every frame — cheap enough)
    if (!this.networkMode) {
      const { stormCenter, stormRadius } = this.arena.stormState().active
        ? this.arena.stormState()
        : { stormCenter: new THREE.Vector3(), stormRadius: 9999 };
      for (const s of this.snakes) {
        if (!s.isPlayer && s.alive) {
          this.ai.steer(s, this.items.foods, this.items.powerups, stormCenter, stormRadius);
        }
      }
    }

    // Magnet pull
    if (this.player.alive && this.player.hasPowerup(POWERUP_TYPES.MAGNET)) {
      this.items.magnetPull(this.player.headPos(), dt);
    }

    // Discrete game tick accumulator
    this._tickAccum += dt * 1000;
    while (this._tickAccum >= LOCAL_TICK_MS) {
      this._tickAccum -= LOCAL_TICK_MS;
      this._gameTick(now);
    }

    // Apply queued player input
    this._applyInput();

    // Particles
    this.particles.update(dt);

    // Camera
    this._updateCamera(dt);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  /* ══════════════════════════════════════════════════════════
   * DISCRETE GAME TICK
   * ══════════════════════════════════════════════════════════ */
  _gameTick(now) {
    if (!this.running) return;

    // Step all snakes
    if (!this.networkMode) {
      for (const s of this.snakes) {
        if (s.alive) s.step();
      }
    }

    // Rebuild spatial grid
    this.collision.rebuild(this.snakes);

    // Check collisions
    const { toEliminateIds, foodsToRemove, powerupsToRemove } =
      this.collision.check(
        this.snakes, this.items.foods, this.items.powerups,
        this.arena, this.particles, now
      );

    // Eliminate snakes
    for (const id of toEliminateIds) {
      const s = this.snakes.find(s => s.id === id);
      if (!s || !s.alive) continue;
      const wasPlayer = s.isPlayer;
      s.eliminate(this.particles);
      this._aliveCount--;
      AudioManager.elimination(wasPlayer);
      if (wasPlayer) {
        EventBus.emit(EVENTS.GAME_OVER, {
          winner: false,
          score:  s.score,
          rank:   this._playerRank(),
        });
      }
    }

    // Remove eaten foods (reverse order to preserve indices)
    const sortedFoods = [...new Set(foodsToRemove)].sort((a, b) => b - a);
    for (const fi of sortedFoods) {
      const s = this.snakes.find(s => s.alive && !toEliminateIds.has(s.id));
      // Credit food score to nearest alive snake (already emitted via EventBus)
      this.items.removeFood(fi);
      this.items.spawnFood();
    }

    // Credit grow + score for food events (listening from snakes via EventBus)
    // This is handled in EventBus subscription below in init
    // For direct local mode — credit to snake that picked up:
    for (const fi of foodsToRemove) {
      // find the snake that picked up (already emitted in CollisionSystem)
    }

    // Remove collected powerups
    const sortedPUs = [...new Set(powerupsToRemove)].sort((a, b) => b - a);
    for (const pi of sortedPUs) {
      this.items.removePowerup(pi);
      this.items.spawnPowerup();
    }

    // Handle food grow in local mode (direct event subscription)
    // CollisionSystem already emitted FOOD_COLLECT with { snake }
    // We subscribe once in init() to call snake.grow()

    // Win condition
    const alive = this.snakes.filter(s => s.alive);
    if (alive.length <= 1) {
      const winner = alive[0] ?? null;
      AudioManager.victory();
      EventBus.emit(EVENTS.GAME_OVER, {
        winner: true,
        isPlayer: winner?.isPlayer ?? false,
        score:    winner?.score ?? 0,
      });
      this.paused = true;
    }
  }

  /* ══════════════════════════════════════════════════════════
   * CAMERA
   * ══════════════════════════════════════════════════════════ */
  _updateCamera(dt) {
    const target = this.player?.alive
      ? this.player.headPos()
      : new THREE.Vector3(0, 0, 0);

    // Smooth follow
    const LERP = 0.09;
    this._camTarget.lerp(target, LERP);

    const offset  = new THREE.Vector3(0, 36, 44);
    const desired = this._camTarget.clone().add(offset);
    this._camPos.lerp(desired, LERP);

    this.camera.position.copy(this._camPos);
    this._camLookAt.lerp(this._camTarget, LERP * 1.5);
    this.camera.lookAt(this._camLookAt);
  }

  /* ══════════════════════════════════════════════════════════
   * INPUT
   * ══════════════════════════════════════════════════════════ */
  _bindInput() {
    const dirMap = {
      ArrowUp:    new THREE.Vector3( 0, 0, -1),
      ArrowDown:  new THREE.Vector3( 0, 0,  1),
      ArrowLeft:  new THREE.Vector3(-1, 0,  0),
      ArrowRight: new THREE.Vector3( 1, 0,  0),
      KeyW:       new THREE.Vector3( 0, 0, -1),
      KeyS:       new THREE.Vector3( 0, 0,  1),
      KeyA:       new THREE.Vector3(-1, 0,  0),
      KeyD:       new THREE.Vector3( 1, 0,  0),
    };
    this._keyHandler = (e) => {
      const d = dirMap[e.code];
      if (d) { e.preventDefault(); this._inputQueue.push(d.clone()); }
    };
    window.addEventListener('keydown', this._keyHandler);

    // Wire food grow from EventBus
    EventBus.on(EVENTS.FOOD_COLLECT, ({ snake }) => {
      if (!snake?.alive) return;
      snake.grow(GAME_CONSTANTS.FOOD_VALUE);
      snake.score += snake.hasPowerup(POWERUP_TYPES.MAGNET) ? 2 : 1;
      if (snake.isPlayer) AudioManager.eat();
    });
  }

  /** Called by touch controls / nipplejs HUD */
  setPlayerDirection(dx, dz) {
    if (!this.player?.alive) return;
    const d = new THREE.Vector3(dx, 0, dz).normalize();
    if (d.dot(this.player.dir) >= 0) this._inputQueue.push(d);
    // Also forward to NetworkClient via EventBus for server mode
    EventBus.emit('input:direction', { dx, dz });
  }

  _applyInput() {
    if (!this.player?.alive || this._inputQueue.length === 0) return;
    const d = this._inputQueue.shift();
    if (d.dot(this.player.dir) < 0) return; // block 180
    this.player.nextDir.copy(d);
  }

  /* ══════════════════════════════════════════════════════════
   * PUBLIC API
   * ══════════════════════════════════════════════════════════ */
  pause()  { this.paused = true; }
  resume() { this.paused = false; }

  restart() {
    // Eliminate remaining snakes
    for (const s of this.snakes) if (s.alive) s.eliminate(null);
    this.snakes = [];

    // Reset items
    this.items.dispose();
    this.items.fill();

    // Reset arena storm
    this.arena.stormRadius  = this.arena._shrinkRate * 0 + GAME_CONSTANTS.ARENA_SIZE / 2 * 1.42;
    this.arena.stormActive  = false;
    this.arena._warnFired   = false;
    this.arena._stormWall.material.opacity = 0;
    this.arena._stormRing.material.opacity = 0;

    // Respawn
    this._spawnSnakes();
    this._startTs   = performance.now();
    this._lastFrame = this._startTs;
    this._tickAccum = 0;
    this.elapsed    = 0;
    this.paused     = false;
    EventBus.emit(EVENTS.GAME_START, { playerCount: this.snakes.length });
  }

  /** Called after rewarded ad view — revive player */
  revivePlayer() {
    if (this.player?.alive) return;
    const angle    = Math.random() * Math.PI * 2;
    const startPos = new THREE.Vector3(Math.cos(angle) * 15, 0, Math.sin(angle) * 15);
    const newSnake = new SnakeEntity({
      id: 0, isPlayer: true, color: SNAKE_COLORS[0],
      startPos, scene: this.scene, initialLength: 3,
    });
    newSnake.score = this.player.score;
    this.snakes[0] = newSnake;
    this.player    = newSnake;
    this._aliveCount++;
    AudioManager.powerup();
  }

  _playerRank() {
    const sorted = [...this.snakes].sort((a, b) => b.score - a.score);
    return sorted.findIndex(s => s.isPlayer) + 1;
  }

  /** Inject a server snapshot (network mode) */
  applyServerSnapshot(snapshot) {
    // snapshot shape from ARCHITECTURE §12.2
    this.networkMode = true;
    for (const [id, data] of snapshot.players) {
      const s = this.snakes.find(s => s.id === id);
      if (s && s.alive) s.applySnapshot(data);
    }
  }

  destroy() {
    this.running = false;
    if (this._animId) cancelAnimationFrame(this._animId);
    window.removeEventListener('keydown', this._keyHandler);
    window.removeEventListener('resize',  this._resizeHandler);
    this.renderer.dispose();
  }
}

export { ParticleSystem };
