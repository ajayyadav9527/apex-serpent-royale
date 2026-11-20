// utils/EventBus.js
// FROZEN interface — see ARCHITECTURE.md §12.1

const _listeners = new Map();

const EventBus = {
  /**
   * @param {string} event
   * @param {Function} cb
   */
  on(event, cb) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(cb);
  },

  /**
   * @param {string} event
   * @param {Function} cb
   */
  off(event, cb) {
    _listeners.get(event)?.delete(cb);
  },

  /**
   * @param {string} event
   * @param {*} payload
   */
  emit(event, payload) {
    _listeners.get(event)?.forEach(cb => {
      try { cb(payload); }
      catch (e) { console.error(`[EventBus] Error in listener for "${event}":`, e); }
    });
  },
};

export default EventBus;
