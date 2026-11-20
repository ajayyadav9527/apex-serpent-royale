/**
 * APEX SERPENT ROYALE — LobbyScreen.js
 * Lobby & Main Menu Interface
 * Version: 1.0.0
 * ARCHITECTURE.md §6.3
 */

'use strict';

export class LobbyScreen {
  constructor(container) {
    this.container = container || document.getElementById('modal-lobby');
    this.onStart = null;
  }

  show() {
    if (this.container) this.container.style.display = 'flex';
  }

  hide() {
    if (this.container) this.container.style.display = 'none';
  }

  getPlayerConfig() {
    const nameEl = document.getElementById('player-callsign');
    const name = nameEl ? nameEl.value.trim() : 'CYBER_VIPER_01';
    const activeSwatch = document.querySelector('.skin-swatch.active');
    const color = activeSwatch ? parseInt(activeSwatch.dataset.color, 16) : 0x00f3ff;
    return { name, color };
  }
}

export default new LobbyScreen();
