/**
 * CollisionSystem.js  — @game_dev owns
 * Spatial-hash AABB grid-partition collision detection.
 * Emits EventBus events on food collect, powerup collect, snake death.
 *
 * ARCHITECTURE §4.4
 */

import * as THREE from 'three';
import EventBus from '../utils/EventBus.js';
import { GAME_CONSTANTS, POWERUP_TYPES, EVENTS } from '../utils/Constants.js';
import { spatialKey, distSq } from '../utils/MathUtils.js';

// Cell size in world units — slightly larger than max snake segment spacing
const CELL_SIZE = 1.5;
const SEG_SPACE  = GAME_CONSTANTS.SEGMENT_SPACING;

export class CollisionSystem {
  constructor() {
    // Spatial hash: key → Set of { snake, segIndex }
    this._grid = new Map();
  }

  // ── Rebuild grid from all alive snakes ───────────────────
  rebuild(snakes) {
    this._grid.clear();
    for (const snake of snakes) {
      if (!snake.alive) continue;
      for (let i = 0; i < snake.positions.length; i++) {
        const p   = snake.positions[i];
        const key = spatialKey(p.x, p.z, CELL_SIZE);
        if (!this._grid.has(key)) this._grid.set(key, []);
        this._grid.get(key).push({ snake, segIndex: i });
      }
    }
  }

  // ── Query neighbours around a world position ─────────────
  _neighbours(x, z) {
    const result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${Math.floor(x / CELL_SIZE) + dx},${Math.floor(z / CELL_SIZE) + dz}`;
        const cell = this._grid.get(key);
        if (cell) result.push(...cell);
      }
    }
    return result;
  }

  /**
   * Run all collision checks for the tick.
   * @param {SnakeEntity[]}   snakes
   * @param {object[]}        foods      — ItemManager.foods
   * @param {object[]}        powerups   — ItemManager.powerups
   * @param {StormZone}       storm
   * @param {ParticleSystem}  particles
   * @param {number}          now        — performance.now()
   * @returns {{ toEliminateIds: Set<number>, foodsToRemove: number[], powerupsToRemove: number[] }}
   */
  check(snakes, foods, powerups, storm, particles, now) {
    const toEliminateIds  = new Set();
    const foodsToRemove   = [];
    const powerupsToRemove = [];

    for (const snake of snakes) {
      if (!snake.alive || toEliminateIds.has(snake.id)) continue;
      const head = snake.headPos();
      const hx   = head.x;
      const hz   = head.z;

      // ── Arena wall ────────────────────────────────────────
      const A = GAME_CONSTANTS.ARENA_SIZE / 2;
      if (Math.abs(hx) > A || Math.abs(hz) > A) {
        if (!snake.hasPowerup(POWERUP_TYPES.GHOST)) {
          toEliminateIds.add(snake.id);
          continue;
        }
      }

      // ── Storm zone ────────────────────────────────────────
      if (storm.active && storm.isOutside(head)) {
        if (!snake.hasPowerup(POWERUP_TYPES.GHOST) &&
            !snake.hasPowerup(POWERUP_TYPES.SHIELD)) {
          toEliminateIds.add(snake.id);
          continue;
        }
      }

      // ── Snake vs body segments (self + others) ────────────
      const neighbours = this._neighbours(hx, hz);
      let bodyHit = false;
      for (const { snake: other, segIndex } of neighbours) {
        if (!other.alive || toEliminateIds.has(other.id)) continue;
        const isSelf = other === snake;
        if (isSelf && segIndex < 3) continue; // skip own neck
        const op = other.positions[segIndex];
        const ds = distSq(hx, hz, op.x, op.z);
        if (ds < (SEG_SPACE * 0.75) ** 2) {
          if (!snake.hasPowerup(POWERUP_TYPES.GHOST) &&
              !snake.hasPowerup(POWERUP_TYPES.SHIELD)) {
            toEliminateIds.add(snake.id);
            bodyHit = true;
            // Award kill score to other snake (if not self-collision)
            if (!isSelf && other.alive) other.score += 50;
            break;
          }
        }
      }
      if (bodyHit) continue;

      // ── Head-on collision (two snake heads meet) ──────────
      for (const other of snakes) {
        if (other === snake || !other.alive || toEliminateIds.has(other.id)) continue;
        const oh = other.headPos();
        const ds = distSq(hx, hz, oh.x, oh.z);
        if (ds < (SEG_SPACE * 0.9) ** 2) {
          if (!snake.hasPowerup(POWERUP_TYPES.GHOST) &&
              !other.hasPowerup(POWERUP_TYPES.GHOST)) {
            // Shorter snake loses; tie → both lose
            if (snake.length < other.length) {
              toEliminateIds.add(snake.id);
            } else if (other.length < snake.length) {
              toEliminateIds.add(other.id);
              other.score = Math.max(0, other.score - 10);
            } else {
              toEliminateIds.add(snake.id);
              toEliminateIds.add(other.id);
            }
          }
        }
      }

      if (toEliminateIds.has(snake.id)) continue;

      // ── Food pickup ───────────────────────────────────────
      for (let fi = foods.length - 1; fi >= 0; fi--) {
        const f  = foods[fi];
        const fp = f.mesh.position;
        const ds = distSq(hx, hz, fp.x, fp.z);
        if (ds < (SEG_SPACE * 1.1) ** 2) {
          foodsToRemove.push(fi);
          if (particles) particles.burst(fp.clone(), f.mesh.material.color.getHex(), 14);
          EventBus.emit(EVENTS.FOOD_COLLECT, { snake, foodIndex: fi });
          break;
        }
      }

      // ── Power-up pickup ───────────────────────────────────
      for (let pi = powerups.length - 1; pi >= 0; pi--) {
        const pu  = powerups[pi];
        const pp  = pu.mesh.position;
        const ds  = distSq(hx, hz, pp.x, pp.z);
        if (ds < (SEG_SPACE * 1.4) ** 2) {
          powerupsToRemove.push(pi);
          if (particles) particles.burst(pp.clone(), pu.color, 24);
          const payload = { type: pu.type, duration_ms: pu.duration_ms, start_ts: now };
          snake.applyPowerup(pu.type, pu.duration_ms, now);
          EventBus.emit(EVENTS.POWERUP_COLLECT, { snake, ...payload });
          break;
        }
      }
    }

    // Emit death events
    for (const id of toEliminateIds) {
      const s = snakes.find(s => s.id === id);
      if (s) EventBus.emit(EVENTS.SNAKE_DIE, { snake: s, isPlayer: s.isPlayer });
    }

    return { toEliminateIds, foodsToRemove, powerupsToRemove };
  }
}
