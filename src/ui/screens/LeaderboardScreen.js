/**
 * APEX SERPENT ROYALE — LeaderboardScreen.js
 * Session and All-Time Leaderboard Component
 * Version: 1.0.0
 * ARCHITECTURE.md §6.3
 */

'use strict';

export class LeaderboardScreen {
  constructor(listEl) {
    this.listEl = listEl || document.getElementById('leaderboard-items');
  }

  render(snakes, playerName = 'CYBER_VIPER_01') {
    if (!this.listEl || !snakes) return;
    const sorted = [...snakes].sort((a, b) => b.score - a.score);
    let html = '';
    sorted.forEach((s, idx) => {
      const isUser = s.isPlayer;
      const name = isUser ? playerName : `VIPER_0${s.id}`;
      const rowClass = `leaderboard-item ${isUser ? 'player-row' : ''} ${!s.alive ? 'dead' : ''}`;
      html += `
        <li class="${rowClass}">
          <span class="lb-rank">#${idx + 1}</span>
          <span class="lb-name">${name}</span>
          <span class="lb-score">${s.score}</span>
        </li>
      `;
    });
    this.listEl.innerHTML = html;
  }
}

export default new LeaderboardScreen();
