/* RadyoAI audience measurement, v1. No SDK, cookies, storage or persistent ID.
 * Does not touch playback. Counts page sessions, not identified people/devices.
 * Call RadioAIAnalytics.start() only after the site's collection policy allows it.
 */
(function () {
  'use strict';
  if (window.RadioAIAnalytics) return;

  var ENDPOINT = 'https://eu.i.posthog.com/i/v0/e/';
  // Public, write-only project token. Never add a personal/read API key here.
  var TOKEN = 'phc_wbHTGkwKJ8hLTdepqhpwk2D7bRgn3whXABqY4hEoxtwE';
  var active = null;

  function prohibited() {
    return navigator.globalPrivacyControl === true ||
      navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' ||
      window.doNotTrack === '1';
  }
  function id() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (!window.crypto || !window.crypto.getRandomValues) return null;
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  function start() {
    if (active || prohibited() || typeof window.fetch !== 'function') return false;
    var session = id();
    if (!session) return false;
    var now = function () { return performance.now(); };
    var round = function (n) { return Math.round(n * 1000) / 1000; };
    var visibleTotal = 0, listeningTotal = 0, lastVisible = 0, lastListening = 0;
    var previousTime = now(), previousVisible = !document.hidden;
    var pageOpen = true, stopped = false, sequence = 0, lastSentAt = -Infinity;
    var lastSignature = '', pending = null, cleanups = [];
    var decks = ['audio', 'audio-buffer'].map(function (name) { return document.getElementById(name); })
      .filter(Boolean).map(function (el) {
        return { el: el, position: el.currentTime || 0, source: el.currentSrc || el.src,
          audible: !el.muted && el.volume > 0, running: !el.paused && el.readyState >= 3,
          seeking: el.seeking, lastProgress: -Infinity };
      });

    function on(target, event, fn) {
      target.addEventListener(event, fn);
      cleanups.push(function () { target.removeEventListener(event, fn); });
    }
    function sample() {
      var t = now(), elapsed = Math.max(0, (t - previousTime) / 1000), heard = 0;
      // A suspended browser is not proof of foreground attention.
      if (pageOpen && previousVisible) visibleTotal += Math.min(elapsed, 5);
      decks.forEach(function (d) {
        var el = d.el, position = Number(el.currentTime) || 0;
        var source = el.currentSrc || el.src, rate = Number(el.playbackRate) || 1;
        var advance = position - d.position;
        if (pageOpen && d.audible && d.running && !d.seeking && !el.seeking &&
            source === d.source && advance > 0 && advance <= elapsed * rate + 0.5) {
          // Use the union of both decks, so crossfade never doubles duration.
          heard = Math.max(heard, Math.min(advance / rate, elapsed, 120));
          d.lastProgress = t;
        }
        d.position = position; d.source = source;
        d.audible = !el.muted && el.volume > 0;
        d.seeking = el.seeking;
      });
      listeningTotal += heard;
      previousTime = t; previousVisible = !document.hidden;
    }
    function listening() {
      var t = now();
      return pageOpen && decks.some(function (d) {
        var el = d.el;
        return d.running && !el.paused && !el.ended && !el.seeking &&
          !el.muted && el.volume > 0 && el.readyState >= 2 && t - d.lastProgress < 10000;
      });
    }
    function signature() {
      return [pageOpen, pageOpen && !document.hidden, listening()].join(':');
    }
    function send(event, properties) {
      if (stopped || prohibited()) return;
      var props = {
        distinct_id: session,
        page_session_id: session,
        $session_id: session,
        $process_person_profile: false,
        $geoip_disable: true,
        // Server project must also have Discard client IP data enabled.
        $ip: null,
        // Never send location.href/search/hash/referrer: gift links contain names.
        $current_url: 'https://radioai.com.tr/',
        $host: 'radioai.com.tr',
        $pathname: '/',
        analytics_version: 1
      };
      Object.keys(properties).forEach(function (key) { props[key] = properties[key]; });
      var payload = JSON.stringify({ api_key: TOKEN, event: event, uuid: id(), properties: props });
      try {
        window.fetch(ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors',
          keepalive: true, body: payload
        }).catch(function () {});
      } catch (e) { /* Analytics failure must not affect the player. */ }
    }
    function flush(reason) {
      if (stopped) return;
      if (pending !== null) { clearTimeout(pending); pending = null; }
      sample();
      send('radio_activity', {
        sequence: ++sequence, page_open: pageOpen,
        page_visible: pageOpen && !document.hidden, is_listening: listening(),
        visible_seconds_total: round(visibleTotal),
        listening_seconds_total: round(listeningTotal),
        visible_seconds_delta: round(visibleTotal - lastVisible),
        listening_seconds_delta: round(listeningTotal - lastListening),
        reason: reason
      });
      lastVisible = visibleTotal; lastListening = listeningTotal;
      lastSentAt = now(); lastSignature = signature();
    }
    function changed() {
      if (!pageOpen || stopped || signature() === lastSignature || pending !== null) return;
      pending = setTimeout(function () {
        pending = null;
        if (signature() !== lastSignature) flush('state');
      }, Math.max(500, 5000 - (now() - lastSentAt)));
    }
    decks.forEach(function (d) {
      ['playing', 'pause', 'waiting', 'ended', 'emptied', 'error', 'seeking', 'seeked', 'volumechange', 'ratechange', 'timeupdate'].forEach(function (name) {
        on(d.el, name, function () {
          if (!pageOpen || stopped) return;
          sample();
          if (name === 'playing') d.running = true;
          if (['pause', 'waiting', 'ended', 'emptied', 'error', 'seeking'].indexOf(name) >= 0) d.running = false;
          if (name === 'seeked') d.running = !d.el.paused && d.el.readyState >= 3;
          changed();
        });
      });
    });
    on(document, 'visibilitychange', function () {
      if (!pageOpen || stopped) return;
      sample();
      // Send before mobile browsers freeze hidden pages. This is not a page exit.
      flush('state');
    });
    on(window, 'pagehide', function () {
      if (!pageOpen || stopped) return;
      sample(); pageOpen = false; flush('pagehide');
    });
    on(window, 'pageshow', function (event) {
      if (!event.persisted || stopped) return;
      // A bfcache restore resumes the same page session, without a second visit.
      previousTime = now(); previousVisible = !document.hidden; pageOpen = true;
      decks.forEach(function (d) {
        d.position = d.el.currentTime || 0; d.source = d.el.currentSrc || d.el.src;
        d.running = !d.el.paused && d.el.readyState >= 3; d.lastProgress = -Infinity;
      });
      flush('pageshow');
    });
    var ticker = setInterval(function () {
      if (!pageOpen || stopped) return;
      if (prohibited()) { stop(); return; }
      sample(); changed();
      // Local sampling is every second; network heartbeat is only once a minute.
      if (now() - lastSentAt >= 60000 && (!document.hidden || listening())) flush('heartbeat');
    }, 1000);
    function stop() {
      if (stopped) return;
      sample(); pageOpen = false;
      if (!prohibited()) flush('stop');
      stopped = true; clearInterval(ticker);
      if (pending !== null) clearTimeout(pending);
      cleanups.forEach(function (cleanup) { cleanup(); });
      active = null;
    }
    active = { stop: stop };
    send('$pageview', { page_visible: !document.hidden });
    flush('start');
    return true;
  }
  window.RadioAIAnalytics = {
    start: start,
    stop: function () { if (active) active.stop(); }
  };
})();
