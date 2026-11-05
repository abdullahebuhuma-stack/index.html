/* RadyoAI yayın akışı şeridi.
   Saatler Türkiye saatidir (UTC+3, yaz/kış saati yok).
   Cuma/cumartesi canlı set hazır olunca SETS_READY = true yap.
   Yeni şarkı prömiyeri için PREMIERE doldur: { title:'Şarkı adı', at:'2026-11-06T21:00:00+03:00' } */
(function (root) {
  var AKIS = {
    SETS_READY: false,
    SET: { days: [5, 6], startH: 23, durH: 2, name: 'CANLI DJ SET' },
    PREMIERE: null
  };
  var H = 3600e3, D = 86400e3, TR = 3 * H;
  var GUN = ['PAZAR', 'PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ'];

  function kalan(ms) {
    var dk = Math.max(1, Math.round(ms / 60000));
    if (dk < 60) return dk + ' DK';
    var sa = Math.floor(dk / 60), r = dk % 60;
    if (sa < 48) return sa + ' SA ' + (r < 10 ? '0' : '') + r + ' DK';
    return Math.floor(sa / 24) + ' GÜN';
  }

  function text(now, cfg) {
    cfg = cfg || AKIS;
    var ist = now + TR, bugun = Math.floor(ist / D) * D;
    var best = null, live = null;
    if (cfg.SETS_READY) {
      for (var k = -1; k <= 8; k++) {
        var b = bugun + k * D, dow = new Date(b).getUTCDay();
        if (cfg.SET.days.indexOf(dow) < 0) continue;
        var s = b + cfg.SET.startH * H, e = s + cfg.SET.durH * H;
        if (ist >= s && ist < e) { live = e; break; }
        if (s > ist && (!best || s < best.s)) best = { s: s, dow: dow };
      }
    }
    if (live) {
      var eh = new Date(live).getUTCHours();
      return cfg.SET.name + ' · ' + (eh < 10 ? '0' : '') + eh + ":00'A KADAR";
    }
    var pr = cfg.PREMIERE, prMs = pr ? Date.parse(pr.at) - now : -1;
    if (pr && prMs > 0 && prMs < 7 * D && (!best || prMs < best.s - ist)) {
      return 'PRÖMİYER: ' + String(pr.title).toLocaleUpperCase('tr-TR') + ' · ' + kalan(prMs);
    }
    if (best) {
      var sh = cfg.SET.startH;
      return 'SIRADA: ' + GUN[best.dow] + ' ' + (sh < 10 ? '0' : '') + sh + ':00 ' + cfg.SET.name + ' · ' + kalan(best.s - ist);
    }
    return null;
  }

  function init() {
    var el = document.getElementById('akis');
    if (!el) return;
    function tick() {
      var t = text(Date.now());
      if (t) { el.textContent = t; el.hidden = false; } else { el.hidden = true; }
    }
    tick();
    setInterval(tick, 30000);
  }

  root.RadyoAkis = { text: text, config: AKIS };
  try {
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
