/**
 * PowerupManager.js  — @game_dev owns
 * Handles power-up item spawning, 3D mesh lifecycle, and animation.
 * Also manages food pellet spawning.
 *
 * ARCHITECTURE §5
 */

import * as THREE from 'three';
import { GAME_CONSTANTS, POWERUP_TYPES, POWERUP_COLORS } from '../utils/Constants.js';

// Power-up durations (ms)
const DURATIONS = {
  [POWERUP_TYPES.SPEED_BOOST]: 5000,
  [POWERUP_TYPES.SHIELD]:      6000,
  [POWERUP_TYPES.GHOST]:       5000,
  [POWERUP_TYPES.MAGNET]:      5000,
  [POWERUP_TYPES.VENOM_SPIT]:  4000,
  [POWERUP_TYPES.BOMB]:        0, // instant
};

const FOOD_COUNT   = 35;
const POWERUP_COUNT = 8;

export class PowerupManager {
  constructor(scene) {
    this.scene    = scene;
    this.foods    = [];
    this.powerups = [];
    this._puTypes = Object.values(POWERUP_TYPES);

    // Shared food geometry
    this._foodGeo = new THREE.SphereGeometry(0.42, 10, 10);
  }

  // ── Random arena position ────────────────────────────────
  _rndPos(y = 0.5) {
    const half = GAME_CONSTANTS.ARENA_SIZE / 2 - 2;
    return new THREE.Vector3(
      (Math.random() * 2 - 1) * half,
      y,
      (Math.random() * 2 - 1) * half
    );
  }

  // ── Fill to target counts ────────────────────────────────
  fill() {
    while (this.foods.length    < FOOD_COUNT)    this.spawnFood();
    while (this.powerups.length < POWERUP_COUNT) this.spawnPowerup();
  }

  // ── Spawn one food pellet ────────────────────────────────
  spawnFood() {
    const hue   = Math.random();
    const color = new THREE.Color().setHSL(hue, 1.0, 0.55);
    const mat   = new THREE.MeshStandardMaterial({
      color,
      emissive:          color,
      emissiveIntensity: 1.6,
      roughness:         0.08,
      metalness:         0.0,
    });
    const mesh = new THREE.Mesh(this._foodGeo, mat);
    mesh.position.copy(this._rndPos());
    // Glow halo
    const haloGeo = new THREE.SphereGeometry(0.65, 8, 8);
    const haloMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    mesh.add(halo);
    this.scene.add(mesh);
    this.foods.push({ mesh, halo, hue, t: Math.random() * Math.PI * 2 });
  }

  // ── Spawn one power-up gem ───────────────────────────────
  spawnPowerup() {
    const type        = this._puTypes[Math.floor(Math.random() * this._puTypes.length)];
    const color       = POWERUP_COLORS[type];
    const duration_ms = DURATIONS[type] || 5000;

    const geo = new THREE.OctahedronGeometry(0.65);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive:          color,
      emissiveIntensity: 2.2,
      roughness:         0.04,
      metalness:         0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(this._rndPos(1.0));

    // Orbit ring
    const ringGeo = new THREE.TorusGeometry(0.9, 0.06, 8, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    mesh.add(ring);

    // Label sprite (simple colour-coded marker)
    this.scene.add(mesh);
    this.powerups.push({
      mesh, ring, type, color, duration_ms,
      t: Math.random() * Math.PI * 2,
    });
  }

  // ── Remove by index ──────────────────────────────────────
  removeFood(idx) {
    const f = this.foods[idx];
    if (!f) return;
    this.scene.remove(f.mesh);
    f.mesh.material.dispose();
    this.foods.splice(idx, 1);
  }

  removePowerup(idx) {
    const p = this.powerups[idx];
    if (!p) return;
    this.scene.remove(p.mesh);
    p.mesh.material.dispose();
    this.powerups.splice(idx, 1);
  }

  // ── Per-frame animation ──────────────────────────────────
  animate(elapsed) {
    // Foods
    for (const f of this.foods) {
      f.t += 0.028;
      f.mesh.position.y    = 0.5 + Math.sin(f.t) * 0.18;
      f.mesh.rotation.y   += 0.025;
      const pulse          = 1.3 + Math.sin(f.t * 1.8) * 0.5;
      f.mesh.material.emissiveIntensity = pulse;
      f.halo.material.opacity           = 0.12 + Math.sin(f.t * 2.2) * 0.08;
    }

    // Power-ups
    for (const p of this.powerups) {
      p.t += 0.022;
      p.mesh.position.y    = 1.0 + Math.sin(p.t) * 0.28;
      p.mesh.rotation.y   += 0.035;
      p.ring.rotation.x   += 0.055;
      p.ring.rotation.z   += 0.028;
      p.mesh.material.emissiveIntensity = 1.8 + Math.sin(p.t * 2.5) * 0.6;
    }
  }

  // ── Magnet: pull foods toward a position ─────────────────
  magnetPull(targetPos, dt) {
    const RADIUS = 14;
    for (const f of this.foods) {
      const toTarget = targetPos.clone().sub(f.mesh.position);
      const dist     = toTarget.length();
      if (dist < RADIUS && dist > 0.5) {
        toTarget.normalize().multiplyScalar(dt * 10);
        f.mesh.position.add(toTarget);
      }
    }
  }

  dispose() {
    for (const f of this.foods)    this.scene.remove(f.mesh);
    for (const p of this.powerups) this.scene.remove(p.mesh);
    this.foods    = [];
    this.powerups = [];
  }
}
