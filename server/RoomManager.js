// server/RoomManager.js
// Manages game rooms and player sessions.

import { randomBytes } from 'crypto';

const rooms = new Map();      // roomId → Room
const playerRoom = new Map(); // socketId → roomId
const tokens = new Map();     // token → socketId

class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map(); // socketId → {x, z, dir, length, hp, input, flags}
    this.food = [];
    this.zone_radius = 450;
    this.tick = 0;
    this.state = 'WAITING'; // WAITING | COUNTDOWN | IN_GAME | GAME_OVER
    this._spawnFood(80);
  }

  _spawnFood(n) {
    for (let i = 0; i < n; i++) {
      this.food.push({
        x: (Math.random() - 0.5) * 900,
        z: (Math.random() - 0.5) * 900,
      });
    }
  }

  addPlayer(socketId) {
    this.players.set(socketId, {
      x: (Math.random() - 0.5) * 400,
      z: (Math.random() - 0.5) * 400,
      dir: Math.random() * Math.PI * 2,
      length: 5,
      hp: 100,
      flags: 0,
      input: { dx: 0, dz: 1, boost: false, use_powerup: false },
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  applyInput(socketId, input) {
    const p = this.players.get(socketId);
    if (p) p.input = input;
  }

  advance() {
    this.tick++;
    const SPEED = 0.15;
    this.players.forEach((p) => {
      const { dx, dz, boost } = p.input;
      const spd = boost ? SPEED * 1.4 : SPEED;
      p.x += dx * spd;
      p.z += dz * spd;
      p.dir = Math.atan2(dz, dx);
      // Zone damage
      const dist = Math.sqrt(p.x * p.x + p.z * p.z);
      if (dist > this.zone_radius) p.hp -= 2 / 20;
      if (p.hp <= 0) p.hp = 0;
    });
    // Shrink zone
    if (this.state === 'IN_GAME') {
      this.zone_radius = Math.max(50, this.zone_radius - (400 / (300 * 20)));
    }
  }

  buildSnapshot() {
    const playerArr = [...this.players.entries()];
    const pc = playerArr.length;
    const fc = this.food.length;
    // Header(8) + per-player(10) + food_count(2) + per-food(4) + zone(2)
    const buf = new ArrayBuffer(8 + pc * 10 + 2 + fc * 4 + 2);
    const v = new DataView(buf);
    let o = 0;
    v.setUint32(o, 0x41535200, false); o += 4; // magic "ASR\0"
    v.setUint16(o, this.tick & 0xffff, false); o += 2;
    v.setUint16(o, pc, false); o += 2;
    playerArr.forEach(([, p], i) => {
      v.setUint16(o, i, false); o += 2;
      v.setUint8(o, (p.length >> 8) & 0xff); o++;
      v.setUint8(o, p.length & 0xff); o++;
      v.setInt16(o, Math.round(p.x * 10), false); o += 2;
      v.setInt16(o, Math.round(p.z * 10), false); o += 2;
      v.setUint8(o, Math.round((p.dir / (Math.PI * 2)) * 255) & 0xff); o++;
      v.setUint8(o, p.flags); o++;
    });
    v.setUint16(o, fc, false); o += 2;
    this.food.forEach(f => {
      v.setInt16(o, Math.round(f.x * 10), false); o += 2;
      v.setInt16(o, Math.round(f.z * 10), false); o += 2;
    });
    v.setUint16(o, Math.round(this.zone_radius * 10), false);
    return buf;
  }
}

const RoomManager = {
  joinOrCreate(roomId, socketId, token) {
    let room = rooms.get(roomId);
    if (!room) { room = new Room(roomId); rooms.set(roomId, room); }
    room.addPlayer(socketId);
    playerRoom.set(socketId, roomId);
    return room;
  },

  leave(socketId) {
    const roomId = playerRoom.get(socketId);
    if (!roomId) return;
    rooms.get(roomId)?.removePlayer(socketId);
    playerRoom.delete(socketId);
  },

  issueToken(socketId) {
    const tok = randomBytes(16).toString('hex');
    tokens.set(tok, socketId);
    return tok;
  },

  tick(cb) {
    rooms.forEach((room, roomId) => {
      room.advance();
      const snap = room.buildSnapshot();
      const ids = [...room.players.keys()];
      if (ids.length) cb(roomId, snap, ids);
    });
  },
};

export default RoomManager;
