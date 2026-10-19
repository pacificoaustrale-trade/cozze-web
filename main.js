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
