/* MealMyDay – Bewegung im neuen Design (Vorschau vom 15. November 2026). Reines JavaScript, keine Bibliotheken.
   - Einstieg: die drei Handys fahren nach dem Laden hoch (Klasse is-da), gehen beim Scrollen leicht auseinander
     (--spreiz) und neigen sich am Laptop mit der Maus (--neig-x, --neig-y)
   - So funktioniert's: am Laptop bleibt ein Handy stehen; der Schritt in der Bildmitte bestimmt Bild und Ausschnitt
     (data-schritt an .n-buehne, is-aktiv am Schritt)
   Bei „prefers-reduced-motion: reduce“ bleibt alles ruhig: Handys stehen, Schritte wechseln ohne Übergang (CSS). */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---- Einstieg ---- */
  var hero = document.querySelector('.n-hero');
  var handys = hero && hero.querySelector('.n-hero-handys');
  if (handys) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { hero.classList.add('is-da'); }); });
    var tick = false;
    function scrollen() {
      tick = false;
      if (reduce.matches) return;
      var h = hero.offsetHeight || 1;
      handys.style.setProperty('--spreiz', clamp(window.scrollY / h, 0, 1).toFixed(3));
    }
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(scrollen); } }, { passive: true });
    scrollen();
    /* Neigen mit der Maus nur bei feinem Zeiger (Maus, Touchpad) */
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      hero.addEventListener('pointermove', function (e) {
        if (reduce.matches) return;
        var r = hero.getBoundingClientRect();
        handys.style.setProperty('--neig-x', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        handys.style.setProperty('--neig-y', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
      hero.addEventListener('pointerleave', function () { handys.style.setProperty('--neig-x', 0); handys.style.setProperty('--neig-y', 0); });
    }
  }

  /* ---- Laufband: die Reihe einmal verdoppeln, damit sie nahtlos endlos läuft (CSS verschiebt um die halbe Breite) ---- */
  var reihe = document.querySelector('.n-band-reihe');
  if (reihe) Array.prototype.slice.call(reihe.children).forEach(function (li) { reihe.appendChild(li.cloneNode(true)); });

  /* ---- So funktioniert's ---- */
  var buehne = document.querySelector('.n-buehne');
  var schritte = document.querySelectorAll('.n-schritt');
  if (buehne && schritte.length && 'IntersectionObserver' in window) {
    var aktiv = 0;
    function setze(nr) {
      if (nr === aktiv) return;
      aktiv = nr;
      buehne.setAttribute('data-schritt', nr);
      Array.prototype.forEach.call(schritte, function (s) { s.classList.toggle('is-aktiv', Number(s.getAttribute('data-schritt')) === nr); });
    }
    /* der Schritt, der die waagrechte Mitte des Fensters kreuzt, ist dran */
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) setze(Number(e.target.getAttribute('data-schritt'))); });
    }, { rootMargin: '-50% 0px -50% 0px' });
    Array.prototype.forEach.call(schritte, function (s) { io.observe(s); });
    setze(1);
  }
})();
