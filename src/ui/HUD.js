/**
 * APEX SERPENT ROYALE — HUD.js
 * Cyberpunk Heads-Up Display & Minimap Radar
 * Version: 1.0.0
 * FROZEN Contract: ARCHITECTURE.md §6.1
 */

'use strict';

(function (global) {
  class HUD {
    constructor() {
      this.minimapCanvas = null;
      this.minimapCtx = null;
      this.scoreEl = null;
      this.lengthEl = null;
      this.aliveEl = null;
      this.rankEl = null;
      this.stormBadge = null;
      this.stormText = null;
      this.leaderboardEl = null;
      this.killfeedEl = null;
      this.powerupTray = null;
      this.boostBar = null;
      this.boostVal = null;
      this.radarCoords = null;
    }

    init(options = {}) {
      this.minimapCanvas = options.minimapCanvas || document.getElementById('minimap-canvas');
      if (this.minimapCanvas) {
        this.minimapCtx = this.minimapCanvas.getContext('2d');
      }

      this.scoreEl       = document.getElementById('hud-score');
      this.lengthEl      = document.getElementById('hud-length');
      this.aliveEl       = document.getElementById('hud-alive');
      this.rankEl        = document.getElementById('hud-player-rank');
      this.stormBadge    = document.getElementById('hud-storm-badge');
      this.stormText     = document.getElementById('storm-status-text');
      this.leaderboardEl = document.getElementById('leaderboard-items');
      this.killfeedEl    = document.getElementById('hud-killfeed');
      this.powerupTray   = document.getElementById('hud-powerup-tray');
      this.boostBar      = document.getElementById('boost-bar-fill');
      this.boostVal      = document.getElementById('boost-stamina-val');
      this.radarCoords   = document.getElementById('radar-player-coords');
    }

    updateStats(score, length, alive, rank) {
      if (this.scoreEl)  this.scoreEl.innerText = score;
      if (this.lengthEl) this.lengthEl.innerText = length;
      if (this.aliveEl)  this.aliveEl.innerText = alive;
      if (this.rankEl)   this.rankEl.innerText = `#${rank}`;
    }

    updateStorm(radius, isWarning) {
      if (!this.stormText) return;
      if (isWarning) {
        this.stormText.innerText = '⚠️ STORM COLLAPSING!';
        if (this.stormBadge) this.stormBadge.style.borderColor = 'var(--yellow)';
      } else {
        this.stormText.innerText = `ZONE RADIUS: ${Math.round(radius)}m`;
      }
    }

    updateBoost(percent) {
      if (this.boostBar) this.boostBar.style.width = `${percent}%`;
      if (this.boostVal) this.boostVal.innerText = `${Math.round(percent)}%`;
    }

    renderPowerup(type, remainingMs) {
      if (!this.powerupTray) return;
      const id = `pu-pill-${type}`;
      let pill = document.getElementById(id);
      if (!pill) {
        pill = document.createElement('div');
        pill.id = id;
        pill.className = `powerup-pill ${type.toLowerCase()}`;
        this.powerupTray.appendChild(pill);
      }
      const sec = Math.ceil(remainingMs / 1000);
      pill.innerHTML = `<span>⚡ ${type}</span> <strong>${sec}s</strong>`;
      setTimeout(() => {
        if (pill.parentNode) pill.parentNode.removeChild(pill);
      }, remainingMs);
    }

    addKillFeed(killer, victim, cause) {
      if (!this.killfeedEl) return;
      const item = document.createElement('div');
      item.className = 'killfeed-entry';
      item.innerHTML = `<span class="kf-killer">${killer}</span> ${cause} <span class="kf-victim">${victim}</span>`;
      this.killfeedEl.appendChild(item);
      setTimeout(() => {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 4000);
    }

    updateLeaderboard(snakes, playerName) {
      if (!this.leaderboardEl || !snakes) return;
      const sorted = [...snakes].sort((a, b) => b.score - a.score);
      let html = '';
      sorted.forEach((s, idx) => {
        const isUser = s.isPlayer;
        const name = isUser ? (playerName || 'YOU') : `VIPER_0${s.id}`;
        const rowClass = `leaderboard-item ${isUser ? 'player-row' : ''} ${!s.alive ? 'dead' : ''}`;
        html += `
          <li class="${rowClass}">
            <span class="lb-rank">#${idx + 1}</span>
            <span class="lb-name">${name}</span>
            <span class="lb-score">${s.score}</span>
          </li>
        `;
      });
      this.leaderboardEl.innerHTML = html;
    }

    renderMinimap(player, storm, foods, snakes, arenaExtent = 80) {
      if (!this.minimapCtx) return;
      const ctx = this.minimapCtx;
      const w = this.minimapCanvas.width;
      const h = this.minimapCanvas.height;
      ctx.clearRect(0, 0, w, h);

      const scale = w / (arenaExtent * 2);
      const toX = (x) => (x + arenaExtent) * scale;
      const toY = (z) => (z + arenaExtent) * scale;

      // Arena bounds
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(2, 2, w - 4, h - 4);

      // Storm circle
      if (storm) {
        const cx = toX(storm.center.x);
        const cy = toY(storm.center.z);
        const cr = Math.max(0, storm.radius * scale);
        ctx.strokeStyle = 'rgba(255, 0, 85, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Food dots
      if (foods) {
        ctx.fillStyle = '#00ff66';
        for (const f of foods) {
          ctx.fillRect(toX(f.mesh.position.x) - 1, toY(f.mesh.position.z) - 1, 2, 2);
        }
      }

      // Enemy snakes
      if (snakes) {
        for (const s of snakes) {
          if (!s.alive || s.isPlayer) continue;
          const head = s.headPos();
          ctx.fillStyle = '#ffaa00';
          ctx.beginPath();
          ctx.arc(toX(head.x), toY(head.z), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Player
      if (player && player.alive) {
        const phead = player.headPos();
        ctx.fillStyle = '#00f3ff';
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(toX(phead.x), toY(phead.z), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (this.radarCoords) {
          this.radarCoords.innerText = `${Math.round(phead.x)}, ${Math.round(phead.z)}`;
        }
      }
    update(snapshot) {
      if (!snapshot) return;
      if (snapshot.players) {
        const myPlayer = snapshot.players.get ? snapshot.players.get(snapshot.my_id) : snapshot.players[snapshot.my_id];
        if (myPlayer) {
          this.updateStats(myPlayer.score || 0, myPlayer.length || 5, snapshot.player_count || 10, 1);
        }
      }
      if (snapshot.zone_radius !== undefined) {
        this.updateStorm(snapshot.zone_radius, false);
      }
    }
  }

  const instance = new HUD();
  global.ApexHUD = instance;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = instance;
  }
})(typeof window !== 'undefined' ? window : global);

export default (typeof window !== 'undefined' && window.ApexHUD) ? window.ApexHUD : null;
