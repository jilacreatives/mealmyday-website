/* MealMyDay – Probeplan („Probier's aus“ auf der Startseite). Reines JavaScript, keine Bibliotheken.
   Ein Knopf öffnet ein Fenster (<dialog>) mit vier kurzen Schritten: über dich, Ziel und Aktivität, Ernährungsweise und
   Mahlzeiten, Allergien. Danach „wird zusammengestellt …“ und ein Beispieltag – „So könnte dein Tag aussehen“.
   Rechnet wie die App (src/logic/nutrition.ts) vollständig im Browser. Die Tage kommen aus beispiele.json (vom Skript
   website:beispiele der App, mit den Allergenen je Lebensmittel); geladen werden sie erst, wenn der Abschnitt in die Nähe
   scrollt oder jemand den Knopf antippt. Nichts wird gesendet oder gespeichert.
   Allergien: Enthält eine Mahlzeit des Beispieltags ein ausgeschlossenes Allergen, nimmt der Probeplan dieselbe Mahlzeit
   (Frühstück, Mittagessen …) aus einem anderen Beispieltag gleicher Ernährungsweise, gleichen Ziels und gleicher
   Mahlzeitenzahl – zuerst aus der passenden Kalorienstufe – und rechnet sie auf den Anteil der ersetzten Mahlzeit. */
(function () {
  'use strict';

  var sec = document.getElementById('ausprobieren');
  var dlg = document.getElementById('pp-dialog');
  var start = document.getElementById('pp-start');
  var form = document.getElementById('pp-form');
  if (!sec || !dlg || !start || !form || !window.fetch || typeof dlg.showModal !== 'function') return;

  var out = document.getElementById('pp-out');
  var inhalt = document.getElementById('pp-inhalt');
  var schrittEl = document.getElementById('pp-schritt');
  var balken = document.getElementById('pp-balken');
  var zurueck = document.getElementById('pp-zurueck');
  var weiter = document.getElementById('pp-weiter');
  var seiten = dlg.querySelectorAll('.pp-seite');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var data = null, laden = null, s = 1, idx = 0, run = 0, bauTimer = [];
  var FRAGEN = 4;
  var LOOK = { 'Frühstück': 'sun', 'Mittagessen': 'bowl', 'Abendessen': 'moon' };
  var ZIEL_TEXT = { ab: 'Abnehmen', halten: 'Gewicht halten', auf: 'Muskelaufbau' };
  var DIET_TEXT = { alles: 'alles drin', pesce: 'pescetarisch', vegetarisch: 'vegetarisch', vegan: 'vegan', mediterran: 'mediterran', paleo: 'Paleo', keto: 'Keto', halal: 'halal' };
  var ALLERGEN_TEXT = { gluten: 'Gluten', laktose: 'Laktose', milch: 'Milch', ei: 'Eier', nuss: 'Nüsse', erdnuss: 'Erdnüsse', soja: 'Soja', fisch: 'Fisch', krebs: 'Krebstiere', weich: 'Weichtiere', sellerie: 'Sellerie', senf: 'Senf', sesam: 'Sesam', sulfit: 'Sulfite', lupine: 'Lupinen' };

  function fmt(n) { return Math.round(n).toLocaleString('de-DE'); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function wert(name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
  function zahl(name) { var v = parseFloat(String(form.elements[name].value).replace(',', '.')); return isNaN(v) ? NaN : v; }
  function liste(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' und ' + arr[arr.length - 1]; }

  /* ---- Daten einmal laden; Eckdaten aus der Datei übernehmen („über 750“ = auf volle Fünfzig abgerundet) ---- */
  function load() {
    if (laden) return laden;
    laden = fetch('beispiele.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      data = d;
      each(document.querySelectorAll('[data-fact]'), function (el) {
        var k = el.getAttribute('data-fact'), v = d.eckdaten && d.eckdaten[k];
        if (!v) return;
        if (k === 'gerichte') v = Math.floor(v / 50) * 50;
        el.setAttribute('data-n', v); el.textContent = fmt(v);
      });
      return d;
    });
    laden.catch(function () { laden = null; });
    return laden;
  }

  /* ---- Eingaben lesen und prüfen (Grenzen wie in der App: ab 16 Jahren) ---- */
  function lesen() {
    var al = [];
    each(form.querySelectorAll('input[name="allergie"]:checked'), function (c) { if (c.value !== 'keine') al.push(c.value); });
    return {
      mann: wert('sex') === 'm', alter: zahl('alter'), h: zahl('groesse'), w: zahl('gewicht'),
      ziel: wert('ziel'), akt: parseFloat(wert('akt')), diet: wert('diet') || 'alles', m: wert('mahlzeiten') || '3', al: al
    };
  }
  function pruefen(nr) {
    var e = lesen(), f = '';
    if (nr === 1) {
      if (!wert('sex')) f = 'Bitte wähle Frau oder Mann.';
      else if (isNaN(e.alter)) f = 'Bitte gib dein Alter ein.';
      else if (e.alter < 16) f = 'MealMyDay ist für Menschen ab 16 Jahren.';
      else if (e.alter > 90) f = 'Bitte gib ein Alter bis 90 Jahre ein.';
      else if (isNaN(e.h) || e.h < 130 || e.h > 220) f = 'Bitte gib deine Größe in cm ein (130 bis 220).';
      else if (isNaN(e.w) || e.w < 40 || e.w > 200) f = 'Bitte gib dein Gewicht in kg ein (40 bis 200).';
    } else if (nr === 2) {
      if (!e.ziel) f = 'Bitte wähle dein Ziel.';
      else if (!e.akt) f = 'Bitte wähle, wie aktiv du bist.';
    }
    var el = document.getElementById('pp-fehler-' + nr);
    if (el) el.textContent = f;
    if (f) {
      var feld = nr === 1 && !wert('sex') ? form.querySelector('input[name="sex"]')
        : nr === 1 ? form.elements[isNaN(e.alter) || e.alter < 16 || e.alter > 90 ? 'alter' : isNaN(e.h) || e.h < 130 || e.h > 220 ? 'groesse' : 'gewicht']
        : form.querySelector('input[name="' + (!e.ziel ? 'ziel' : 'akt') + '"]');
      if (feld) feld.focus();
    }
    return !f;
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

  /* ---- Beispieltag: Tag der nächsten Kalorienstufe, Mahlzeiten mit Allergenen ersetzt, aufs Ziel hochgerechnet ---- */
  function kcalVon(m) { var k = 0; m[2].forEach(function (z) { k += data.lm[z[0]][1] * z[1] / 100; }); return k; }
  function frei(m, al) { return m[2].every(function (z) { var a = data.lm[z[0]][10] || []; return !a.some(function (x) { return al.indexOf(x) >= 0; }); }); }
  function tag(e, z) {
    var stufen = data.stufen.slice().sort(function (a, b) { return Math.abs(a - z.kcal) - Math.abs(b - z.kcal); });
    var vorrat = [];
    stufen.forEach(function (st) { (data.tage[e.diet + '|' + e.ziel + '|' + e.m + '|' + st] || []).forEach(function (t) { vorrat.push(t); }); });
    var eigene = data.tage[e.diet + '|' + e.ziel + '|' + e.m + '|' + stufen[0]];
    if (!eigene) return null;
    var basis = eigene[idx % eigene.length], benutzt = {}, plan = [], i, j;
    basis.forEach(function (m) { if (frei(m, e.al)) benutzt[m[1]] = 1; });
    for (i = 0; i < basis.length; i++) {
      var m = basis[i], f = 1;
      if (!frei(m, e.al)) {
        var ersatz = null;
        /* der Reihe nach durch die Tage gehen, beim aktuellen Vorschlag beginnen – so bringt „Anderer Vorschlag“ auch andere Ersatzgerichte */
        for (j = 0; j < vorrat.length && !ersatz; j++) {
          var k = vorrat[(j + idx) % vorrat.length][i];
          if (k && k[0] === m[0] && !benutzt[k[1]] && frei(k, e.al)) ersatz = k;
        }
        if (!ersatz) return null;
        benutzt[ersatz[1]] = 1;
        f = kcalVon(m) / kcalVon(ersatz);
        m = ersatz;
      }
      plan.push({ m: m, f: f });
    }
    var sum = 0, tot = [0, 0, 0, 0], meals = [];
    plan.forEach(function (p) { sum += kcalVon(p.m) * p.f; });
    var sk = z.kcal / sum;
    plan.forEach(function (p) {
      var mk = [0, 0, 0, 0], ings = [];
      p.m[2].forEach(function (zz) {
        var lm = data.lm[zz[0]], g = zz[1] * p.f * sk, teile;
        g = lm[8] ? Math.max(lm[5], Math.round(g / lm[5]) * lm[5]) : Math.max(5, Math.round(g / 5) * 5);
        for (var q = 0; q < 4; q++) mk[q] += lm[1 + q] * g / 100;
        teile = menge(lm, g).split(' · ');
        ings.push('<li><b>' + esc(teile[0]) + '</b><span>' + esc(lm[0]) + (teile[1] ? ' <small>' + esc(teile.slice(1).join(' · ')) + '</small>' : '') + '</span></li>');
      });
      for (var q = 0; q < 4; q++) tot[q] += mk[q];
      meals.push({ bez: p.m[0], name: data.gerichte[p.m[1]], bild: data.bilder ? data.bilder[p.m[1]] : '', tot: mk, ings: ings.join('') });
    });
    return { meals: meals, tot: tot, n: eigene.length };
  }

  /* ---- Ergebnis zeichnen im Design von „Mein Plan“ in der App: Karte „Dein Tag“ mit Kalorien, Eiweiß, Kohlenhydraten
          und Fett (Balken mit Zielmarke, „2.245 von 2.150“), darunter die Mahlzeiten an der grünen Zeitleiste – je eine
          Karte mit Foto, Name und „kcal · Eiweiß“, aufgeklappt mit Makro-Kacheln und Zutaten (die erste ist offen) –
          und am Ende die Tagesbilanz. Zahl und Balken wachsen beim Zeichnen. ---- */
  function zeile(lab, cls, ist, soll, einheit) {
    var max = Math.max(ist, soll) * 1.08 || 1;
    return '<div class="pa-zeile ' + cls + '"><span class="pa-name">' + lab + '</span><span class="pa-spur"><i data-w="' + (ist / max).toFixed(3) + '"></i>' +
      '<b style="left:' + (soll / max * 100).toFixed(1) + '%"></b></span><span class="pa-wert"><b' + (cls === 'pa-k' ? ' class="num"' : '') + '>' + fmt(ist) + '</b> von ' + fmt(soll) + (einheit ? ' ' + einheit : '') + '</span></div>';
  }
  function kachel(cls, g, lab) { return '<div class="pa-m ' + cls + '"><b>' + fmt(g) + ' g</b><span>' + lab + '</span></div>'; }
  var PFEIL = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  function zeichnen() {
    var e = lesen(), z = ziele(e), t = tag(e, z), r = ++run;
    var zus = 'Für dein Ziel „' + ZIEL_TEXT[e.ziel] + '“ mit ' + fmt(z.kcal) + ' kcal am Tag – ' + DIET_TEXT[e.diet] + ', ' + e.m + ' Mahlzeiten' +
      (e.al.length ? ', ohne ' + liste(e.al.map(function (a) { return ALLERGEN_TEXT[a]; })) : '') + '.';
    document.getElementById('pp-zusammen').textContent = zus;
    if (!t) {
      out.innerHTML = '<p class="bp-msg">Für diese Auswahl findet die Website gerade keinen passenden Beispieltag – die App hat viel mehr Gerichte. Probier es mit weniger Allergien oder einer anderen Ernährungsweise.</p>';
      return;
    }
    var kc = t.tot[0];
    /* „im Ziel“ nur, wenn Kalorien und Eiweiß wirklich nah dran sind (nach dem Tausch wegen Allergien nicht immer) */
    var passt = Math.abs(kc / z.kcal - 1) <= 0.05 && Math.abs(t.tot[1] / z.p - 1) <= 0.15;
    var h = '<div class="pa-bilanz"><p class="pa-label">Dein Tag</p>' +
      zeile('Kalorien', 'pa-k', kc, z.kcal, '') + zeile('Eiweiß', 'pa-p', t.tot[1], z.p, 'g') +
      zeile('Kohlenh.', 'pa-c', t.tot[2], z.c, 'g') + zeile('Fett', 'pa-f', t.tot[3], z.f, 'g') + '</div><ol class="pa-zeit">';
    t.meals.forEach(function (m, i) {
      h += '<li class="pa-mahlzeit" style="--i:' + i + '"><p class="pa-typ">' + esc(m.bez) + '</p><details class="pa-karte"><summary>' +
        (m.bild
          ? '<img class="pa-bild" src="assets/gerichte/' + encodeURIComponent(m.bild) + '" alt="" width="56" height="56" decoding="async">'
          : '<span class="pa-bild tile tile-green"><svg class="ic" aria-hidden="true"><use href="#i-' + (LOOK[m.bez] || 'apple') + '"/></svg></span>') +
        '<span class="pa-text"><b>' + esc(m.name) + '</b><small>' + fmt(m.tot[0]) + ' kcal · ' + fmt(m.tot[1]) + ' g Eiweiß</small></span>' + PFEIL + '</summary>' +
        '<div class="pa-auf"><div class="pa-makros">' + kachel('pa-mp', m.tot[1], 'Eiweiß') + kachel('pa-mc', m.tot[2], 'Kohlenh.') + kachel('pa-mf', m.tot[3], 'Fett') + '</div>' +
        '<h5>Zutaten</h5><ul class="pa-zutaten">' + m.ings + '</ul></div></details></li>';
    });
    h += '<li class="pa-ende" style="--i:' + t.meals.length + '"><p class="pa-typ">Tagesbilanz</p><p><b>' + fmt(kc) + ' kcal</b> · ' + fmt(t.tot[1]) + ' g Eiweiß' + (passt ? ' · im Ziel' : '') + '</p></li></ol>' +
      '<p class="pa-hinweis">' + (z.min ? 'Aus Sicherheitsgründen plant MealMyDay nie unter 1.200 kcal.' : passt ? 'Kalorien und Eiweiß passen zu deinem Ziel.' : 'In der App werden die Mengen genau auf deine Ziele gerechnet.') + '</p>';
    out.innerHTML = h;
    var numEl = out.querySelector('.num'), bars = out.querySelectorAll('.pa-spur i');
    function draw(p) {
      numEl.textContent = fmt(kc * p);
      each(bars, function (b) { b.style.transform = 'scaleX(' + (b.getAttribute('data-w') * p).toFixed(3) + ')'; });
    }
    if (reduce.matches) { draw(1); return; }
    var t0 = performance.now();
    (function step(ts) {
      if (r !== run) return;
      var p = clamp((ts - t0) / 1000, 0, 1);
      draw(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---- Schritte: Seite zeigen, Fortschritt, Knöpfe unten ---- */
  function zeige(nr, rueck) {
    s = nr;
    each(seiten, function (sei) {
      var an = Number(sei.getAttribute('data-s')) === nr;
      sei.hidden = !an;
      if (an) { sei.classList.remove('pp-rein', 'pp-rein-zurueck'); void sei.offsetWidth; sei.classList.add(rueck ? 'pp-rein-zurueck' : 'pp-rein'); }
    });
    inhalt.scrollTop = 0;
    dlg.setAttribute('data-schritt', nr);
    schrittEl.textContent = nr <= FRAGEN ? 'Schritt ' + nr + ' von ' + FRAGEN : nr === 5 ? 'Einen Moment …' : 'Fertig';
    balken.style.transform = 'scaleX(' + Math.min(1, (nr - 1) / FRAGEN + (nr > FRAGEN ? 0 : 0.06)) + ')';
    zurueck.hidden = nr === 1 || nr === 5;
    zurueck.textContent = nr === 6 ? 'Angaben ändern' : 'Zurück';
    weiter.hidden = nr === 5;
    weiter.textContent = nr === FRAGEN ? 'Probeplan erstellen' : nr === 6 ? 'Anderer Vorschlag' : 'Weiter';
  }

  /* „Wird zusammengestellt“: drei Haken nacheinander, dann das Ergebnis (wartet, bis die Daten da sind) */
  function bauen() {
    zeige(5);
    var punkte = dlg.querySelectorAll('.pp-liste li'), schnell = reduce.matches, fertig = false, daten = false;
    each(punkte, function (li) { li.classList.remove('is-fertig'); });
    bauTimer.forEach(clearTimeout); bauTimer = [];
    each(punkte, function (li, i) { bauTimer.push(setTimeout(function () { li.classList.add('is-fertig'); }, schnell ? 0 : 450 + i * 550)); });
    bauTimer.push(setTimeout(function () { fertig = true; weiterZumErgebnis(); }, schnell ? 300 : 2200));
    function weiterZumErgebnis() { if (fertig && daten && s === 5) { zeige(6); zeichnen(); } }
    load().then(function () { daten = true; weiterZumErgebnis(); }, function () {
      bauTimer.forEach(clearTimeout);
      zeige(6);
      document.getElementById('pp-zusammen').textContent = '';
      out.innerHTML = '<p class="bp-msg is-fehler">Die Beispieldaten konnten gerade nicht geladen werden. Bitte versuch es gleich noch einmal.</p>';
    });
  }

  function oeffnen() {
    load();
    if (s === 5) zeige(1);
    else zeige(s);
    document.documentElement.classList.add('pp-offen');
    dlg.showModal();
    var erstes = dlg.querySelector('.pp-seite:not([hidden]) input');
    if (erstes && s === 1) erstes.focus({ preventScroll: true });
  }
  function schliessen() { dlg.close(); }

  start.addEventListener('click', function (ev) { ev.preventDefault(); oeffnen(); });
  dlg.addEventListener('close', function () { document.documentElement.classList.remove('pp-offen'); bauTimer.forEach(clearTimeout); if (s === 5) s = 4; });
  document.getElementById('pp-zu').addEventListener('click', schliessen);
  /* Klick auf den abgedunkelten Rand schließt (nur, wenn auch dort losgelassen wird) */
  var randDruck = false;
  dlg.addEventListener('pointerdown', function (ev) { randDruck = ev.target === dlg; });
  dlg.addEventListener('click', function (ev) { if (randDruck && ev.target === dlg) schliessen(); randDruck = false; });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (s < FRAGEN) { if (pruefen(s)) zeige(s + 1); }
    else if (s === FRAGEN) bauen();
    else if (s === 6) { idx++; zeichnen(); inhalt.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' }); }
  });
  zurueck.addEventListener('click', function () { if (s === 6) { idx = 0; zeige(1, true); } else if (s > 1) zeige(s - 1, true); });
  /* Fehlertext verschwindet, sobald man etwas ändert; „Keine“ und einzelne Allergien schließen sich aus */
  form.addEventListener('change', function (ev) {
    var t = ev.target;
    var f = document.getElementById('pp-fehler-' + s); if (f) f.textContent = '';
    if (t.name === 'allergie') {
      var keine = form.querySelector('input[name="allergie"][value="keine"]');
      if (t.value === 'keine' && t.checked) each(form.querySelectorAll('input[name="allergie"]'), function (c) { if (c !== keine) c.checked = false; });
      else if (t.checked) keine.checked = false;
      if (!form.querySelector('input[name="allergie"]:checked')) keine.checked = true;
    }
    if (t.name === 'sex' || t.name === 'ziel' || t.name === 'akt' || t.name === 'diet' || t.name === 'mahlzeiten') idx = 0;
  });
  form.addEventListener('input', function () { var f = document.getElementById('pp-fehler-' + s); if (f) f.textContent = ''; });

  /* Daten holen, sobald der Abschnitt näher als 600 px an den sichtbaren Bereich kommt */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en, io) {
      if (!en.some(function (x) { return x.isIntersecting; })) return;
      io.disconnect(); load();
    }, { rootMargin: '600px 0px' }).observe(sec);
  }
  /* Striche um den Knopf zeichnen sich, sobald er zu sehen ist */
  var knopf = sec.querySelector('.pp-knopf');
  if (knopf && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en, io) {
      if (!en.some(function (x) { return x.isIntersecting; })) return;
      io.disconnect(); knopf.classList.add('is-da');
    }, { threshold: 0.6 }).observe(knopf);
  } else if (knopf) knopf.classList.add('is-da');
})();
