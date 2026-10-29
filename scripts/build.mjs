#!/usr/bin/env node
// Prepara el sitio para producción (Bluehosting / Apache) sin dependencias:
//  1. Regenera la versión en inglés (scripts/i18n.mjs).
//  2. Copia a dist/ solo los archivos publicables.
//  3. En dist/: quita <meta name="robots" content="noindex, nofollow"> y
//     agrega ?v=<hash> a styles.css y main.js (caché larga sin quedar obsoleta).
//  4. Genera cozze-dist.zip con el contenido de dist/ en la raíz del zip
//     (se descomprime directo en public_html, sin carpeta extra).
//
// Uso: node scripts/build.mjs   (o: npm run build)

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const zipPath = join(root, 'cozze-dist.zip');

execFileSync(process.execPath, [join(root, 'scripts/i18n.mjs')], { stdio: 'inherit' });

const FILES = [
  'index.html', 'privacidad.html', 'en/index.html', 'en/privacidad.html', '404.html',
  'enviar.php', 'styles.css', 'main.js', 'assets',
  ['deploy/.htaccess', '.htaccess'], ['deploy/robots.txt', 'robots.txt'], ['deploy/sitemap.xml', 'sitemap.xml'],
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const item of FILES) {
  const [from, to] = Array.isArray(item) ? item : [item, item];
  const src = join(root, from);
  if (!existsSync(src)) throw new Error('Falta ' + from);
  mkdirSync(dirname(join(dist, to)), { recursive: true });
  cpSync(src, join(dist, to), { recursive: true });
}

// Versión (hash corto del contenido) para invalidar la caché de CSS y JS
const v = (f) => createHash('sha256').update(readFileSync(join(root, f))).digest('hex').slice(0, 10);
const cssV = v('styles.css');
const jsV = v('main.js');

const NOINDEX = '<meta name="robots" content="noindex, nofollow">\n';
for (const page of ['index.html', 'privacidad.html', 'en/index.html', 'en/privacidad.html', '404.html']) {
  const file = join(dist, page);
  let html = readFileSync(file, 'utf8');
  html = html.split(NOINDEX).join('');
  html = html.replace(/(href="\/?styles\.css)"/g, `$1?v=${cssV}"`).replace(/(src="\/?main\.js)"/g, `$1?v=${jsV}"`);
  if (page !== '404.html' && html.includes('noindex')) throw new Error('Quedó noindex en ' + page);
  writeFileSync(file, html);
}

// ---- ZIP (formato estándar, compresión deflate) ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function walk(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? [p + sep, ...walk(p)] : [p];
  });
}

const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const locals = [];
const centrals = [];
let offset = 0;
for (const p of walk(dist)) {
  const isDir = p.endsWith(sep);
  const name = Buffer.from(relative(dist, p).split(sep).join('/') + (isDir ? '/' : ''), 'utf8');
  const data = isDir ? Buffer.alloc(0) : readFileSync(p);
  const comp = isDir ? data : deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const method = isDir ? 0 : 8;

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
  lh.writeUInt16LE(method, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(method, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(((isDir ? 0o40755 : 0o100644) << 16) >>> 0, 38);
  ch.writeUInt32LE(offset, 42);

  locals.push(lh, name, comp);
  centrals.push(ch, name);
  offset += lh.length + name.length + comp.length;
}
const central = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
writeFileSync(zipPath, Buffer.concat([...locals, central, end]));

console.log(`\ndist/ listo (${walk(dist).filter((p) => !p.endsWith(sep)).length} archivos)`);
console.log(`cozze-dist.zip: ${(statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB`);
