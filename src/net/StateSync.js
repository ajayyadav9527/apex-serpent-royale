// net/StateSync.js
// FROZEN snapshot shape — see ARCHITECTURE.md §12.2

import { lerp } from '../utils/MathUtils.js';

/**
 * @typedef {Object} PlayerState
 * @property {number} x
 * @property {number} z
 * @property {number} length
 * @property {number} dir     - angle in radians
 * @property {number} flags   - bitmask: 0x01=shield, 0x02=ghost, 0x04=boost
 * @property {string|null} powerup
 * @property {number} hp
 */

/**
 * @typedef {Object} Snapshot
 * @property {number} tick
 * @property {number} zone_radius
 * @property {Map<number, PlayerState>} players
 * @property {Array<{x:number, z:number}>} food
 * @property {number} my_id
 * @property {number} player_count
 */

class StateSync {
  constructor() {
    /** @type {Snapshot} */
    this.snapshot = {
      tick: 0,
      zone_radius: 450,
      players: new Map(),
      food: [],
      my_id: -1,
      player_count: 0,
    };

    this._prev = null;
    this._alpha = 0;
  }

  /**
   * Called by NetworkClient when a new binary frame arrives.
   * @param {Snapshot} incoming
   */
  applySnapshot(incoming) {
    this._prev = { ...this.snapshot, players: new Map(this.snapshot.players) };
    this.snapshot = incoming;
    this._alpha = 0;
  }

  /**
   * Advance interpolation. Called each render frame by GameEngine.
   * @param {number} dt - delta time in seconds
   */
  tick(dt) {
    const TICK_DT = 1 / 20;
    this._alpha = Math.min(1, this._alpha + dt / TICK_DT);
    // Interpolated positions available via interpolatedPlayers()
  }

  /**
   * Returns smoothed player positions for rendering.
   * @returns {Map<number, {x:number, z:number, length:number, dir:number, flags:number}>}
   */
  interpolatedPlayers() {
    if (!this._prev) return this.snapshot.players;
    const result = new Map();
    this.snapshot.players.forEach((curr, id) => {
      const prev = this._prev.players.get(id);
      if (!prev) { result.set(id, curr); return; }
      result.set(id, {
        ...curr,
        x: lerp(prev.x, curr.x, this._alpha),
        z: lerp(prev.z, curr.z, this._alpha),
      });
    });
    return result;
  }
}

export default new StateSync();
