/* MealMyDay – Scroll-Animationen für die Startseite.
   Reines JavaScript, keine Bibliotheken, keine externen Anfragen.
   - Hereingleiten von Abschnitten (IntersectionObserver), dabei zählen Zahlen mit der Klasse cnt hoch
   - kleine Schleifen (Klasse live) laufen nur, solange das Element sichtbar ist (Klasse is-on)
   Bei „prefers-reduced-motion: reduce“ oder ohne JavaScript bleibt alles statisch im Endzustand (so steht es im HTML).
   Es werden nur transform und opacity animiert (auch die Balken der Tagesbilanz wachsen über scaleX). */
(function () {
  'use strict';

  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var revealIO = null;
  var liveIO = null;

  /* ---- Hilfsfunktionen ---- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* Anteil von p innerhalb des Fensters [a, b], begrenzt auf 0 … 1 */
  function win(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function fmt(n) { return n.toLocaleString('de-DE'); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ---- Hereingleiten beim Scrollen; Zahlen mit der Klasse cnt zählen dabei bis data-n hoch ---- */
  function countUp(el) {
    var n = parseInt(el.getAttribute('data-n'), 10), t0 = 0;
    (function step(ts) {
      if (!t0) t0 = ts + 300;
      var t = easeOut(win(ts, t0, t0 + 1100));
      el.textContent = fmt(t < 1 && root.classList.contains('anim') ? Math.round(n * t) : n);
      if (t < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  function startReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { each(els, function (e) { e.classList.add('in'); }); return; }
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          each(en.target.querySelectorAll('.cnt'), countUp);
          revealIO.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    each(els, function (e) { revealIO.observe(e); });
  }
  function stopReveal() {
    if (revealIO) revealIO.disconnect();
    revealIO = null;
    each(document.querySelectorAll('.reveal.in'), function (e) { e.classList.remove('in'); });
    each(document.querySelectorAll('.cnt'), function (e) { e.textContent = fmt(parseInt(e.getAttribute('data-n'), 10)); });
  }

  /* ---- Schleifen (Klasse live) laufen nur, solange das Element sichtbar ist; ohne Beobachter bleiben sie aus ---- */
  function startLive() {
    if (!('IntersectionObserver' in window)) return;
    liveIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('is-on', en.isIntersecting);
        if (en.target.classList.contains('pick')) { if (en.isIntersecting) pickStart(en.target); else pickStop(en.target, false); }
      });
    }, { threshold: 0.25 });
    each(document.querySelectorAll('.live'), function (e) { liveIO.observe(e); });
  }
  function stopLive() {
    if (liveIO) liveIO.disconnect();
    liveIO = null;
    each(document.querySelectorAll('.live.is-on'), function (e) { e.classList.remove('is-on'); });
    each(document.querySelectorAll('.live.pick'), function (e) { pickStop(e, true); });
  }

  /* ---- „Passt zu dir“: in jeder Reihe ist genau eine Pille gewählt (is-on); reihum springt die Auswahl einer Reihe
          zur nächsten Pille, wie beim Antippen. Läuft nur, solange die Karte sichtbar ist; ohne Bewegung ist nichts gewählt. ---- */
  function pickStart(el) {
    if (el._takt) return;
    var reihen = Array.prototype.map.call(el.querySelectorAll('.pick-row'), function (r) { return r.querySelectorAll('.chip'); });
    if (!el._wahl) el._wahl = [-1, -1, -1];   /* Start ohne Auswahl; die ersten Takte wählen Reihe für Reihe die erste Pille */
    var reihe = 0;
    function zeigen() {
      reihen.forEach(function (chips, i) { each(chips, function (c, j) { c.classList.toggle('is-on', j === el._wahl[i]); }); });
    }
    zeigen();
    el._takt = setInterval(function () {
      el._wahl[reihe] = (el._wahl[reihe] + 1) % reihen[reihe].length;
      zeigen();
      reihe = (reihe + 1) % reihen.length;
    }, 1300);
  }
  function pickStop(el, leeren) {
    clearInterval(el._takt);
    el._takt = 0;
    if (leeren) each(el.querySelectorAll('.chip.is-on'), function (c) { c.classList.remove('is-on'); });
  }

  /* ---- Ein- und Ausschalten je nach Systemeinstellung ---- */
  function enable() {
    if (root.classList.contains('anim')) return;
    root.classList.add('anim');
    startReveal();
    startLive();
  }
  function disable() {
    root.classList.remove('anim');
    stopReveal();
    stopLive();
  }
  /* Zum Prüfen des statischen Zustands lässt sich die Bewegung auch per Adresse abschalten: index.html?motion=reduce */
  var forcedOff = /[?&]motion=reduce\b/.test(window.location.search);
  if (!mq.matches && !forcedOff) enable();
  function onChange(e) { if (e.matches || forcedOff) disable(); else enable(); }
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
})();
