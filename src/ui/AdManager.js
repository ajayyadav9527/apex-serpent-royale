/**
 * APEX SERPENT ROYALE — AdManager.js
 * Adsterra & Monetag Multi-Network Monetization Engine
 * Version: 2.0.0
 * FROZEN Contract: ARCHITECTURE.md §7, §12.3
 */

'use strict';

(function (global) {
  const STORAGE_KEY = 'apex_adsterra_config';
  const COOLDOWN_KEY = 'apex_directlink_last_ts';
  const INTERSTITIAL_GUARD_KEY = 'ad_interstitial_shown';
  const BUFF_KEY = 'apex_adblock_reward_buff';

  const AD_UNIT_IDS = {
    LEADERBOARD:   'asr-ad-leaderboard',
    RECTANGLE:     'asr-ad-rectangle',
    MOBILE_FOOTER: 'asr-ad-mobile-footer',
    INTERSTITIAL:  'asr-ad-interstitial',
    SOCIAL_BAR:    'asr-ad-social-bar',
    MONETAG_MULTI: 'monetag-multitag-container',
    MONETAG_IPP:   'monetag-ipp-slot'
  };

  const defaultConfig = {
    adNetwork: 'hybrid', // 'hybrid' (Adsterra Banners + Monetag IPP/Vignette), 'adsterra', or 'monetag'
    directLinkUrl: 'https://www.profitablecpmrate.com/example_directlink',
    monetagSmartlink: 'https://alwingulla.com/example_monetag_smartlink',
    monetagZone: 'MONETAG_ZONE_12345',
    cooldownSeconds: 60,
    keySocialBar: 'ADSTERRA_SOCIAL_BAR_KEY',
    key728: 'ADSTERRA_KEY_728x90',
    key300: 'ADSTERRA_KEY_300x250',
    key320: 'ADSTERRA_KEY_320x50',
    mockMode: 'enabled',
    dragonSkinMatches: 0,
    magnetPackActive: false
  };

  class AdsterraManager {
    constructor() {
      this.config = { ...defaultConfig };
      this.loadConfig();
      this._initRefreshLoop();
    }

    loadConfig() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) this.config = { ...defaultConfig, ...JSON.parse(saved) };
      } catch (e) {
        console.warn('[AdManager] Storage access failed:', e);
      }
    }

    getConfig() {
      return this.config;
    }

    saveConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
        this.log('[AdManager] Configuration saved to localStorage.');
      } catch (e) {}
    }

    log(msg) {
      console.log(msg);
      const logBox = document.getElementById('ad-event-log');
      if (logBox) {
        const time = new Date().toLocaleTimeString();
        logBox.innerHTML = `[${time}] ${msg}<br>` + logBox.innerHTML;
      }
    }

    canTriggerDirectLink() {
      const lastTs = parseInt(sessionStorage.getItem(COOLDOWN_KEY) || '0', 10);
      const diffSec = (Date.now() - lastTs) / 1000;
      return diffSec >= this.config.cooldownSeconds;
    }

    markDirectLinkTriggered() {
      sessionStorage.setItem(COOLDOWN_KEY, Date.now().toString());
    }

    // Direct Link / Smartlink Trigger (on high intent CTA or Game Over)
    triggerDirectLink(source = 'general', force = false) {
      return this.triggerSmartLink(source, force);
    }

    triggerSmartLink(source = 'general', force = false) {
      if (!force && !this.canTriggerDirectLink()) {
        this.log(`[SmartLink] Blocked by cooldown (${this.config.cooldownSeconds}s). Source: ${source}`);
        return false;
      }

      this.markDirectLinkTriggered();

      // Dual-network smart routing
      let targetUrl = this.config.directLinkUrl;
      if (this.config.adNetwork === 'monetag' || source.startsWith('monetag_') || (this.config.adNetwork === 'hybrid' && (source.includes('rewarded') || Math.random() > 0.5))) {
        targetUrl = this.config.monetagSmartlink || this.config.directLinkUrl;
      }

      this.log(`[SmartLink] (${this.config.adNetwork.toUpperCase()}) Triggered from: ${source} -> ${targetUrl}`);

      try {
        const win = window.open(targetUrl, '_blank');
        if (win) {
          win.focus();
        } else {
          this.log('[SmartLink] Window popup blocked by browser policy.');
        }
      } catch (e) {
        this.log(`[SmartLink] Exception: ${e.message}`);
      }
      return true;
    }

    // Monetag Vignette Interstitial Hook (Game Over natural pause point only)
    triggerVignette() {
      if (this.config.adNetwork !== 'hybrid' && this.config.adNetwork !== 'monetag') {
        this.log('[Monetag] Vignette skipped: adNetwork is ' + this.config.adNetwork);
        return false;
      }

      if (!this.canTriggerDirectLink()) {
        this.log(`[Monetag] Vignette skipped: frequency cooldown (${this.config.cooldownSeconds}s) active.`);
        return false;
      }

      this.markDirectLinkTriggered();
      this.log('[Monetag] Vignette interstitial activated at match conclusion pause point.');

      if (typeof window !== 'undefined' && window.show_8923412) {
        try { window.show_8923412(); } catch(e) {}
      } else {
        this.log('[Monetag] MultiTag simulated vignette overlay ready.');
      }
      return true;
    }

    // Interstitial popunder: 1-session guard
    triggerInterstitial() {
      if (sessionStorage.getItem(INTERSTITIAL_GUARD_KEY)) {
        this.log('[AdManager] Interstitial already triggered for this session. Skipping.');
        return false;
      }
      sessionStorage.setItem(INTERSTITIAL_GUARD_KEY, 'true');
      this.log('[AdManager] Triggering one-shot session interstitial...');
      return this.triggerDirectLink('interstitial_session', true);
    }

    unlockDragonSkin() {
      this.triggerSmartLink('rewarded_dragon_skin', true);
      this.config.dragonSkinMatches = 3;
      this.saveConfig({ dragonSkinMatches: 3 });
      const swatch = document.getElementById('swatch-dragon-skin');
      if (swatch) swatch.style.display = 'flex';
      if (typeof alert !== 'undefined') alert('🐉 VIP Cyber Dragon Skin UNLOCKED for 3 matches!');
      this.log('[Rewarded] VIP Dragon skin awarded for 3 matches.');
    }

    activateMagnetPack() {
      this.triggerSmartLink('rewarded_magnet_pack', true);
      this.config.magnetPackActive = true;
      this.saveConfig({ magnetPackActive: true });
      const btn = document.getElementById('btn-magnet-pack');
      if (btn) {
        btn.innerText = '✓ BUFF ACTIVE (+30s)';
        btn.style.color = 'var(--green)';
        btn.style.borderColor = 'var(--green)';
      }
      if (typeof alert !== 'undefined') alert('🧲 Magnet Starter Pack ACTIVATED! You will start your next match with a 30s Magnet aura.');
      this.log('[Rewarded] Magnet Starter Pack activated.');
    }

    checkAdBlock() {
      const badge = document.getElementById('adblock-detector-badge');
      const badgeText = document.getElementById('adblock-badge-text');
      if (!badge || !badgeText) return;

      const hasBuff = localStorage.getItem(BUFF_KEY) === 'true';
      if (hasBuff) {
        badge.classList.add('buff-active');
        badgeText.innerText = '⚡ +20% Boost Stamina Active!';
        if (typeof window !== 'undefined') window.apexMaxStamina = 120;
        return;
      }

      badgeText.innerText = '🛡️ AdBlock Detected: Click for +20% Boost Stamina!';
      badge.onclick = () => {
        this.triggerSmartLink('adblock_support_whitelist', true);
        localStorage.setItem(BUFF_KEY, 'true');
        badge.classList.add('buff-active');
        badgeText.innerText = '⚡ +20% Boost Stamina Unlocked!';
        if (typeof window !== 'undefined') window.apexMaxStamina = 120;
        if (typeof alert !== 'undefined') alert('⚡ Gaming Buff Granted: Turbo Boost stamina boosted to 120%!');
      };
    }

    refreshBanners() {
      this.log(`[AdManager] Refreshing inventory (Network: ${this.config.adNetwork.toUpperCase()})...`);
      const isAdsterraActive = this.config.adNetwork === 'hybrid' || this.config.adNetwork === 'adsterra';
      const isMonetagActive = this.config.adNetwork === 'hybrid' || this.config.adNetwork === 'monetag';

      if (typeof document !== 'undefined') {
        document.querySelectorAll('.adsterra-mock-banner').forEach(el => {
          el.style.display = isAdsterraActive ? 'block' : 'none';
          el.style.opacity = '0.5';
          setTimeout(() => { el.style.opacity = '1'; }, 200);
        });

        const socialBar = document.getElementById('asr-ad-social-bar');
        if (socialBar) {
          socialBar.style.display = isAdsterraActive ? 'flex' : 'none';
        }

        const ippSlot = document.getElementById('monetag-ipp-slot');
        if (ippSlot) {
          ippSlot.style.display = isMonetagActive ? 'flex' : 'none';
        }
      }
    }

    _initRefreshLoop() {
      setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          this.refreshBanners();
        }
      }, 60000);
    }
  }

  const instance = new AdsterraManager();
  global.AdManager = instance;
  global.ApexAdManager = instance;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = instance;
  }
})(typeof window !== 'undefined' ? window : global);

export default (typeof window !== 'undefined' && window.AdManager) ? window.AdManager : null;
