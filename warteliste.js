/* MealMyDay – Warteliste (Startseite und warteliste.html). Reines JavaScript, keine Bibliotheken.
   Spricht mit der Edge Function bei Supabase – die einzige Anfrage dieser Website an einen fremden Server:
   - Startseite, Formular #warteliste: E-Mail-Adresse eintragen (Aktion „eintragen“)
   - warteliste.html: Anmeldung bestätigen bzw. abmelden über die Links aus den E-Mails (Aktionen „bestaetigen“, „abmelden“)
   Antwort des Servers ist immer JSON: Erfolg { ok: true, meldung: "…" }, Fehler (HTTP 4xx/5xx) { fehler: "…" }.
   Die Texte in meldung/fehler kommen vom Server und werden genau so angezeigt. */
(function () {
  'use strict';

  /* Adresse der Edge Function */
  var FUNKTION = 'https://nuxqaoaalgphnjkbpyqn.supabase.co/functions/v1/warteliste';
  /* Fassung des Einwilligungstexts – muss zum Wortlaut im Formular passen; der Server speichert sie als Nachweis */
  var FASSUNG = '2026-10-12';
  var WARTEN = 'Einen Moment …';
  var NETZFEHLER = 'Das hat gerade nicht geklappt. Bitte prüfe deine Verbindung und versuch es gleich noch einmal.';

  /* ---- Anfrage an den Server ----
     Ruft fertig({ ok, text }) genau einmal auf – auch bei Netzwerkfehler oder kaputter Antwort (dann mit NETZFEHLER). */
  function senden(body, fertig) {
    var erledigt = false;
    function melden(erg) { if (!erledigt) { erledigt = true; fertig(erg); } }
    if (!window.fetch) { melden({ ok: false, text: NETZFEHLER }); return; }
    var status = 0;
    window.fetch(FUNKTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (antwort) {
      status = antwort.status;
      return antwort.json();
    }).then(function (daten) {
      if (status >= 200 && status < 300 && daten && daten.ok === true && typeof daten.meldung === 'string') {
        melden({ ok: true, text: daten.meldung });
      } else if (daten && typeof daten.fehler === 'string' && daten.fehler) {
        melden({ ok: false, text: daten.fehler });
      } else {
        melden({ ok: false, text: NETZFEHLER });   /* unerwartete Antwort */
      }
    }).catch(function () {
      melden({ ok: false, text: NETZFEHLER });     /* Netzwerkfehler oder kein JSON */
    });
  }

  /* Meldung im Statusbereich zeigen (role="status" – Screenreader lesen sie von selbst vor) */
  function zeigeStatus(el, erg) {
    el.textContent = erg.text;
    el.classList.toggle('is-ok', erg.ok);
    el.classList.toggle('is-fehler', !erg.ok);
    el.focus();
  }

  /* ---- Startseite: Formular zum Eintragen ---- */
  function startFormular() {
    var form = document.getElementById('warteliste');
    if (!form) return;
    var email = form.elements.email;
    var kasten = form.elements.einwilligung;
    var lock = form.elements.website;                      /* Lockfeld gegen Bots – bleibt bei Menschen leer */
    var knopf = form.querySelector('button[type="submit"]');
    var status = document.getElementById('warteliste-status');
    var knopfText = knopf.textContent;
    var laeuft = false;

    /* Fehlertext am Feld ein-/ausblenden (das <p> hat die id des Feldes plus „-fehler“) */
    function setzeFehler(feld, text) {
      var p = document.getElementById(feld.id + '-fehler');
      if (text) {
        feld.setAttribute('aria-invalid', 'true');
        if (p) { p.textContent = text; p.hidden = false; }
      } else {
        feld.removeAttribute('aria-invalid');
        if (p) { p.textContent = ''; p.hidden = true; }
      }
    }
    /* Grobe Prüfung: etwas@etwas.endung – die genaue Prüfung macht der Server */
    function siehtAusWieEmail(s) { return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }

    email.addEventListener('input', function () { setzeFehler(email, ''); });
    kasten.addEventListener('change', function () { setzeFehler(kasten, ''); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (laeuft) return;

      var adresse = email.value.trim();
      var ok = true;
      if (!adresse) { setzeFehler(email, 'Bitte gib deine E-Mail-Adresse ein.'); ok = false; }
      else if (!siehtAusWieEmail(adresse)) { setzeFehler(email, 'Das sieht nicht wie eine E-Mail-Adresse aus – bitte prüf sie noch einmal.'); ok = false; }
      if (!kasten.checked) { setzeFehler(kasten, 'Bitte hake das Kästchen an – ohne deine Einwilligung dürfen wir dir nicht schreiben.'); ok = false; }
      if (!ok) { (email.getAttribute('aria-invalid') ? email : kasten).focus(); return; }

      laeuft = true;
      knopf.disabled = true;
      knopf.textContent = WARTEN;
      status.textContent = '';
      status.className = 'wl-status';
      senden({
        aktion: 'eintragen',
        email: adresse,
        einwilligung: true,
        fassung: FASSUNG,
        website: lock ? lock.value : ''
      }, function (erg) {
        laeuft = false;
        knopf.disabled = false;
        knopf.textContent = knopfText;
        if (erg.ok) { form.reset(); form.hidden = true; }   /* nach Erfolg nur noch die Meldung zeigen */
        zeigeStatus(status, erg);
      });
    });
  }

  /* ---- warteliste.html: Bestätigen oder Abmelden über den Link aus der E-Mail ----
     warteliste.html?t=TOKEN → bestätigen, warteliste.html?abmelden=TOKEN → abmelden, ohne Parameter → Hinweis.
     Gesendet wird erst nach dem Klick auf den Knopf – nie automatisch beim Laden (Virenscanner rufen Links vorab auf). */
  function startSeite() {
    var seite = document.getElementById('warteliste-seite');
    if (!seite) return;

    function parameter(name) {
      var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() : '';
    }
    var aktion = 'bestaetigen';
    var token = parameter('t');
    if (!token) { token = parameter('abmelden'); aktion = 'abmelden'; }
    if (!token) aktion = 'hinweis';

    /* Token aus der Adresszeile entfernen, damit er nicht im Verlauf oder auf Screenshots steht */
    if (token && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }

    var ansicht = document.getElementById('ansicht-' + aktion);
    Array.prototype.forEach.call(seite.querySelectorAll('.wl-ansicht'), function (el) { el.hidden = (el !== ansicht); });
    var titel = ansicht.getAttribute('data-titel');
    if (titel) document.title = titel + ' – MealMyDay';
    if (aktion === 'hinweis') return;

    var knopf = ansicht.querySelector('button');
    var aktionZeile = ansicht.querySelector('.wl-aktion');
    var status = ansicht.querySelector('.wl-status');
    var weiter = ansicht.querySelector('.wl-weiter');
    var knopfText = knopf.textContent;
    var laeuft = false;

    knopf.addEventListener('click', function () {
      if (laeuft) return;
      laeuft = true;
      knopf.disabled = true;
      knopf.textContent = WARTEN;
      status.textContent = '';
      status.className = 'wl-status';
      senden({ aktion: aktion, token: token }, function (erg) {
        laeuft = false;
        if (erg.ok) {
          aktionZeile.hidden = true;                 /* erledigt – Knopf weg */
        } else {
          knopf.disabled = false;                    /* noch einmal versuchen dürfen */
          knopf.textContent = knopfText;
        }
        weiter.hidden = false;
        zeigeStatus(status, erg);
      });
    });
  }

  startFormular();
  startSeite();
})();
