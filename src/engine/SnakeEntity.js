/**
 * SnakeEntity.js  — @game_dev owns
 * Manages a single snake's 3D segment mesh chain, power-up state, and visuals.
 * Works in both local-AI mode and server-snapshot mode (positions injected externally).
 *
 * ARCHITECTURE §4.3, §5
 */

import * as THREE from 'three';
import { GAME_CONSTANTS, POWERUP_TYPES, POWERUP_COLORS } from '../utils/Constants.js';

// Shared geometry (all snakes reuse)
const _segGeo  = new THREE.BoxGeometry(0.85, 0.85, 0.85);

export class SnakeEntity {
  /**
   * @param {object} opts
   * @param {number}  opts.id
   * @param {boolean} opts.isPlayer
   * @param {number}  opts.color      — 0xRRGGBB hex
   * @param {THREE.Vector3} opts.startPos
   * @param {THREE.Scene}   opts.scene
   * @param {number}  opts.initialLength
   */
  constructor({ id, isPlayer, color, startPos, scene, initialLength = 5 }) {
    this.id       = id;
    this.isPlayer = isPlayer;
    this.alive    = true;
    this.score    = 0;
    this.color    = color;
    this.scene    = scene;

    // Movement
    this.dir     = new THREE.Vector3(1, 0, 0);
    this.nextDir = new THREE.Vector3(1, 0, 0);
    this.speed   = GAME_CONSTANTS.BASE_SPEED;

    // Segment world-space position history (Vector3[])
    this.positions = [];

    // Three.js mesh array — index 0 = head
    this.segments = [];

    // Active power-up effects: type → expiry timestamp (ms)
    this.activePowerups = new Map();

    // Visual materials
    this._bodyMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.6,
    });
    this._headMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.95,
      roughness: 0.08,
      metalness: 0.85,
    });
    this._ghostMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.5,
    });

    // Shield halo (attached to head)
    this._shieldMesh = null;

    // Build initial segments
    this._initSegments(startPos, initialLength);
  }

  // ── Build initial segment meshes ─────────────────────────
  _initSegments(startPos, count) {
    const sp = GAME_CONSTANTS.SEGMENT_SPACING;
    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(
        startPos.x - i * sp,
        startPos.y,
        startPos.z
      );
      this.positions.push(pos.clone());
      const mesh = new THREE.Mesh(_segGeo, i === 0 ? this._headMat : this._bodyMat);
      mesh.position.copy(pos);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.segments.push(mesh);
    }
  }

  // ── Grow by n segments at tail ───────────────────────────
  grow(n = 1) {
    const sp   = GAME_CONSTANTS.SEGMENT_SPACING;
    const tail = this.positions.at(-1);
    for (let i = 0; i < n; i++) {
      const pos = tail.clone();
      this.positions.push(pos);
      const mesh = new THREE.Mesh(_segGeo, this._bodyMat);
      mesh.position.copy(pos);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.segments.push(mesh);
    }
    // Cap at MAX_SEGMENTS
    while (this.positions.length > GAME_CONSTANTS.MAX_SEGMENTS) {
      this.positions.pop();
      const m = this.segments.pop();
      this.scene.remove(m);
    }
  }

  // ── Discrete movement step (local/AI mode) ───────────────
  step() {
    if (!this.alive) return;
    this.dir.copy(this.nextDir);
    const newHead = this.positions[0].clone().addScaledVector(
      this.dir, GAME_CONSTANTS.SEGMENT_SPACING
    );
    this.positions.unshift(newHead);
    this.positions.pop();
    this._syncMeshes();
  }

  // ── Server snapshot injection (network mode) ─────────────
  /**
   * @param {{ x: number, z: number, length: number, dir: number, flags: number }} serverData
   */
  applySnapshot(serverData) {
    // Reposition head; shift tail — a simplified reconcile
    const sp  = GAME_CONSTANTS.SEGMENT_SPACING;
    const hx  = serverData.x;
    const hz  = serverData.z;
    const len = Math.min(serverData.length, GAME_CONSTANTS.MAX_SEGMENTS);

    // Grow/shrink pool
    while (this.positions.length < len) this.grow(1);
    while (this.positions.length > len) {
      this.positions.pop();
      const m = this.segments.pop();
      this.scene.remove(m);
    }

    // Move head
    this.positions[0].set(hx, 0, hz);
    this._syncMeshes();
  }

  // ── Sync mesh positions to position array ────────────────
  _syncMeshes() {
    for (let i = 0; i < this.segments.length && i < this.positions.length; i++) {
      this.segments[i].position.copy(this.positions[i]);
    }
  }

  // ── Power-ups ────────────────────────────────────────────
  /**
   * @param {string} type   — one of POWERUP_TYPES values
   * @param {number} duration_ms
   * @param {number} start_ts
   */
  applyPowerup(type, duration_ms, start_ts) {
    this.activePowerups.set(type, start_ts + duration_ms);

    if (type === POWERUP_TYPES.SPEED_BOOST) {
      this.speed = Math.min(
        GAME_CONSTANTS.BASE_SPEED * 2,
        GAME_CONSTANTS.BASE_SPEED * GAME_CONSTANTS.SPEED_CAP_MULTIPLIER
      );
    }
    if (type === POWERUP_TYPES.SHIELD) this._attachShield();
    if (type === POWERUP_TYPES.GHOST)  this._setGhostVisual(true);
  }

  tickPowerups(now) {
    for (const [type, expiry] of this.activePowerups) {
      if (now >= expiry) {
        this.activePowerups.delete(type);
        if (type === POWERUP_TYPES.SPEED_BOOST) this.speed = GAME_CONSTANTS.BASE_SPEED;
        if (type === POWERUP_TYPES.SHIELD)       this._detachShield();
        if (type === POWERUP_TYPES.GHOST)        this._setGhostVisual(false);
      }
    }
  }

  hasPowerup(type) { return this.activePowerups.has(type); }

  // ── Shield halo ──────────────────────────────────────────
  _attachShield() {
    if (this._shieldMesh) return;
    const geo = new THREE.SphereGeometry(1.3, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: POWERUP_COLORS[POWERUP_TYPES.SHIELD],
      transparent: true,
      opacity: 0.3,
      side: THREE.FrontSide,
      wireframe: true,
    });
    this._shieldMesh = new THREE.Mesh(geo, mat);
    this.segments[0].add(this._shieldMesh);
  }

  _detachShield() {
    if (!this._shieldMesh) return;
    this.segments[0].remove(this._shieldMesh);
    this._shieldMesh.geometry.dispose();
    this._shieldMesh.material.dispose();
    this._shieldMesh = null;
  }

  // ── Ghost visual (semi-transparent) ─────────────────────
  _setGhostVisual(on) {
    const mat = on ? this._ghostMat : this._bodyMat;
    const hMat = on ? this._ghostMat : this._headMat;
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].material = i === 0 ? hMat : mat;
    }
  }

  // ── Ghost flicker ────────────────────────────────────────
  updateGhostFlicker(elapsed) {
    if (!this.hasPowerup(POWERUP_TYPES.GHOST)) return;
    const v = Math.sin(elapsed * 22) > 0;
    this.setVisible(v);
  }

  // ── Eliminate ────────────────────────────────────────────
  /**
   * @param {import('./GameEngine.js').ParticleSystem} particles
   */
  eliminate(particles) {
    if (!this.alive) return;
    this.alive = false;
    if (particles) {
      for (const pos of this.positions.slice(0, 20)) {
        particles.burst(pos, this.color, 6);
      }
    }
    for (const m of this.segments) {
      this.scene.remove(m);
    }
    this.segments  = [];
    this.positions = [];
    this._detachShield();
  }

  setVisible(v) {
    for (const m of this.segments) m.visible = v;
  }

  headPos() { return this.positions[0]; }
  get length() { return this.positions.length; }

  // ── Per-frame animation ──────────────────────────────────
  animate(elapsed) {
    // Pulse emissive on head
    if (this.segments[0]) {
      this._headMat.emissiveIntensity = 0.7 + Math.sin(elapsed * 4 + this.id) * 0.25;
    }
    // Shield spin
    if (this._shieldMesh) {
      this._shieldMesh.rotation.y  = elapsed * 1.5;
      this._shieldMesh.rotation.x  = elapsed * 0.8;
    }
  }

  dispose() {
    this._bodyMat.dispose();
    this._headMat.dispose();
    this._ghostMat.dispose();
  }
}
