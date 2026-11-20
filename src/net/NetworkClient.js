// net/NetworkClient.js
// See ARCHITECTURE.md §10 for reconnect and binary protocol spec.

import { io } from 'socket.io-client';
import EventBus from '../utils/EventBus.js';
import StateSync from './StateSync.js';
import { EVENTS, GAME_CONSTANTS } from '../utils/Constants.js';

const RECONNECT_ATTEMPTS = 5;
const SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || 'ws://localhost:3000';

class NetworkClient {
  constructor() {
    this.socket = null;
    this._inputSeq = 0;
    // Callback set by TouchControls (see ARCHITECTURE.md §12.4)
    // Not used here — NetworkClient sets TouchControls.onInput instead
  }

  connect(roomId) {
    this.socket = io(SERVER_URL, {
      query: { room: roomId, token: sessionStorage.getItem('asr_token') || '' },
      transports: ['websocket'],
      reconnectionAttempts: RECONNECT_ATTEMPTS,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
    });

    this.socket.on('connect', () => {
      console.log('[Net] Connected');
      EventBus.emit(EVENTS.GAME_START, { my_id: this.socket.id });
    });

    this.socket.on('snapshot', (buf) => {
      const snap = this._decodeSnapshot(buf);
      StateSync.applySnapshot(snap);
    });

    this.socket.on('game_over', (data) => {
      EventBus.emit(EVENTS.GAME_OVER, data);
    });

    this.socket.on('snake_die', (data) => {
      EventBus.emit(EVENTS.SNAKE_DIE, data);
    });

    this.socket.on('session', ({ token }) => {
      sessionStorage.setItem('asr_token', token);
    });

    this.socket.on('disconnect', () => console.warn('[Net] Disconnected'));
  }

  /**
   * Send directional input to server.
   * Called by TouchControls.onInput and keyboard handler in GameEngine.
   */
  sendInput(dx, dz, boost = false, use_powerup = false) {
    if (!this.socket?.connected) return;
    this.socket.emit('input', {
      seq: ++this._inputSeq,
      dx, dz, boost, use_powerup,
    });
  }

  /** @private Decode binary snapshot buffer — matches server §9.2 format */
  _decodeSnapshot(buf) {
    const view = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
    let offset = 0;
    // header: 4B magic, 2B seq, 2B player_count
    offset += 4; // skip magic
    const seq = view.getUint16(offset, false); offset += 2;
    const player_count = view.getUint16(offset, false); offset += 2;

    const players = new Map();
    for (let i = 0; i < player_count; i++) {
      const id = view.getUint16(offset, false); offset += 2;
      const length = (view.getUint8(offset) << 8) | view.getUint8(offset + 1); offset += 2;
      const x = view.getInt16(offset, false) / 10; offset += 2;
      const z = view.getInt16(offset, false) / 10; offset += 2;
      const dir = view.getUint8(offset) * (Math.PI * 2 / 255); offset += 1;
      const flags = view.getUint8(offset); offset += 1;
      players.set(id, { x, z, length, dir, flags, powerup: null, hp: 100 });
    }

    const food_count = view.getUint16(offset, false); offset += 2;
    const food = [];
    for (let i = 0; i < food_count; i++) {
      const fx = view.getInt16(offset, false) / 10; offset += 2;
      const fz = view.getInt16(offset, false) / 10; offset += 2;
      food.push({ x: fx, z: fz });
    }

    const zone_radius = view.getUint16(offset, false) / 10;

    return { tick: seq, zone_radius, players, food, my_id: -1, player_count };
  }
}

export default new NetworkClient();
