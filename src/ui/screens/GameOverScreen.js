/**
 * APEX SERPENT ROYALE — GameOverScreen.js
 * Match Victory & Elimination Screen with Rewarded Ad Revival
 * Version: 1.0.0
 * ARCHITECTURE.md §6.3, §7.3
 */

'use strict';

export class GameOverScreen {
  constructor(container) {
    this.container = container || document.getElementById('modal-gameover');
    this.onPlayAgain = null;
    this.onRevive = null;
    this.onMenu = null;
  }

  show(isVictory, stats = {}) {
    const titleEl = document.getElementById('gameover-title');
    const subtitleEl = document.getElementById('gameover-subtitle');
    const scoreEl = document.getElementById('stat-final-score');
    const lengthEl = document.getElementById('stat-final-length');
    const rankEl = document.getElementById('stat-final-rank');
    const reviveBox = document.getElementById('revive-offer-box');

    if (scoreEl) scoreEl.innerText = stats.score || 0;
    if (lengthEl) lengthEl.innerText = stats.length || 5;
    if (rankEl) rankEl.innerText = `#${stats.rank || 10}`;

    if (isVictory) {
      if (titleEl) {
        titleEl.innerText = '🏆 VICTORY ROYALE!';
        titleEl.style.color = 'var(--yellow)';
        titleEl.style.textShadow = '0 0 20px var(--yellow)';
      }
      if (subtitleEl) subtitleEl.innerText = 'APEX PREDATOR SURVIVED THE ELECTRIC STORM';
      if (reviveBox) reviveBox.style.display = 'none';
    } else {
      if (titleEl) {
        titleEl.innerText = '💀 ELIMINATED';
        titleEl.style.color = 'var(--magenta)';
        titleEl.style.textShadow = '0 0 20px var(--magenta)';
      }
      if (subtitleEl) subtitleEl.innerText = `CIRCUIT DESTROYED // MATCH RANK #${stats.rank || 10}`;
      if (reviveBox) reviveBox.style.display = 'flex';
    }

    if (this.container) this.container.style.display = 'flex';
  }

  hide() {
    if (this.container) this.container.style.display = 'none';
  }
}

export default new GameOverScreen();
