/* MealMyDay – Beispiel-Planer („Probier's aus“ auf der Startseite). Reines JavaScript, keine Bibliotheken.
   Rechnet wie die App (src/logic/nutrition.ts) vollständig im Browser. Geladen wird nur beispiele.json vom eigenen
   Server – erst, wenn der Abschnitt in die Nähe scrollt oder jemand etwas antippt. Nichts wird gesendet oder gespeichert.
   Das Formular sieht aus wie „Neuer Plan“ in der App: Tagesziel-Karte, Makro-Kacheln und Rechenweg rechnen live mit.
   Das Ergebnis sieht aus wie „Mein Plan“ (Tagesbilanz mit Balken, eine Karte je Mahlzeit mit Makros und Zutaten),
   darunter die Einkaufsliste für den Tag wie in der App (zusammengezählt, aufgerundet, zum Abhaken).
   Beim ersten Hereinscrollen läuft einmal eine kurze Vorführung (Ziel, Ernährungsweise und Mahlzeiten tippen sich an,
   dann erscheint der Tag); sie bricht ab, sobald jemand selbst etwas antippt oder tippt.
   Bewegt werden nur die Balken (CSS-Übergang auf der Breite) und die hochzählende Kalorienzahl. */
(function () {
  'use strict';

  var sec = document.getElementById('ausprobieren');
  var form = document.getElementById('bp-form');
  var out = document.getElementById('bp-out');
  if (!sec || !form || !out || !window.fetch) return;
  var zielKcal = document.getElementById('bp-kcal'), makros = document.getElementById('bp-makros'), rechnung = document.getElementById('bp-rechnung');
  var mOut = document.getElementById('bp-m'), mMinus = document.getElementById('bp-minus'), mPlus = document.getElementById('bp-plus');
  if (!zielKcal || !makros || !rechnung || !mOut || !mMinus || !mPlus) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var data = null, loading = false, seen = false, idx = 0, run = 0, timer = 0, timers = [];
  var demo = 0;            /* Vorführung: 0 = steht noch aus, 1 = läuft, 2 = vorbei */
  var springen = false;    /* nach „Beispieltag erstellen“ auf dem Handy zum Ergebnis scrollen */
  var M_MIN = 3, M_MAX = 4; /* Mahlzeiten pro Tag, die beispiele.json kennt (die App kann 2 bis 6) */
  /* Symbol der Mahlzeit wie src/ui/mealLook.ts: Sonne, Schale, Mond – alles andere (Snack) ein Apfel */
  var LOOK = { 'Frühstück': 'sun', 'Mittagessen': 'bowl', 'Abendessen': 'moon' };

  function fmt(n) { return Math.round(n).toLocaleString('de-DE'); }
  function de(n) { return String(n).replace('.', ','); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  /* Inhalt austauschen. Liegt der Bereich ganz über dem Fenster (man liest schon weiter unten), um die Höhenänderung
     nachscrollen – sonst rutscht z. B. das Wartelisten-Formular nach dem Sprung von „Auf die Warteliste“ aus dem Bild. */
  function setze(html) {
    var drueber = out.getBoundingClientRect().bottom <= 0, vor = out.offsetHeight;
    out.innerHTML = html;
    var d = out.offsetHeight - vor;
    if (!drueber || !d) return;
    var root = document.documentElement, alt = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';            /* sofort, nicht weich – sonst sieht man den Ausgleich */
    window.scrollBy(0, d);
    root.style.scrollBehavior = alt;
  }
  function msg(cls, html) { setze('<p class="bp-msg' + cls + '">' + html + '</p>'); }

  /* ---- Eingaben lesen; Zahlen wie in der App begrenzt, leere Felder = Voreinstellung ---- */
  function num(name, def) { var v = parseFloat(String(form.elements[name].value).replace(',', '.')); return isNaN(v) ? def : v; }
  function lesen() {
    var f = form.elements;
    return {
      ziel: f.ziel.value, diet: f.diet.value, m: f.mahlzeiten.value, mann: f.sex.value === 'm', akt: parseFloat(f.akt.value) || 1.55,
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
    var pkg = e.ziel === 'halten' ? 1.2 : 1.8;
    var p = pkg * ref, c, f;
    if (e.diet === 'keto') { c = Math.min(40, kcal * 0.08 / 4); f = (kcal - 4 * p - 4 * c) / 9; }
    else {
      f = Math.max(kcal * 0.3 / 9, 0.8 * ref); c = (kcal - 4 * p - 9 * f) / 4;
      if (e.diet === 'paleo' && c > kcal * 0.3 / 4) { c = kcal * 0.3 / 4; f = (kcal - 4 * p - 4 * c) / 9; }
      if (c < 0) { c = 0; f = (kcal - 4 * p) / 9; }
    }
    return { kcal: kcal, min: min, p: p, c: c, f: Math.max(0, f), bmr: bmr, pkg: pkg };
  }

  /* ---- Tagesziel-Karte, Makro-Kacheln und Rechenweg im Formular nachführen (bei jeder Änderung, auch ohne Daten) ---- */
  function kopf() {
    var e = lesen(), z = ziele(e), b = makros.querySelectorAll('b');
    zielKcal.textContent = fmt(z.kcal);
    b[0].textContent = fmt(z.p) + ' g'; b[1].textContent = fmt(z.c) + ' g'; b[2].textContent = fmt(z.f) + ' g';
    rechnung.textContent = 'Grundumsatz ' + fmt(z.bmr) + ' kcal × Aktivität ' + de(e.akt) +
      (e.ziel === 'ab' ? ' − 400 kcal' : e.ziel === 'auf' ? ' + 300 kcal' : '') +
      (z.min ? ', aus Sicherheitsgründen nie unter 1.200 kcal.' : '.') + ' Eiweiß ' + de(z.pkg) + ' g pro kg Körpergewicht.';
  }

  /* ---- Stepper „Mahlzeiten pro Tag“: Wert im versteckten Feld, Knöpfe an den Grenzen gesperrt ---- */
  function setzeM(n) {
    n = clamp(n, M_MIN, M_MAX);
    form.elements.mahlzeiten.value = n;
    mOut.textContent = n;
    mMinus.disabled = n <= M_MIN;
    mPlus.disabled = n >= M_MAX;
  }

  /* ---- Mengentext der Zutat wie in der App: „2 Eier · 120 g“, „250 ml“, „150 g · ≈ 1 Paprika“, „80 g“ ---- */
  function halbe(n) { return (Math.floor(n) || '') + (n % 1 ? '½' : ''); }
  function menge(lm, g) {
    var st = lm[5], n;
    if (lm[8]) { n = Math.round(g / st); return n + ' ' + (n === 1 ? lm[6] : lm[7]) + ' · ' + fmt(g) + ' g'; }
    if (lm[9]) return fmt(g) + ' ml';
    if (st && (n = Math.round(g / st * 2) / 2) >= 0.5) return fmt(g) + ' g · ≈ ' + halbe(n) + ' ' + (n > 1 ? lm[7] : lm[6]);
    return fmt(g) + ' g';
  }
  /* ---- Menge auf der Einkaufsliste wie in der App (src/logic/shopping.ts): Stücke aufgerundet (knapp darunter zählt
          noch als voll), sonst auf 10 g bzw. ab 1 kg auf 50 g aufgerundet; „3 Zwiebeln (200 g)“, „1,25 kg“, „260 ml“ ---- */
  function einkaufMenge(lm, g) {
    var st = lm[5], n, r;
    if (st) { n = Math.ceil(g / st - 0.15) || 1; return n + ' ' + (n === 1 ? lm[6] : lm[7]) + (lm[8] ? '' : ' (' + fmt(g) + ' g)'); }
    r = g >= 1000 ? Math.ceil(g / 50) * 50 : Math.ceil(g / 10) * 10;
    return r >= 1000 ? (Math.round(r / 10) / 100).toLocaleString('de-DE') + (lm[9] ? ' l' : ' kg') : fmt(r) + (lm[9] ? ' ml' : ' g');
  }

  /* ---- Beispieltag der nächsten Kalorienstufe aufs Ziel hochrechnen, Mengen runden wie die App,
          dann kcal und Makros aus den gerundeten Mengen neu zusammenzählen; Zutaten für die Einkaufsliste sammeln ---- */
  function tag(e, z) {
    var best = data.stufen[0], i;
    data.stufen.forEach(function (s) { if (Math.abs(s - z.kcal) < Math.abs(best - z.kcal)) best = s; });
    var tage = data.tage[e.diet + '|' + e.ziel + '|' + e.m + '|' + best];
    if (!tage) return null;
    var t = tage[idx % tage.length], sum = 0, tot = [0, 0, 0, 0], meals = [], agg = {};
    t.forEach(function (m) { m[2].forEach(function (z) { sum += data.lm[z[0]][1] * z[1] / 100; }); });
    var s = z.kcal / sum;
    t.forEach(function (m) {
      if (m[1] < 0) return;
      var mk = [0, 0, 0, 0], ings = [];
      m[2].forEach(function (z) {
        var lm = data.lm[z[0]], g = z[1] * s, teile;
        g = lm[8] ? Math.max(lm[5], Math.round(g / lm[5]) * lm[5]) : Math.max(5, Math.round(g / 5) * 5);
        for (i = 0; i < 4; i++) mk[i] += lm[1 + i] * g / 100;
        agg[z[0]] = (agg[z[0]] || 0) + g;
        teile = menge(lm, g).split(' · ');
        ings.push({ amt: teile[0], name: lm[0], rest: teile.slice(1).join(' · ') });
      });
      for (i = 0; i < 4; i++) tot[i] += mk[i];
      meals.push({ bez: m[0], name: data.gerichte[m[1]], tot: mk, ings: ings });
    });
    var liste = Object.keys(agg).map(function (k) { return { name: data.lm[k][0], a: einkaufMenge(data.lm[k], agg[k]) }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
    return { meals: meals, tot: tot, n: tage.length, liste: liste };
  }

  /* ---- Ergebnis zeichnen: „Mein Plan“ mit Tagesbilanz, Mahlzeiten-Karten und „Anderer Vorschlag“, dann die Einkaufsliste ---- */
  function pct(ist, soll) { return soll > 0 ? Math.max(2, Math.min(100, Math.round(ist / soll * 100))) : 100; }
  function mrow(lab, cls, ist, soll) {
    return '<div class="mrow ' + cls + '" role="img" aria-label="' + lab + ': ' + fmt(ist) + ' von ' + fmt(soll) + ' Gramm"><b>' + lab + '</b>' +
      '<div class="bar"><i data-w="' + pct(ist, soll) + '"></i></div><span>' + fmt(ist) + ' von ' + fmt(soll) + ' g</span></div>';
  }
  function kacheln(t) {
    return '<div class="macros"><div class="macro m-p"><b>' + fmt(t[1]) + ' g</b><span>Eiweiß</span></div>' +
      '<div class="macro m-c"><b>' + fmt(t[2]) + ' g</b><span>Kohlenhydrate</span></div><div class="macro m-f"><b>' + fmt(t[3]) + ' g</b><span>Fett</span></div></div>';
  }
  function offenText(n) { return n === 1 ? '1 offener Artikel' : n + ' offene Artikel'; }
  function render(anim) {
    if (!data) return;
    var e = lesen(), z = ziele(e), t = tag(e, z), r = ++run;
    if (!t) { msg('', 'Für diese Kombination gibt es hier noch keinen Beispieltag – in der App schon.'); return; }
    var kc = t.tot[0];
    var h = '<h3>Mein Plan</h3><p class="sub">Beispieltag · ' + esc(e.m) + ' Mahlzeiten · Ziel ' + fmt(z.kcal) + ' kcal</p>' +
      '<div class="bilanz"><div class="bilanz-kopf"><p class="kcal-gross" aria-label="' + fmt(kc) + ' von ' + fmt(z.kcal) + ' Kilokalorien"><span class="num">' + fmt(kc) + '</span> <small>von ' + fmt(z.kcal) + ' kcal</small></p><span>Dein Tag</span></div>' +
      '<div class="bar"><i data-w="' + pct(kc, z.kcal) + '"></i></div><div class="mrows">' +
      mrow('Eiweiß', 'mp', t.tot[1], z.p) + mrow('Kohlenhydrate', 'mc', t.tot[2], z.c) + mrow('Fett', 'mf', t.tot[3], z.f) + '</div>' +
      (z.min ? '<p class="hint">Aus Sicherheitsgründen plant MealMyDay nie unter 1.200 kcal.</p>' : '') + '</div><div class="meals">';
    t.meals.forEach(function (m) {
      h += '<article class="meal"><div class="meal-head"><span class="tile"><svg class="ic" aria-hidden="true"><use href="#i-' + (LOOK[m.bez] || 'apple') + '"/></svg></span>' +
        '<div class="meal-text"><span class="meal-typ">' + esc(m.bez) + '</span><h4 class="meal-name">' + esc(m.name) + '</h4><span class="meal-info">' + fmt(m.tot[0]) + ' kcal</span></div></div>' +
        '<div class="meal-details">' + kacheln(m.tot) + '<div class="abschnitt"><b>Zutaten</b><ul class="ings">';
      m.ings.forEach(function (i) { h += '<li><b>' + esc(i.amt) + '</b><span>' + esc(i.name) + (i.rest ? ' <small>' + esc(i.rest) + '</small>' : '') + '</span></li>'; });
      h += '</ul></div></div></article>';
    });
    h += '</div><p class="bp-more"><button type="button" class="aktion" id="bp-next"><span><svg class="ic" aria-hidden="true"><use href="#i-shuffle"/></svg>Anderer Vorschlag</span><small>Vorschlag ' + (idx % t.n + 1) + ' von ' + t.n + '</small></button></p>';
    /* Einkaufsliste für diesen Tag (die Datei kennt keine Supermarkt-Bereiche – deshalb eine Karte, alphabetisch) */
    h += '<div class="shop-head"><div><h3>Einkaufsliste</h3><span class="sub" id="bp-offen">' + offenText(t.liste.length) + '</span></div></div>' +
      '<p class="sub">Alle Zutaten für diesen Tag, zusammengezählt und aufgerundet – in der App nach Supermarkt-Bereichen sortiert.</p>' +
      '<div class="shop"><div class="shop-cat"><b>Für diesen Tag</b><span id="bp-cat-offen">' + t.liste.length + ' offen</span></div><ul>';
    t.liste.forEach(function (it) {
      h += '<li><button type="button" class="shop-item" role="checkbox" aria-checked="false"><span class="box"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg></span><span>' + esc(it.name) + '</span><b>' + esc(it.a) + '</b></button></li>';
    });
    h += '</ul></div>';
    setze(h);

    var numEl = out.querySelector('.num'), bars = out.querySelectorAll('.bar i');
    function fuellen() { each(bars, function (b) { b.style.setProperty('--w', b.getAttribute('data-w') + '%'); }); }
    if (!anim || reduce.matches) { fuellen(); return; }
    out.setAttribute('aria-busy', 'true');
    requestAnimationFrame(fuellen);                              /* Balken wachsen über den CSS-Übergang */
    var t0 = performance.now();
    (function step(ts) {
      if (r !== run) return;                                   /* inzwischen neu gezeichnet */
      var p = clamp((ts - t0) / 900, 0, 1);
      numEl.textContent = fmt(kc * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step); else out.setAttribute('aria-busy', 'false');
    })(t0);
  }
  function plan(ms) { clearTimeout(timer); timer = setTimeout(function () { render(true); }, ms); }
  function zumErgebnis() {
    if (!springen) return;
    springen = false;
    if (window.innerWidth < 920) out.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
  }

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
        el.textContent = fmt(v);
      });
      bereit();
    }).catch(function () {
      loading = false;
      msg(' is-fehler', 'Die Beispieldaten konnten gerade nicht geladen werden. <button type="button" class="btn btn-ghost btn-sm" id="bp-retry">Noch einmal versuchen</button>');
    });
  }
  function bereit() {
    if (demo === 2 || reduce.matches || !('IntersectionObserver' in window)) { demo = 2; render(true); zumErgebnis(); }
    else if (seen) vorfuehrung();
    else msg('', 'Dein Beispieltag erscheint hier.');
  }

  /* ---- Vorführung: Muskelaufbau, Mediterran und 4 Mahlzeiten tippen sich nacheinander an, dann erscheint der Tag ---- */
  function vorfuehrung() {
    if (demo) return;
    demo = 1;
    msg('', 'Schau zu – gleich erscheint hier ein Beispieltag …');
    [['ziel', 'auf'], ['diet', 'mediterran'], ['m', 4]].forEach(function (s, i) {
      timers.push(setTimeout(function () {
        var el = s[0] === 'm' ? mPlus : form.querySelector('input[name="' + s[0] + '"][value="' + s[1] + '"]').parentNode;
        el.classList.add('is-tap');
        timers.push(setTimeout(function () {
          el.classList.remove('is-tap');
          if (s[0] === 'm') setzeM(s[1]); else el.firstElementChild.checked = true;
          kopf();
        }, 280));
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
    if (e.type === 'change' || e.type === 'input') { kopf(); if (data) plan(e.target.type === 'text' ? 300 : 0); }
    if (!data) load();
  }
  ['pointerdown', 'keydown', 'focusin', 'change', 'input'].forEach(function (t) { form.addEventListener(t, aktion, true); });
  mMinus.addEventListener('click', function () { setzeM(+form.elements.mahlzeiten.value - 1); kopf(); if (data) plan(0); });
  mPlus.addEventListener('click', function () { setzeM(+form.elements.mahlzeiten.value + 1); kopf(); if (data) plan(0); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    stopp();
    springen = true;
    if (!data) { load(); return; }                            /* zeichnet nach dem Laden (bereit) */
    clearTimeout(timer);
    render(true);
    zumErgebnis();
  });
  out.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'bp-next') { idx++; render(true); }
    else if (b.id === 'bp-retry') load();
    else if (b.classList.contains('shop-item')) {               /* Artikel abhaken (nur auf dieser Seite, nichts wird gespeichert) */
      b.setAttribute('aria-checked', b.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
      var offen = out.querySelectorAll('.shop-item[aria-checked="false"]').length;
      document.getElementById('bp-offen').textContent = offenText(offen);
      document.getElementById('bp-cat-offen').textContent = offen + ' offen';
    }
  });

  setzeM(+form.elements.mahlzeiten.value || M_MIN);
  kopf();
  msg('', 'Dein Beispieltag erscheint hier.');
  /* Beobachter liefern manchmal mehrere Einträge auf einmal (erst „nicht sichtbar“, dann „sichtbar“) – daher alle prüfen */
  function sichtbar(en) { return en.some(function (e) { return e.isIntersecting; }); }
  if ('IntersectionObserver' in window) {
    /* Daten holen, sobald der Abschnitt näher als 600 px an den sichtbaren Bereich kommt */
    new IntersectionObserver(function (en, io) {
      if (!sichtbar(en)) return;
      io.disconnect(); load();
    }, { rootMargin: '600px 0px' }).observe(sec);
    /* Vorführung, sobald das Formular eine Weile gut zu sehen ist (und die Daten da sind) – nicht schon beim schnellen
       Vorbeiscrollen, z. B. nach einem Tipp auf „Auf die Warteliste“; dann sähe sie ohnehin niemand */
    var warte = null;
    new IntersectionObserver(function (en, io) {
      if (!en[en.length - 1].isIntersecting) { clearTimeout(warte); warte = null; return; }
      if (warte) return;
      warte = setTimeout(function () {
        io.disconnect(); seen = true;
        if (data && demo === 0) vorfuehrung();
      }, 800);
    }, { threshold: 0.2 }).observe(form);
  } else load();
})();
