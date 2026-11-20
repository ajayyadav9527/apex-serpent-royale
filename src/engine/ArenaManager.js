/**
 * ArenaManager.js  — @game_dev owns
 * Builds and manages the 3D arena: floor, grid, boundary walls, skybox, lighting,
 * and the shrinking electric storm zone.
 *
 * ARCHITECTURE §4.2, §4.5
 */

import * as THREE from 'three';
import EventBus from '../utils/EventBus.js';
import { GAME_CONSTANTS, EVENTS } from '../utils/Constants.js';

const ARENA_HALF = GAME_CONSTANTS.ARENA_SIZE / 2;  // e.g. 500

// Storm config
const STORM_SHRINK_TOTAL_S = GAME_CONSTANTS.ZONE_SHRINK_TIME; // 300s
const STORM_START_RADIUS   = ARENA_HALF * 1.42;               // diagonal
const STORM_MIN_RADIUS     = 50;
const STORM_START_DELAY_S  = 10;
const STORM_DMG_INTERVAL   = 0.5; // seconds between storm damage ticks

export class ArenaManager {
  constructor(scene) {
    this.scene  = scene;
    // Storm state
    this.stormRadius  = STORM_START_RADIUS;
    this.stormCenter  = new THREE.Vector3(0, 0, 0);
    this.stormActive  = false;
    this._stormTimer  = 0;      // seconds since game start
    this._dmgTimer    = 0;      // accumulator for per-tick damage
    this._warnFired   = false;
    this._shrinkRate  = (STORM_START_RADIUS - STORM_MIN_RADIUS) / STORM_SHRINK_TOTAL_S;

    // Three.js objects
    this._stormWall   = null;
    this._stormRing   = null;
    this._neonPts     = [];

    this._build();
  }

  // ── Build all static arena geometry ─────────────────────
  _build() {
    const scene = this.scene;

    // Ground
    const groundGeo = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 60, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      color:     0x040418,
      roughness: 0.95,
      metalness: 0.08,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x  = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid overlay
    const grid = new THREE.GridHelper(ARENA_HALF * 2, 60, 0x0d0d44, 0x0d0d44);
    grid.position.y = 0.02;
    scene.add(grid);

    // Neon boundary walls (4 glowing lines)
    const wallColor = 0x0066ff;
    const A = ARENA_HALF;
    const edgePairs = [
      [[-A, 0, -A], [ A, 0, -A]],
      [[ A, 0, -A], [ A, 0,  A]],
      [[ A, 0,  A], [-A, 0,  A]],
      [[-A, 0,  A], [-A, 0, -A]],
    ];
    for (const [from, to] of edgePairs) {
      const pts = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: wallColor });
      const line = new THREE.Line(geo, mat);
      line.position.y = 0.08;
      scene.add(line);
    }

    // Skybox (simple colour gradient via fog)
    scene.background = new THREE.Color(0x020210);
    scene.fog        = new THREE.FogExp2(0x020210, 0.008);

    // Lights
    scene.add(new THREE.AmbientLight(0x101030, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far  = 500;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -ARENA_HALF;
    sun.shadow.camera.right = sun.shadow.camera.top   =  ARENA_HALF;
    scene.add(sun);

    // Corner neon point-lights
    const ptPalette = [0xff00ff, 0x00ffff, 0xffff00, 0xff4400];
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const pt  = new THREE.PointLight(ptPalette[i], 3, 120);
      pt.position.set(Math.cos(ang) * A * 0.9, 15, Math.sin(ang) * A * 0.9);
      scene.add(pt);
      this._neonPts.push(pt);
    }

    // Electric storm wall (cylinder, opens outward)
    const wallGeo = new THREE.CylinderGeometry(
      this.stormRadius, this.stormRadius, 60, 80, 1, true
    );
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x4400cc,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
    });
    this._stormWall = new THREE.Mesh(wallGeo, wallMat);
    this._stormWall.position.y = 0;
    scene.add(this._stormWall);

    // Storm ground ring
    const ringGeo = new THREE.TorusGeometry(this.stormRadius, 0.4, 6, 128);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8800ff, transparent: true, opacity: 0 });
    this._stormRing = new THREE.Mesh(ringGeo, ringMat);
    this._stormRing.rotation.x = Math.PI / 2;
    scene.add(this._stormRing);
  }

  // ── Per-frame update ─────────────────────────────────────
  /**
   * @param {number} dt      — delta seconds
   * @param {number} elapsed — total seconds since game start
   */
  update(dt, elapsed) {
    // Activate storm after delay
    if (!this.stormActive && elapsed > STORM_START_DELAY_S) {
      this.stormActive = true;
      EventBus.emit(EVENTS.ZONE_WARNING);
    }

    // 30-second pre-warning
    if (!this._warnFired && elapsed > STORM_START_DELAY_S - 30) {
      this._warnFired = true;
      EventBus.emit(EVENTS.ZONE_WARNING, { imminence: 'warn' });
    }

    if (this.stormActive) {
      // Shrink radius
      this.stormRadius = Math.max(
        STORM_MIN_RADIUS,
        this.stormRadius - this._shrinkRate * dt
      );
      this._refreshStormGeometry();
      this._animateStorm(elapsed);
    }
  }

  // ── Rebuild storm geometry to current radius ─────────────
  _refreshStormGeometry() {
    // Scale the cylinder instead of rebuilding geometry
    const scale = this.stormRadius / STORM_START_RADIUS;
    this._stormWall.scale.set(scale, 1, scale);
    this._stormRing.scale.set(scale, scale, 1);
  }

  // ── Animate storm FX ─────────────────────────────────────
  _animateStorm(elapsed) {
    const flicker = 0.14 + Math.sin(elapsed * 7.3) * 0.06 + Math.sin(elapsed * 13.1) * 0.03;
    this._stormWall.material.opacity = flicker;
    this._stormWall.material.color.setHSL(
      0.72 + Math.sin(elapsed * 2.8) * 0.06, 1.0, 0.5
    );
    this._stormRing.material.opacity = 0.55 + Math.sin(elapsed * 10.5) * 0.3;

    // Flicker corner lights
    for (let i = 0; i < this._neonPts.length; i++) {
      this._neonPts[i].intensity = 2.5 + Math.sin(elapsed * 5 + i) * 0.8;
    }
  }

  // ── Storm damage query ───────────────────────────────────
  /**
   * @param {THREE.Vector3} pos
   * @returns {boolean}
   */
  isOutsideStorm(pos) {
    return this.stormActive &&
      pos.distanceTo(this.stormCenter) > this.stormRadius;
  }

  // ── Convenience: returns game-ready storm state for HUD ──
  stormState() {
    return {
      active: this.stormActive,
      radius: this.stormRadius,
      center: this.stormCenter,
    };
  }

  dispose() {
    this.scene.remove(this._stormWall);
    this.scene.remove(this._stormRing);
  }
}
