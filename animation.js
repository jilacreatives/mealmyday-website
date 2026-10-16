/* MealMyDay – Scroll-Animationen für die Startseite.
   Reines JavaScript, keine Bibliotheken, keine externen Anfragen.
   - Hereingleiten von Abschnitten (IntersectionObserver), dabei zählen Zahlen mit der Klasse cnt hoch
   - kleine Schleifen (Klasse live) laufen nur, solange das Element sichtbar ist (Klasse is-on)
   - Geschichte: Zutaten fallen auf drei Teller, dann in die Einkaufsliste (Fortschritt = Scroll-Position)
   Bei „prefers-reduced-motion: reduce“ oder ohne JavaScript bleibt alles statisch im Endzustand (so steht es im HTML).
   Es werden nur transform und opacity animiert (plus der Ring der Tagesbilanz über stroke-dashoffset). */
(function () {
  'use strict';

  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var NS = 'http://www.w3.org/2000/svg';
  var revealIO = null;
  var liveIO = null;
  var story = null;

  /* ---- Hilfsfunktionen ---- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* Anteil von p innerhalb des Fensters [a, b], begrenzt auf 0 … 1 */
  function win(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeBack(t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  /* Fallen mit Aufprall und Nachfedern */
  function bounceOut(t) {
    var n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d; return n * t * t + 0.984375;
  }
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
      entries.forEach(function (en) { en.target.classList.toggle('is-on', en.isIntersecting); });
    }, { threshold: 0.25 });
    each(document.querySelectorAll('.live'), function (e) { liveIO.observe(e); });
  }
  function stopLive() {
    if (liveIO) liveIO.disconnect();
    liveIO = null;
    each(document.querySelectorAll('.live.is-on'), function (e) { e.classList.remove('is-on'); });
  }

  /* ---- Geschichte: Zutaten → Teller → Einkaufsliste ---- */
  function startStory() {
    var wrap = document.querySelector('.story');
    if (!wrap) return;
    var stage = wrap.querySelector('.stage');
    var S = story = { wrap: wrap, stage: stage, ticking: false, lastP: -1, force: true };

    S.platesWrap = wrap.querySelector('.plates-wrap');
    S.listWrap = wrap.querySelector('.list-wrap');
    S.balance = wrap.querySelector('.balance');
    S.ringFg = wrap.querySelector('.ring-fg');
    S.balNum = wrap.querySelector('.bal-num .num');
    S.balTarget = parseInt(S.balNum.getAttribute('data-n'), 10);
    S.balMax = parseInt(S.balNum.getAttribute('data-max'), 10) || S.balTarget;
    S.balLast = null;
    S.badge = wrap.querySelector('.badge-done');
    S.layer = wrap.querySelector('.flyers');

    /* Teller: Kalorienzahl und Makro-Balken, Fenster je Teller versetzt */
    S.plates = Array.prototype.map.call(wrap.querySelectorAll('.plate'), function (pl, k) {
      var num = pl.querySelector('.plate-kcal .num');
      return {
        el: pl, num: num, kcal: parseInt(num.getAttribute('data-n'), 10), last: null,
        a: 0.07 + k * 0.17, b: 0.27 + k * 0.17,
        bars: Array.prototype.map.call(pl.querySelectorAll('.pbar i'), function (b) {
          return { el: b, w: parseFloat(b.getAttribute('data-w')) || 1 };
        })
      };
    });

    /* Zeilen der Einkaufsliste, erreichbar über data-item */
    S.rows = {};
    each(wrap.querySelectorAll('.row'), function (r) {
      S.rows[r.getAttribute('data-item')] = { el: r, slot: r.querySelector('.row-slot'), check: r.querySelector('.check'), start: 9 };
    });

    /* Fliegende Zutaten: je Teller-Platz eine Kopie des Symbols */
    S.layer.innerHTML = '';
    S.flyers = [];
    S.plates.forEach(function (pl, k) {
      each(pl.el.querySelectorAll('.slot'), function (slot, j) {
        var i = S.flyers.length;
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'flyer');
        var use = document.createElementNS(NS, 'use');
        use.setAttribute('href', '#' + slot.getAttribute('data-sym'));
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + slot.getAttribute('data-sym'));
        svg.appendChild(use);
        S.layer.appendChild(svg);
        var row = S.rows[slot.getAttribute('data-item')] || null;
        var a0 = 0.02 + k * 0.17 + j * 0.035;
        var b0 = 0.69 + i * 0.014;
        var f = {
          el: svg, slot: slot, row: row,
          drift: ((i * 7) % 5 - 2) * 14,        /* leichter seitlicher Versatz beim Fallen */
          rot: ((i * 5) % 7 - 3) * 30,          /* Drehung beim Fallen */
          a0: a0, a1: a0 + 0.11,                /* Fenster: Fallen auf den Teller */
          b0: b0, b1: b0 + 0.09,                /* Fenster: Flug in die Einkaufsliste */
          x0: 0, y0: 0, x1: 0, y1: 0, up: 0, sc: 1
        };
        if (row && f.b1 < row.start) row.start = f.b1;
        S.flyers.push(f);
      });
    });

    /* Positionen messen (relativ zur Bühne). Vorher Transformationen zurücksetzen, sonst stimmt die Messung nicht. */
    S.measure = function () {
      /* Kopfhöhe aktuell halten (site.js macht das auch; hier zur Sicherheit, falls die Reihenfolge anders ist) */
      var head = document.querySelector('.site-head');
      if (head) root.style.setProperty('--head-h', head.offsetHeight + 'px');
      S.platesWrap.style.transform = '';
      S.listWrap.style.transform = '';
      S.balance.style.transform = '';
      var sr = stage.getBoundingClientRect();
      S.flyers.forEach(function (f) {
        var r = f.slot.getBoundingClientRect();
        f.x0 = r.left - sr.left;
        f.y0 = r.top - sr.top;
        f.up = -(f.y0 + r.height + 40);
        if (f.row) {
          var q = f.row.slot.getBoundingClientRect();
          f.x1 = q.left - sr.left + (q.width - r.width) / 2;
          f.y1 = q.top - sr.top + (q.height - r.height) / 2;
          f.sc = r.width ? q.width / r.width : 1;
        } else { f.x1 = f.x0; f.y1 = f.y0; f.sc = 1; }
      });
      /* Die Bühne klebt erst, wenn der Abschnitt die Unterkante der Kopfzeile erreicht (sticky top) –
         ab dort läuft der Fortschritt von 0 bis 1 */
      S.top = wrap.getBoundingClientRect().top + window.pageYOffset - (parseFloat(getComputedStyle(stage).top) || 0);
      S.range = Math.max(1, wrap.offsetHeight - stage.offsetHeight);
      S.ringLen = 2 * Math.PI * parseFloat(S.ringFg.getAttribute('r'));
      S.force = true;
    };

    /* Ein Bild zeichnen: alles hängt nur vom Fortschritt P (0 … 1) ab */
    S.frame = function () {
      S.ticking = false;
      var P = clamp((window.pageYOffset - S.top) / S.range, 0, 1);
      if (P === S.lastP && !S.force) return;
      S.lastP = P; S.force = false;

      /* Zutaten */
      S.flyers.forEach(function (f) {
        var x, y, r = 0, s = 1;
        var tb = win(P, f.b0, f.b1);
        if (tb <= 0) {
          var ta = win(P, f.a0, f.a1), e = bounceOut(ta);
          x = f.x0 + f.drift * (1 - ta);
          y = f.y0 + f.up * (1 - e);
          r = f.rot * (1 - ta);
        } else {
          var u = easeInOut(tb), v = 1 - u;
          var cx = (f.x0 + f.x1) / 2, cy = Math.min(f.y0, f.y1) - 90;   /* Bogen nach oben */
          x = v * v * f.x0 + 2 * v * u * cx + u * u * f.x1;
          y = v * v * f.y0 + 2 * v * u * cy + u * u * f.y1;
          r = Math.sin(u * Math.PI) * 14;
          s = 1 + (f.sc - 1) * u;
        }
        f.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + r.toFixed(1) + 'deg) scale(' + s.toFixed(3) + ')';
      });

      /* Teller: Kalorien zählen hoch, Balken füllen sich */
      S.plates.forEach(function (pl) {
        var t = easeOut(win(P, pl.a, pl.b));
        var n = Math.round(pl.kcal * t);
        if (n !== pl.last) { pl.num.textContent = fmt(n); pl.last = n; }
        pl.bars.forEach(function (b) { b.el.style.transform = 'scaleX(' + (b.w * t).toFixed(3) + ')'; });
      });

      /* Tagesbilanz */
      var tb2 = easeOut(win(P, 0.50, 0.63));
      S.ringFg.style.strokeDashoffset = (S.ringLen * (1 - (S.balTarget / S.balMax) * tb2)).toFixed(1);
      var bn = Math.round(S.balTarget * tb2);
      if (bn !== S.balLast) { S.balNum.textContent = fmt(bn); S.balLast = bn; }

      /* Wechsel: Teller weichen, Einkaufsliste kommt */
      var fade = win(P, 0.66, 0.73);
      S.platesWrap.style.opacity = (1 - fade).toFixed(3);
      S.platesWrap.style.transform = 'scale(' + (1 - 0.08 * fade).toFixed(3) + ')';
      S.balance.style.opacity = (1 - fade).toFixed(3);
      S.balance.style.transform = 'translateY(' + (12 * fade).toFixed(1) + 'px)';
      var lin = easeOut(win(P, 0.68, 0.75));
      S.listWrap.style.opacity = lin.toFixed(3);
      S.listWrap.style.transform = 'translateY(' + (24 * (1 - lin)).toFixed(1) + 'px)';

      /* Zeilen erscheinen, wenn ihre Zutat ankommt, und werden abgehakt */
      Object.keys(S.rows).forEach(function (k) {
        var row = S.rows[k];
        var ro = win(P, row.start - 0.03, row.start);
        var ck = easeBack(win(P, row.start, row.start + 0.03));
        row.el.style.opacity = ro.toFixed(3);
        row.check.style.transform = 'scale(' + ck.toFixed(3) + ')';
        if (ck >= 1) row.el.classList.add('done'); else row.el.classList.remove('done');
      });

      /* „Alles im Wagen“ */
      var bd = easeBack(win(P, 0.95, 0.99));
      S.badge.style.opacity = clamp(bd, 0, 1).toFixed(3);
      S.badge.style.transform = 'scale(' + (0.8 + 0.2 * bd).toFixed(3) + ')';
    };

    S.onScroll = function () {
      if (!S.ticking) { S.ticking = true; window.requestAnimationFrame(S.frame); }
    };
    S.onResize = function () {
      clearTimeout(S.rt);
      S.rt = setTimeout(function () { S.measure(); S.frame(); }, 120);
    };
    window.addEventListener('scroll', S.onScroll, { passive: true });
    window.addEventListener('resize', S.onResize);
    window.addEventListener('orientationchange', S.onResize);
    window.addEventListener('load', S.onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(S.onResize);
    S.measure();
    S.frame();
  }

  /* Alles zurück auf den statischen Endzustand */
  function stopStory() {
    var S = story;
    if (!S) return;
    story = null;
    window.removeEventListener('scroll', S.onScroll);
    window.removeEventListener('resize', S.onResize);
    window.removeEventListener('orientationchange', S.onResize);
    window.removeEventListener('load', S.onResize);
    clearTimeout(S.rt);
    S.layer.innerHTML = '';
    [S.platesWrap, S.listWrap, S.balance, S.badge].forEach(function (el) { el.style.opacity = ''; el.style.transform = ''; });
    S.ringFg.style.strokeDashoffset = '';
    S.plates.forEach(function (pl) {
      pl.num.textContent = fmt(pl.kcal);
      pl.bars.forEach(function (b) { b.el.style.transform = ''; });
    });
    S.balNum.textContent = fmt(S.balTarget);
    Object.keys(S.rows).forEach(function (k) {
      var r = S.rows[k];
      r.el.style.opacity = ''; r.check.style.transform = ''; r.el.classList.add('done');
    });
  }

  /* ---- Ein- und Ausschalten je nach Systemeinstellung ---- */
  function enable() {
    if (root.classList.contains('anim')) return;
    root.classList.add('anim');
    startReveal();
    startLive();
    startStory();
  }
  function disable() {
    root.classList.remove('anim');
    stopReveal();
    stopLive();
    stopStory();
  }
  /* Zum Prüfen des statischen Zustands lässt sich die Bewegung auch per Adresse abschalten: index.html?motion=reduce */
  var forcedOff = /[?&]motion=reduce\b/.test(window.location.search);
  if (!mq.matches && !forcedOff) enable();
  function onChange(e) { if (e.matches || forcedOff) disable(); else enable(); }
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
})();
