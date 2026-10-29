# COZZE MINERÍA — sitio web (www.cozze.cl)

Sitio estático (HTML + CSS + JS) en español e inglés, con un formulario de
contacto que envía correos mediante PHP (`enviar.php`). Sin dependencias.

- **Pruebas:** Vercel (cada push genera una vista previa). Vercel no ejecuta PHP:
  ahí el formulario muestra el mensaje de error amigable, es lo esperado.
- **Producción:** Bluehosting (cPanel, Apache, PHP) → `public_html`.

## Estructura

| Archivo | Qué es |
|---|---|
| `index.html`, `privacidad.html` | Páginas en **español** (fuente principal; se editan a mano) |
| `en/index.html`, `en/privacidad.html` | Páginas en **inglés** — **generadas**, no editar a mano |
| `i18n/en.json` | Diccionario de traducciones ES → EN |
| `styles.css`, `main.js`, `assets/` | Estilos, comportamiento (menús, idioma, formulario) e imágenes |
| `enviar.php` | Recibe el formulario y envía el correo |
| `404.html` | Página de error (ES/EN) |
| `deploy/` | `.htaccess`, `robots.txt` y `sitemap.xml` para producción |
| `scripts/` | `i18n.mjs` (genera inglés) y `build.mjs` (genera `dist/` y el zip) |
| `vercel.json`, `.vercelignore` | Solo para el entorno de pruebas en Vercel |

## Cómo editar un texto

1. Cambia el texto en la página en español (`index.html` o `privacidad.html`).
2. En `i18n/en.json`, dentro de `"text"`, cambia la **clave** (texto en español,
   exactamente igual) y su traducción al inglés.
3. Ejecuta `npm run i18n` (o `node scripts/i18n.mjs`). Regenera `en/`.
   - Si falta alguna traducción, el script se detiene y lista los textos
     pendientes: así nunca queda contenido sin traducir.
   - Si un texto queda igual en inglés (nombres propios, símbolos), agrégalo a `"keep"`.
4. Revisa, haz commit y push (Vercel genera la vista previa).

Los cambios de diseño (estilos, estructura) se hacen solo en la página en
español: el inglés se genera con la misma estructura y los mismos estilos.

## Publicar en producción

```bash
npm run build      # o: node scripts/build.mjs  (requiere Node 18+)
```

Genera `dist/` y **`cozze-dist.zip`** (contenido listo para `public_html`, sin
carpeta extra). En `dist/` se elimina el `noindex` (en Vercel se mantiene) y se
agrega `?v=hash` a `styles.css` y `main.js` para que la caché larga se renueve
en cada cambio.

### Subir a Bluehosting

1. cPanel → **Administrador de archivos** → `public_html` (activa "Mostrar archivos ocultos" para ver `.htaccess`).
2. **Cargar** `cozze-dist.zip` → clic derecho → **Extraer** en `public_html`. Elimina el zip después.
3. Crea en cPanel → **Cuentas de correo** la casilla `no-responder@cozze.cl`
   (remitente de los avisos) si aún no existe, y verifica `contacto@cozze.cl`.
4. Abre https://www.cozze.cl, envía un formulario de prueba y revisa que llegue
   a `contacto@cozze.cl` y a la copia.
5. Si cae en spam: cPanel → **Email Deliverability** (Entregabilidad del correo)
   → verifica que **SPF** y **DKIM** estén "Valid" (botón "Repair" si no).

## Formulario (`enviar.php`)

- Solo POST; valida en servidor (nombre, email válido, perfil permitido,
  mensaje, aceptación de privacidad), límites de longitud, sin saltos de línea
  en cabeceras (anti-inyección), campo trampa (honeypot), mínimo 3 s para
  completar, máximo 5 envíos por hora por IP.
- El control de frecuencia guarda solo un hash de la IP y fechas en
  `~/cozze-data/` (fuera de `public_html`); si no puede, usa la carpeta temporal.
- Responde JSON `{ ok, message }` en el idioma del formulario.
- Destinatario, copia y remitente se configuran al inicio de `enviar.php`.

### Si `mail()` no entrega los correos: cambiar a SMTP autenticado

1. Crea (o usa) la cuenta `contacto@cozze.cl` en cPanel y anota su contraseña
   y el servidor SMTP (cPanel → Cuentas de correo → *Connect Devices*:
   normalmente `mail.cozze.cl`, puerto 465 SSL).
2. Descarga PHPMailer (https://github.com/PHPMailer/PHPMailer, carpeta `src/`)
   y súbelo a `public_html/phpmailer/` (o fuera de `public_html`, mejor).
3. En `enviar.php`, reemplaza la línea `$sent = @mail(...)` por:

```php
require __DIR__ . '/phpmailer/src/Exception.php';
require __DIR__ . '/phpmailer/src/PHPMailer.php';
require __DIR__ . '/phpmailer/src/SMTP.php';

$m = new PHPMailer\PHPMailer\PHPMailer(true);
try {
    $m->isSMTP();
    $m->Host       = 'mail.cozze.cl';
    $m->SMTPAuth   = true;
    $m->Username   = 'contacto@cozze.cl';
    $m->Password   = 'CONTRASEÑA';          // mejor leerla de un archivo fuera de public_html
    $m->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    $m->Port       = 465;
    $m->CharSet    = 'UTF-8';
    $m->setFrom('contacto@cozze.cl', MAIL_FROM_NAME);
    $m->addAddress(MAIL_TO);
    $m->addCC(MAIL_CC);
    $m->addReplyTo($email, $nombre);
    $m->Subject = "[Sitio web COZZE] Nueva consulta – {$perfilLabel} – {$nombre}";
    $m->Body    = $body;
    $sent = $m->send();
} catch (Throwable $e) {
    $sent = false;
}
```

   Con SMTP el remitente debe ser la cuenta autenticada (`contacto@cozze.cl`).

## Probar en local

```bash
php -S localhost:8000      # sitio + enviar.php en http://localhost:8000
```

Para probar sin enviar correos reales:
`php -d sendmail_path="tee /tmp/correo.eml" -S localhost:8000`.
