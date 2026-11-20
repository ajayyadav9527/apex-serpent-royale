/**
 * Discord Embedded App SDK Minimal Polyfill / Shim
 * Ensures compatibility under Discord Activity iframes without throwing errors.
 */
(function() {
  if (typeof window !== 'undefined') {
    window.DiscordSDK = window.DiscordSDK || function(clientId) {
      this.clientId = clientId;
      this.channelId = null;
      this.guildId = null;
      this.ready = async function() { return true; };
      this.subscribe = async function(event, callback) {};
      this.unsubscribe = async function(event, callback) {};
      this.commands = {
        authorize: async function() { return { code: 'shim_code' }; },
        authenticate: async function() { return { access_token: 'shim_token' }; },
        openExternalLink: function(url) { window.open(url, '_blank'); }
      };
    };
  }
})();
