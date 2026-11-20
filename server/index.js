// server/index.js — Apex Serpent Royale Game Server & Static Host
// Authoritative 20 TPS game server + static web server for zero-config Railway/Render deployment.

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import RoomManager from './RoomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const PORT = process.env.PORT || 3000;

const httpServer = createServer((req, res) => {
  // Normalize URL
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = join(ROOT_DIR, reqPath);

  // Security check: ensure path stays within ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
      const content = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
  }

  // Fallback to index.html for SPA routing
  const fallbackIndex = join(ROOT_DIR, 'index.html');
  if (existsSync(fallbackIndex)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync(fallbackIndex));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  const { room: roomId, token } = socket.handshake.query;
  const room = RoomManager.joinOrCreate(roomId, socket.id, token);

  // Send session token back for reconnection
  const newToken = RoomManager.issueToken(socket.id);
  socket.emit('session', { token: newToken });

  socket.on('input', (data) => {
    room.applyInput(socket.id, data);
  });

  socket.on('disconnect', () => {
    RoomManager.leave(socket.id);
  });
});

// Broadcast snapshot to all rooms at 20 TPS
setInterval(() => {
  RoomManager.tick((roomId, binarySnapshot, playerIds) => {
    playerIds.forEach(id => {
      io.to(id).emit('snapshot', binarySnapshot);
    });
  });
}, 1000 / 20);

httpServer.listen(PORT, () => {
  console.log(`[Apex Serpent Royale] Server running at http://localhost:${PORT}`);
});
