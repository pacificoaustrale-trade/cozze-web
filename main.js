// Cierra los menús desplegables al hacer clic fuera o al elegir una opción
document.addEventListener('click', function (e) {
  document.querySelectorAll('header details[open]').forEach(function (d) {
    if (!d.contains(e.target) || e.target.closest('a')) d.removeAttribute('open');
  });
});

// Textos según el idioma de la página (<html lang="es|en">)
var lang = document.documentElement.lang === 'en' ? 'en' : 'es';
var T = {
  es: {
    ok: 'Gracias, recibimos tu consulta. Te contactaremos a la brevedad.',
    error: 'No pudimos enviar tu consulta. Escríbenos a contacto@cozze.cl.',
    sending: 'Enviando…',
    menuOpen: 'Abrir menú',
    menuClose: 'Cerrar menú'
  },
  en: {
    ok: 'Thank you, we have received your inquiry. We will contact you shortly.',
    error: 'We could not send your inquiry. Please email us at contacto@cozze.cl.',
    sending: 'Sending…',
    menuOpen: 'Open menu',
    menuClose: 'Close menu'
  }
}[lang];

// Selector de idioma: conserva el #ancla al cambiar a la página equivalente
document.querySelectorAll('[data-lang-switch]').forEach(function (a) {
  a.addEventListener('click', function () {
    if (location.hash) a.setAttribute('href', a.getAttribute('href').split('#')[0] + location.hash);
  });
});

// Formulario de contacto: envío real a /enviar.php
var f = document.getElementById('form-contacto');
if (f) {
  var loadedAt = Date.now();
  if (f.elements.ts) f.elements.ts.value = String(loadedAt);
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var m = document.getElementById('form-msg');
    var btn = f.querySelector('button[type="submit"]');
    var label = btn.textContent;
    var data = new FormData(f);
    data.append('elapsed', String(Date.now() - loadedAt));
    btn.disabled = true;
    btn.textContent = T.sending;
    m.style.color = '#1F7C61';
    m.textContent = '';
    fetch('/enviar.php', { method: 'POST', body: data, headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false }; });
      })
      .then(function (res) {
        if (res && res.ok) {
          m.textContent = T.ok;
          f.reset();
          loadedAt = Date.now();
          if (f.elements.ts) f.elements.ts.value = String(loadedAt);
        } else {
          m.style.color = '#B3261E';
          m.textContent = (res && res.message) || T.error;
        }
      })
      .catch(function () {
        m.style.color = '#B3261E';
        m.textContent = T.error;
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
  });
}

// Menú móvil (hamburguesa): abre/cierra el menú principal
var navToggle = document.querySelector('.nav-toggle');
var navMenu = document.getElementById('menu-principal');
function setNav(open) {
  navMenu.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  navToggle.setAttribute('aria-label', open ? T.menuClose : T.menuOpen);
}
if (navToggle && navMenu) {
  navToggle.addEventListener('click', function () { setNav(!navMenu.classList.contains('is-open')); });
  document.addEventListener('click', function (e) {
    if (!navMenu.classList.contains('is-open')) return;
    if (e.target.closest('#menu-principal a') || (!navMenu.contains(e.target) && !navToggle.contains(e.target))) setNav(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navMenu.classList.contains('is-open')) { setNav(false); navToggle.focus(); }
  });
}
