/* MealMyDay – Kopfzeile (alle Seiten). Reines JavaScript, keine Bibliotheken, keine externen Anfragen.
   - trägt die tatsächliche Kopfhöhe als CSS-Variable --head-h ein (für Ankersprünge und die Bühne der Startseite)
   - setzt die Klasse is-scrolled, sobald gescrollt ist (feine Linie/Schatten unter der Kopfzeile)
   - hebt den Navigationspunkt des Abschnitts hervor, in dem man gerade liest (IntersectionObserver)
   Ohne JavaScript bleibt die Kopfzeile trotzdem sticky; die Höhe kommt dann aus dem CSS-Vorgabewert. */
(function () {
  'use strict';

  var root = document.documentElement;
  var head = document.querySelector('.site-head');
  if (!head) return;

  /* ---- Kopfhöhe als CSS-Variable ---- */
  var lastH = 0;
  function setHeadHeight() {
    var h = head.offsetHeight;
    if (h && h !== lastH) { lastH = h; root.style.setProperty('--head-h', h + 'px'); }
  }

  /* ---- Schatten nach dem Scrollen ----
     Ein unsichtbarer 1-px-Marker ganz oben auf der Seite: sobald er aus dem Fenster wandert, ist gescrollt.
     (IntersectionObserver statt Scroll-Ereignis: zuverlässig und ohne Arbeit bei jedem Scrollschritt.) */
  var scrolled = null;
  function setScrolled(s) {
    if (s !== scrolled) { scrolled = s; head.classList.toggle('is-scrolled', s); }
  }
  function onScroll() { setScrolled(window.pageYOffset > 4); }
  var sentinel = document.createElement('div');
  sentinel.className = 'head-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(sentinel, document.body.firstChild);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      setScrolled(!entries[0].isIntersecting);
    }, { rootMargin: '4px 0px 0px 0px', threshold: 0 }).observe(sentinel);
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- Aktiver Abschnitt in der Navigation ----
     Eine unsichtbare „Leselinie“ sitzt etwas unterhalb der Kopfzeile (35 % der Fensterhöhe).
     Aktiv ist der Abschnitt, der diese Linie gerade schneidet. */
  var links = Array.prototype.slice.call(document.querySelectorAll('.site-nav a[href^="#"]'));
  var targets = [];
  links.forEach(function (a) {
    var el = document.getElementById(a.getAttribute('href').slice(1));
    if (!el) return;
    var sec = el.closest('section') || el;
    for (var i = 0; i < targets.length; i++) if (targets[i].sec === sec) return;   /* je Abschnitt nur ein Link */
    targets.push({ a: a, sec: sec });
  });
  var io = null, current = null;
  function setActive(t) {
    if (t === current) return;
    if (current) { current.a.removeAttribute('aria-current'); }
    current = t;
    if (t) { t.a.setAttribute('aria-current', 'true'); }
  }
  function findTarget(el) { for (var i = 0; i < targets.length; i++) if (targets[i].sec === el) return targets[i]; return null; }
  function buildObserver() {
    if (io) { io.disconnect(); io = null; }
    if (!targets.length || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight, line = Math.round(head.offsetHeight + vh * 0.35);
    io = new IntersectionObserver(function (entries) {
      /* erst die verlassenen, dann die neu geschnittenen Abschnitte, sonst flackert es beim Wechsel */
      entries.forEach(function (en) { if (!en.isIntersecting && current && current.sec === en.target) setActive(null); });
      entries.forEach(function (en) { if (en.isIntersecting) setActive(findTarget(en.target)); });
    }, { rootMargin: '-' + line + 'px 0px -' + Math.max(0, vh - line - 1) + 'px 0px', threshold: 0 });
    targets.forEach(function (t) { io.observe(t.sec); });
  }

  /* ---- Start und Größenänderungen ---- */
  var rt;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () { setHeadHeight(); buildObserver(); }, 100);
  }
  setHeadHeight();
  buildObserver();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('load', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
})();
