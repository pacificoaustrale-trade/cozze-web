<?php
/**
 * COZZE MINERÍA — envío del formulario de contacto.
 *
 * Recibe el formulario por POST (desde main.js), valida todo en el servidor
 * y envía el correo con mail(). Responde JSON { ok, message } en el idioma
 * del formulario (es/en).
 *
 * Para cambiar a SMTP autenticado (PHPMailer), ver README.md.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const MAIL_TO         = 'contacto@cozze.cl';
const MAIL_CC         = 'cozzemineria@gmail.com';
const MAIL_FROM       = 'no-responder@cozze.cl';
const MAIL_FROM_NAME  = 'Sitio web COZZE';
const RATE_MAX        = 5;     // envíos permitidos por IP...
const RATE_WINDOW     = 3600;  // ...en esta ventana (segundos)
const MIN_FILL_MS     = 3000;  // tiempo mínimo para completar el formulario
const MAX_BODY_BYTES  = 20000; // tamaño máximo de la petición

// Opciones válidas de "Perfil" (valor del <option> => etiqueta para el correo)
const PERFILES = [
    'maquila'   => 'Productor Minero - Maquila',
    'venta'     => 'Productor Minero - Venta de Mineral',
    'comprador' => 'Comprador de Concentrado',
    'otro'      => 'Otro',
];

// Límites de longitud por campo
const LIMITS = [
    'nombre'   => 100,
    'empresa'  => 120,
    'telefono' => 40,
    'email'    => 150,
    'mensaje'  => 5000,
];

const MESSAGES = [
    'es' => [
        'ok'       => 'Gracias, recibimos tu consulta. Te contactaremos a la brevedad.',
        'invalid'  => 'Revisa los campos obligatorios: nombre, email válido, perfil, mensaje y aceptación de la Política de Privacidad.',
        'too_fast' => 'No pudimos enviar tu consulta. Espera unos segundos e inténtalo de nuevo.',
        'rate'     => 'Has enviado demasiadas consultas. Inténtalo más tarde o escríbenos a contacto@cozze.cl.',
        'error'    => 'No pudimos enviar tu consulta. Escríbenos a contacto@cozze.cl.',
        'method'   => 'Método no permitido.',
    ],
    'en' => [
        'ok'       => 'Thank you, we have received your inquiry. We will contact you shortly.',
        'invalid'  => 'Please check the required fields: name, valid email, profile, message and acceptance of the Privacy Policy.',
        'too_fast' => 'We could not send your inquiry. Please wait a few seconds and try again.',
        'rate'     => 'You have sent too many inquiries. Please try again later or email us at contacto@cozze.cl.',
        'error'    => 'We could not send your inquiry. Please email us at contacto@cozze.cl.',
        'method'   => 'Method not allowed.',
    ],
];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
ini_set('display_errors', '0');
error_reporting(0);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex');

function respond(int $status, bool $ok, string $message): void
{
    http_response_code($status);
    echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Texto de una línea: sin saltos ni caracteres de control (seguro para cabeceras). */
function clean_line(string $s, int $max): string
{
    $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '';
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
    return mb_substr_safe($s, $max);
}

/** Texto multilínea: conserva saltos de línea, elimina otros caracteres de control. */
function clean_text(string $s, int $max): string
{
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = preg_replace('/[\x00-\x08\x0B-\x1F\x7F]+/u', '', $s) ?? '';
    return mb_substr_safe(trim($s), $max);
}

function mb_substr_safe(string $s, int $max): string
{
    if (!preg_match('//u', $s)) {
        return ''; // UTF-8 inválido
    }
    return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max);
}

/** Codifica una cabecera en UTF-8 (RFC 2047), en trozos que no cortan caracteres. */
function encode_header(string $s): string
{
    if (!preg_match('/[^\x20-\x7E]/', $s)) {
        return $s;
    }
    $chars = preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $words = [];
    $chunk = '';
    foreach ($chars as $c) {
        if (strlen($chunk . $c) > 45) {
            $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
            $chunk = '';
        }
        $chunk .= $c;
    }
    if ($chunk !== '') {
        $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
    }
    return implode("\r\n ", $words);
}

function field(string $name): string
{
    $v = $_POST[$name] ?? '';
    return is_string($v) ? $v : '';
}

/** Carpeta para el control de frecuencia: fuera de la raíz web si es posible. */
function rate_dir(): ?string
{
    $candidates = [dirname(__DIR__) . '/cozze-data', sys_get_temp_dir() . '/cozze-data'];
    foreach ($candidates as $dir) {
        if ((is_dir($dir) || @mkdir($dir, 0700, true)) && is_writable($dir)) {
            return $dir;
        }
    }
    return null;
}

/** Devuelve true si la IP superó el límite. Guarda solo un hash de la IP, nunca la IP. */
function rate_limited(bool $register): bool
{
    $dir = rate_dir();
    if ($dir === null) {
        return false; // si no hay dónde guardar, no se bloquea el envío
    }
    $ip   = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $file = $dir . '/rl-' . hash('sha256', 'cozze|' . $ip . '|' . __FILE__) . '.json';
    $fp   = @fopen($file, 'c+');
    if ($fp === false) {
        return false;
    }
    flock($fp, LOCK_EX);
    $now  = time();
    $list = json_decode(stream_get_contents($fp) ?: '[]', true);
    $list = array_values(array_filter(is_array($list) ? $list : [], fn($t) => is_int($t) && $t > $now - RATE_WINDOW));
    $limited = count($list) >= RATE_MAX;
    if (!$limited && $register) {
        $list[] = $now;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($list));
    flock($fp, LOCK_UN);
    fclose($fp);
    return $limited;
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------
$lang = field('lang') === 'en' ? 'en' : 'es';
$msg  = MESSAGES[$lang];

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, false, $msg['method']);
}

if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY_BYTES) {
    respond(413, false, $msg['invalid']);
}

// Campo trampa (honeypot): si viene lleno es un bot. Se responde como si todo
// hubiera salido bien, para no darle pistas, pero no se envía nada.
if (trim(field('website')) !== '') {
    respond(200, true, $msg['ok']);
}

// Tiempo mínimo desde que se cargó la página
$elapsed = field('elapsed');
if (!ctype_digit($elapsed) || (int)$elapsed < MIN_FILL_MS || !ctype_digit(field('ts'))) {
    respond(400, false, $msg['too_fast']);
}

$nombre   = clean_line(field('nombre'), LIMITS['nombre']);
$empresa  = clean_line(field('empresa'), LIMITS['empresa']);
$telefono = clean_line(field('telefono'), LIMITS['telefono']);
$email    = clean_line(field('email'), LIMITS['email']);
$perfil   = field('perfil');
$mensaje  = clean_text(field('mensaje'), LIMITS['mensaje']);
$acepta   = field('privacidad') === '1';

$valid = $nombre !== ''
    && filter_var($email, FILTER_VALIDATE_EMAIL) !== false
    && isset(PERFILES[$perfil])
    && $mensaje !== ''
    && $acepta;

if (!$valid) {
    respond(422, false, $msg['invalid']);
}

if (rate_limited(false)) {
    respond(429, false, $msg['rate']);
}

// ---------------------------------------------------------------------------
// Correo
// ---------------------------------------------------------------------------
$perfilLabel = PERFILES[$perfil];
$fecha = (new DateTimeImmutable('now', new DateTimeZone('America/Santiago')))->format('d-m-Y H:i:s T');

$subject = encode_header("[Sitio web COZZE] Nueva consulta – {$perfilLabel} – {$nombre}");

$body = implode("\n", [
    'Nueva consulta desde el sitio web www.cozze.cl',
    '',
    'Nombre y Apellido: ' . $nombre,
    'Empresa: ' . ($empresa !== '' ? $empresa : '-'),
    'Teléfono: ' . ($telefono !== '' ? $telefono : '-'),
    'Email: ' . $email,
    'Perfil: ' . $perfilLabel,
    'Idioma del formulario: ' . $lang,
    'Fecha y hora: ' . $fecha . ' (America/Santiago)',
    'Política de Privacidad: aceptada',
    '',
    'Mensaje:',
    $mensaje,
    '',
    '--',
    'Para responder, usa "Responder": el correo irá directamente a ' . $email,
]);

$headers = [
    'From'                      => encode_header(MAIL_FROM_NAME) . ' <' . MAIL_FROM . '>',
    'Reply-To'                  => $email,
    'Cc'                        => MAIL_CC,
    'MIME-Version'              => '1.0',
    'Content-Type'              => 'text/plain; charset=UTF-8',
    'Content-Transfer-Encoding' => 'base64',
    'X-Mailer'                  => 'COZZE web',
];

$sent = @mail(MAIL_TO, $subject, chunk_split(base64_encode($body), 76, "\r\n"), $headers, '-f' . MAIL_FROM);

if (!$sent) {
    respond(500, false, $msg['error']);
}

rate_limited(true);
respond(200, true, $msg['ok']);
