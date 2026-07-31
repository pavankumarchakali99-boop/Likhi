/**
 * core/event-bus/event-bus.js
 *
 * Milestone 1 — Foundation Infrastructure.
 *
 * A minimal, synchronous publish/subscribe bus. This is a leaf module:
 * it has no dependencies on any other Likhi module and knows nothing
 * about persistence, state, or the DOM.
 *
 * Loaded as a classic script (not an ES module) so the app continues to
 * work when opened directly via file:// with no local server, matching
 * the existing app's "100% client-side" behavior.
 *
 * Publishing is deliberately synchronous — no queuing, no setTimeout,
 * no promises — to preserve the app's existing implicit ordering
 * guarantees between state changes and UI updates.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};

  function EventBus() {
    this._handlers = {};
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * @param {string} eventName
   * @param {function(*):void} handler
   * @returns {function():void} unsubscribe
   */
  EventBus.prototype.subscribe = function (eventName, handler) {
    if (typeof handler !== 'function') {
      throw new Error('[EventBus] subscribe requires a function handler for "' + eventName + '"');
    }
    if (!this._handlers[eventName]) {
      this._handlers[eventName] = [];
    }
    this._handlers[eventName].push(handler);

    var self = this;
    return function unsubscribe() {
      self.unsubscribe(eventName, handler);
    };
  };

  /**
   * Remove a previously-registered handler for an event.
   * @param {string} eventName
   * @param {function(*):void} handler
   */
  EventBus.prototype.unsubscribe = function (eventName, handler) {
    var list = this._handlers[eventName];
    if (!list) return;
    var idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  };

  /**
   * Publish an event synchronously to all current subscribers.
   * A handler throwing does not prevent other handlers from running.
   * @param {string} eventName
   * @param {*} [payload]
   */
  EventBus.prototype.publish = function (eventName, payload) {
    var list = this._handlers[eventName];
    if (!list || list.length === 0) return;
    // Snapshot the list so a handler that subscribes/unsubscribes
    // during dispatch doesn't affect the current publish cycle.
    list.slice().forEach(function (handler) {
      try {
        handler(payload);
      } catch (err) {
        console.error('[EventBus] handler error for "' + eventName + '":', err);
      }
    });
  };

  // Single shared instance used across the app, consistent with the
  // rest of Milestone 1's modules (Persistence, Store) also being
  // shared singletons attached to the Likhi namespace.
  Likhi.EventBus = new EventBus();

})(window);
