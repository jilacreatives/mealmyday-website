/* MealMyDay – Beispiel-Planer („Probier's aus“ auf der Startseite). Reines JavaScript, keine Bibliotheken.
   Rechnet wie die App (src/logic/nutrition.ts) vollständig im Browser. Geladen wird nur beispiele.json vom eigenen
   Server – erst, wenn der Abschnitt in die Nähe scrollt oder jemand etwas antippt. Nichts wird gesendet oder gespeichert.
   Beim ersten Hereinscrollen läuft einmal eine kurze Vorführung (drei Einstellungen tippen sich an, dann erscheint
   der Tag); sie bricht ab, sobald jemand selbst etwas antippt oder tippt. Bewegt werden nur transform und Text,
   dazu der Ring über stroke-dashoffset wie in der Geschichte. */
(function () {
  'use strict';

  var sec = document.getElementById('ausprobieren');
  var form = document.getElementById('bp-form');
  var out = document.getElementById('bp-out');
  if (!sec || !form || !out || !window.fetch) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var data = null, loading = false, seen = false, idx = 0, run = 0, timer = 0, timers = [];
  var demo = 0;            /* Vorführung: 0 = steht noch aus, 1 = läuft, 2 = vorbei */
  var RING = 213.6;        /* Umfang des Rings (r = 34) */

  function fmt(n) { return Math.round(n).toLocaleString('de-DE'); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function msg(cls, html) { out.innerHTML = '<p class="bp-msg' + cls + '">' + html + '</p>'; }

  /* ---- Eingaben lesen; Zahlen wie in der App begrenzt, leere Felder = Voreinstellung ---- */
  function num(name, def) { var v = parseFloat(String(form.elements[name].value).replace(',', '.')); return isNaN(v) ? def : v; }
  function lesen() {
    var f = form.elements;
    return {
      ziel: f.ziel.value, diet: f.diet.value, m: f.mahlzeiten.value, mann: f.sex.value === 'm', akt: parseFloat(f.akt.value),
      alter: clamp(num('alter', 30), 16, 90), h: clamp(num('groesse', 178), 130, 220), w: clamp(num('gewicht', 78), 40, 200)
    };
  }

  /* ---- Kalorienziel (Mifflin-St Jeor × Aktivität ± Ziel) und Makro-Ziele, genau wie die App ---- */
  function ziele(e) {
    var bmr = 10 * e.w + 6.25 * e.h - 5 * e.alter + (e.mann ? 5 : -161);
    var kcal = Math.round((bmr * e.akt + (e.ziel === 'ab' ? -400 : e.ziel === 'auf' ? 300 : 0)) / 10) * 10;
    var min = kcal < 1200;
    kcal = clamp(kcal, 1200, 5000);
    var hm = e.h / 100, ref = e.w / (hm * hm) > 30 ? Math.round(25 * hm * hm) : e.w;
    var p = (e.ziel === 'halten' ? 1.2 : 1.8) * ref, c, f;
    if (e.diet === 'keto') { c = Math.min(40, kcal * 0.08 / 4); f = (kcal - 4 * p - 4 * c) / 9; }
    else {
      f = Math.max(kcal * 0.3 / 9, 0.8 * ref); c = (kcal - 4 * p - 9 * f) / 4;
      if (e.diet === 'paleo' && c > kcal * 0.3 / 4) { c = kcal * 0.3 / 4; f = (kcal - 4 * p - 4 * c) / 9; }
      if (c < 0) { c = 0; f = (kcal - 4 * p) / 9; }
    }
    return { kcal: kcal, min: min, p: p, c: c, f: Math.max(0, f) };
  }

  /* ---- Mengentext wie in der App: „2 Eier · 120 g“, „250 ml“, „150 g · ≈ 1 Paprika“, „80 g“ ---- */
  function halbe(n) { return (Math.floor(n) || '') + (n % 1 ? '½' : ''); }
  function menge(lm, g) {
    var st = lm[5], n;
    if (lm[8]) { n = Math.round(g / st); return n + ' ' + (n === 1 ? lm[6] : lm[7]) + ' · ' + fmt(g) + ' g'; }
    if (lm[9]) return fmt(g) + ' ml';
    if (st && (n = Math.round(g / st * 2) / 2) >= 0.5) return fmt(g) + ' g · ≈ ' + halbe(n) + ' ' + (n > 1 ? lm[7] : lm[6]);
    return fmt(g) + ' g';
  }

  /* ---- Beispieltag der nächsten Kalorienstufe aufs Ziel hochrechnen, Mengen runden wie die App,
          dann kcal und Makros aus den gerundeten Mengen neu zusammenzählen ---- */
  function tag(e, z) {
    var best = data.stufen[0], i;
    data.stufen.forEach(function (s) { if (Math.abs(s - z.kcal) < Math.abs(best - z.kcal)) best = s; });
    var tage = data.tage[e.diet + '|' + e.ziel + '|' + e.m + '|' + best];
    if (!tage) return null;
    var t = tage[idx % tage.length], sum = 0, tot = [0, 0, 0, 0], meals = [];
    t.forEach(function (m) { m[2].forEach(function (z) { sum += data.lm[z[0]][1] * z[1] / 100; }); });
    var s = z.kcal / sum;
    t.forEach(function (m) {
      if (m[1] < 0) return;
      var mk = [0, 0, 0, 0], ings = [];
      m[2].forEach(function (z) {
        var lm = data.lm[z[0]], g = z[1] * s;
        g = lm[8] ? Math.max(lm[5], Math.round(g / lm[5]) * lm[5]) : Math.max(5, Math.round(g / 5) * 5);
        for (i = 0; i < 4; i++) mk[i] += lm[1 + i] * g / 100;
        ings.push('<li><span>' + esc(lm[0]) + '</span><b>' + menge(lm, g) + '</b></li>');
      });
      for (i = 0; i < 4; i++) tot[i] += mk[i];
      meals.push({ bez: m[0], name: data.gerichte[m[1]], kcal: mk[0], ings: ings.join('') });
    });
    return { meals: meals, tot: tot, n: tage.length };
  }

  /* ---- Ergebnis zeichnen: Tagesbilanz mit Ring, drei Makro-Balken, eine Karte je Mahlzeit; Zahlen zählen hoch ---- */
  function bar(lab, cls, ist, soll) {
    return '<span>' + lab + '</span><span class="pbar ' + cls + '"><i data-w="' + (soll ? Math.min(1, ist / soll) : 1).toFixed(3) + '"></i></span><b>' + fmt(ist) + ' / ' + fmt(soll) + ' g</b>';
  }
  function render(anim) {
    if (!data) return;
    var e = lesen(), z = ziele(e), t = tag(e, z), r = ++run;
    if (!t) { msg('', 'Für diese Kombination gibt es hier noch keinen Beispieltag – in der App schon.'); return; }
    var kc = t.tot[0], share = Math.min(1, kc / z.kcal);
    var h = '<div class="balance"><svg class="ring-svg" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring-bg" cx="40" cy="40" r="34"/><circle class="ring-fg" cx="40" cy="40" r="34" style="stroke-dashoffset:' + RING + '"/></svg>' +
      '<div><p class="bal-num"><span class="num">' + fmt(kc) + '</span> von ' + fmt(z.kcal) + ' kcal</p><p class="bal-sub">' +
      (z.min ? 'Aus Sicherheitsgründen plant MealMyDay nie unter 1.200 kcal.' : 'Tagesbilanz – passt zu deinem Ziel.') + '</p></div></div>' +
      '<div class="bp-mb"><p class="lab">Makros · im Tag / Ziel</p><div class="mb">' + bar('Eiweiß', 'p', t.tot[1], z.p) + bar('Kohlenhydrate', 'c', t.tot[2], z.c) + bar('Fett', 'f', t.tot[3], z.f) + '</div></div><ul class="bp-meals">';
    t.meals.forEach(function (m, i) {
      h += '<li class="bp-meal" style="--i:' + i + '"><p class="lab">' + esc(m.bez) + '</p><h4><span>' + esc(m.name) + '</span><span class="kcal">' + fmt(m.kcal) + ' kcal</span></h4><ul class="bp-ings">' + m.ings + '</ul></li>';
    });
    h += '</ul><p class="bp-more"><button type="button" class="btn btn-ghost btn-sm" id="bp-next">Anderer Vorschlag</button><span>Vorschlag ' + (idx % t.n + 1) + ' von ' + t.n + '</span></p>';
    out.innerHTML = h;

    var numEl = out.querySelector('.num'), ring = out.querySelector('.ring-fg'), bars = out.querySelectorAll('.pbar i');
    function draw(p) {
      numEl.textContent = fmt(kc * p);
      ring.style.strokeDashoffset = (RING * (1 - share * p)).toFixed(1);
      each(bars, function (b) { b.style.transform = 'scaleX(' + (b.getAttribute('data-w') * p).toFixed(3) + ')'; });
    }
    if (!anim || reduce.matches) { draw(1); return; }
    out.setAttribute('aria-busy', 'true');
    var t0 = performance.now();
    (function step(ts) {
      if (r !== run) return;                                   /* inzwischen neu gezeichnet */
      var p = clamp((ts - t0) / 1000, 0, 1);
      draw(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step); else out.setAttribute('aria-busy', 'false');
    })(t0);
  }
  function plan(ms) { clearTimeout(timer); timer = setTimeout(function () { render(true); }, ms); }

  /* ---- Daten einmal laden; Eckdaten aus der Datei übernehmen („über 800“ = auf volle Hundert abgerundet) ---- */
  function load() {
    if (data || loading) return;
    loading = true;
    msg('', 'Beispieltag wird geladen …');
    fetch('beispiele.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      data = d;
      each(sec.querySelectorAll('[data-fact]'), function (el) {
        var k = el.getAttribute('data-fact'), v = d.eckdaten && d.eckdaten[k];
        if (!v) return;
        if (k === 'gerichte') v = Math.floor(v / 100) * 100;
        el.setAttribute('data-n', v); el.textContent = fmt(v);
      });
      bereit();
    }).catch(function () {
      loading = false;
      msg(' is-fehler', 'Die Beispieldaten konnten gerade nicht geladen werden. <button type="button" class="btn btn-ghost btn-sm" id="bp-retry">Noch einmal versuchen</button>');
    });
  }
  function bereit() {
    if (demo === 2 || reduce.matches || !('IntersectionObserver' in window)) { demo = 2; render(true); }
    else if (seen) vorfuehrung();
    else msg('', 'Dein Beispieltag erscheint hier.');
  }

  /* ---- Vorführung: Muskelaufbau, Mediterran, 4 Mahlzeiten tippen sich nacheinander an, dann erscheint der Tag ---- */
  function vorfuehrung() {
    if (demo) return;
    demo = 1;
    msg('', 'Schau zu – gleich erscheint hier ein Beispieltag …');
    [['ziel', 'auf'], ['diet', 'mediterran'], ['mahlzeiten', '4']].forEach(function (s, i) {
      timers.push(setTimeout(function () {
        var inp = form.querySelector('input[name="' + s[0] + '"][value="' + s[1] + '"]'), lab = inp.parentNode;
        lab.classList.add('is-tap');
        timers.push(setTimeout(function () { lab.classList.remove('is-tap'); inp.checked = true; }, 280));
      }, 600 + i * 750));
    });
    timers.push(setTimeout(function () { demo = 2; render(true); }, 2950));
  }
  function stopp() {
    if (demo === 2) return;
    var lief = demo === 1;
    demo = 2;
    timers.forEach(clearTimeout);
    each(form.querySelectorAll('.is-tap'), function (l) { l.classList.remove('is-tap'); });
    if (lief) plan(0);
  }

  /* ---- Ereignisse: jede Berührung beendet die Vorführung; Änderungen rechnen sofort neu (Zahlenfelder nach 300 ms) ---- */
  function aktion(e) {
    stopp();
    if (!data) { load(); return; }
    if (e.type === 'change' || e.type === 'input') plan(e.target.type === 'text' ? 300 : 0);
  }
  ['pointerdown', 'keydown', 'focusin', 'change', 'input'].forEach(function (t) { form.addEventListener(t, aktion, true); });
  out.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'bp-next') { idx++; render(true); }
    else if (b.id === 'bp-retry') load();
  });

  msg('', 'Dein Beispieltag erscheint hier.');
  /* Beobachter liefern manchmal mehrere Einträge auf einmal (erst „nicht sichtbar“, dann „sichtbar“) – daher alle prüfen */
  function sichtbar(en) { return en.some(function (e) { return e.isIntersecting; }); }
  if ('IntersectionObserver' in window) {
    /* Daten holen, sobald der Abschnitt näher als 600 px an den sichtbaren Bereich kommt */
    new IntersectionObserver(function (en, io) {
      if (!sichtbar(en)) return;
      io.disconnect(); load();
    }, { rootMargin: '600px 0px' }).observe(sec);
    /* Vorführung, sobald das Formular gut zu sehen ist (und die Daten da sind) */
    new IntersectionObserver(function (en, io) {
      if (!sichtbar(en)) return;
      io.disconnect(); seen = true;
      if (data && demo === 0) vorfuehrung();
    }, { threshold: 0.35 }).observe(form);
  } else load();
})();
