/**
 * APEX SERPENT ROYALE — TouchControls.js
 * Mobile Virtual Joystick & Boost Touch Handler
 * Version: 1.0.0
 * FROZEN Contract: ARCHITECTURE.md §6.2, §12.4
 */

'use strict';

(function (global) {
  class TouchControls {
    constructor() {
      this.onInput = null; // (dx: number, dz: number, boost: boolean) => void
      this.joystickZone = null;
      this.joystickThumb = null;
      this.boostBtn = null;
      this.active = false;
      this.boosting = false;
      this.maxDist = 40;
      this.currentDx = 1;
      this.currentDz = 0;
    }

    init(options = {}) {
      this.joystickZone = options.joystickZone || document.getElementById('joystick-zone');
      this.joystickThumb = options.joystickThumb || document.getElementById('joystick-thumb');
      this.boostBtn = options.boostBtn || document.getElementById('mobile-boost-btn');

      if (!this.joystickZone || !this.joystickThumb) {
        console.warn('[TouchControls] Joystick elements not found.');
        return;
      }

      this._bindJoystick();
      if (this.boostBtn) this._bindBoost();
      this._bindKeyboardFallback();
    }

    _bindJoystick() {
      const zone = this.joystickZone;
      const thumb = this.joystickThumb;

      const handleTouch = (e) => {
        e.preventDefault();
        const touch = e.targetTouches[0];
        const rect = zone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.maxDist) {
          dx = (dx / dist) * this.maxDist;
          dy = (dy / dist) * this.maxDist;
        }

        thumb.style.transform = `translate(${dx}px, ${dy}px)`;

        if (dist > 8) {
          let targetX = 0;
          let targetZ = 0;
          if (Math.abs(dx) > Math.abs(dy)) {
            targetX = dx > 0 ? 1 : -1;
          } else {
            targetZ = dy > 0 ? 1 : -1;
          }
          this.currentDx = targetX;
          this.currentDz = targetZ;
          this._emit();
        }
      };

      const reset = () => {
        this.active = false;
        thumb.style.transform = 'translate(0, 0)';
      };

      zone.addEventListener('touchstart', (e) => {
        this.active = true;
        handleTouch(e);
      }, { passive: false });

      zone.addEventListener('touchmove', (e) => {
        if (this.active) handleTouch(e);
      }, { passive: false });

      zone.addEventListener('touchend', reset);
      zone.addEventListener('touchcancel', reset);
    }

    _bindBoost() {
      const btn = this.boostBtn;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        btn.classList.add('active');
        this.boosting = true;
        this._emit();
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        this.boosting = false;
        this._emit();
      });
    }

    _bindKeyboardFallback() {
      window.addEventListener('keydown', (e) => {
        const dirMap = {
          ArrowUp: [0, -1], KeyW: [0, -1],
          ArrowDown: [0, 1], KeyS: [0, 1],
          ArrowLeft: [-1, 0], KeyA: [-1, 0],
          ArrowRight: [1, 0], KeyD: [1, 0],
        };
        if (dirMap[e.code]) {
          this.currentDx = dirMap[e.code][0];
          this.currentDz = dirMap[e.code][1];
          this._emit();
        }
        if (e.code === 'Space') {
          this.boosting = true;
          this._emit();
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          this.boosting = false;
          this._emit();
        }
      });
    }

    _emit() {
      if (typeof this.onInput === 'function') {
        this.onInput(this.currentDx, this.currentDz, this.boosting);
      }
    }
  }

  const instance = new TouchControls();
  global.TouchControls = instance;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = instance;
  }
})(typeof window !== 'undefined' ? window : global);

export default (typeof window !== 'undefined' && window.TouchControls) ? window.TouchControls : null;
