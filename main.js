// Cierra los menús desplegables al hacer clic fuera o al elegir una opción
document.addEventListener('click', function (e) {
  document.querySelectorAll('header details[open]').forEach(function (d) {
    if (!d.contains(e.target) || e.target.closest('a')) d.removeAttribute('open');
  });
});

// Formulario de contacto: PRUEBA (aún sin envío real)
var f = document.getElementById('form-contacto');
if (f) f.addEventListener('submit', function (e) {
  e.preventDefault();
  var m = document.getElementById('form-msg');
  m.textContent = 'Versión de prueba: el formulario todavía no envía mensajes.';
  f.reset();
});

// Menú móvil (hamburguesa): abre/cierra el menú principal
var navToggle = document.querySelector('.nav-toggle');
var navMenu = document.getElementById('menu-principal');
function setNav(open) {
  navMenu.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
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
