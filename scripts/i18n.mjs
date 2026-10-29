#!/usr/bin/env node
// Genera la versión en inglés (en/index.html y en/privacidad.html) a partir de
// las páginas en español y del diccionario i18n/en.json. Sin dependencias.
//
// Cómo funciona:
//  1. Toma el HTML en español tal cual (misma estructura, estilos e imágenes).
//  2. Ajusta lo estructural para /en/: lang, canonical, rutas absolutas,
//     selector de idioma, enlaces a la Política de Privacidad y campo "lang".
//  3. Reemplaza cada texto visible y cada atributo traducible (alt, aria-label,
//     title, placeholder, meta description/og) por su traducción exacta.
//  Si algún texto en español no tiene traducción, se detiene y lo lista:
//  así nunca queda contenido sin traducir.
//
// Uso: node scripts/i18n.mjs   (o: npm run i18n)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dict = JSON.parse(readFileSync(join(root, 'i18n/en.json'), 'utf8'));
const keep = new Set(dict.keep);
const text = dict.text;
const missing = new Set();
const used = new Set();

const SITE = 'https://www.cozze.cl';

function replaceOnce(html, from, to, count = 1) {
  const n = html.split(from).length - 1;
  if (n !== count) throw new Error(`Se esperaba ${count} vez/veces "${from.slice(0, 70)}" y hay ${n}`);
  return html.split(from).join(to);
}

function tr(s) {
  const t = s.trim();
  if (!/\p{L}/u.test(t) || keep.has(t)) return s;
  if (!(t in text)) { missing.add(t); return s; }
  used.add(t);
  return s.replace(t, text[t]);
}

// Traduce textos y atributos; deja intactos <script> y <style>
function translate(html) {
  return html.replace(/(<(script|style)\b[\s\S]*?<\/\2>)|(<[^>]+>)|([^<]+)/g, (m, block, _n, tag, txt) => {
    if (block) return block;
    if (txt) return tr(txt);
    const isMeta = /^<meta\s+(name="description"|property="og:(title|description)")/.test(tag);
    return tag.replace(/\s(alt|aria-label|title|placeholder|content)="([^"]*)"/g, (a, name, val) => {
      if (name === 'content' && !isMeta) return a;
      return a.replace(`"${val}"`, `"${tr(val)}"`);
    });
  });
}

// Selector de idioma: "English" pasa a ser la opción activa y "Español" el enlace
function swapLangSwitch(html, esHref) {
  const re = /<span aria-current="true" style="([^"]*)"><span>Español<\/span><span style="([^"]*)">ES<\/span><\/span>\n<a href="[^"]*" hreflang="en" lang="en" data-lang-switch style="([^"]*)"><span>English<\/span><span style="([^"]*)">EN<\/span><\/a>/;
  const m = html.match(re);
  if (!m) throw new Error('No se encontró el selector de idioma');
  const [, activeStyle, activeCode, linkStyle, linkCode] = m;
  html = html.replace(re,
    `<a href="${esHref}" hreflang="es" lang="es" data-lang-switch style="${linkStyle}"><span>Español</span><span style="${linkCode}">ES</span></a>\n` +
    `<span aria-current="true" style="${activeStyle}"><span>English</span><span style="${activeCode}">EN</span></span>`);
  return replaceOnce(html, '<span>ES</span><svg width="12"', '<span>EN</span><svg width="12"');
}

function commonPaths(html) {
  html = replaceOnce(html, '<html lang="es">', '<html lang="en">');
  html = replaceOnce(html, 'href="assets/favicon.svg"', 'href="/assets/favicon.svg"');
  html = replaceOnce(html, 'href="styles.css"', 'href="/styles.css"');
  html = replaceOnce(html, 'src="main.js"', 'src="/main.js"');
  return html;
}

function buildIndex() {
  let html = readFileSync(join(root, 'index.html'), 'utf8');
  html = commonPaths(html);
  html = replaceOnce(html, `<link rel="canonical" href="${SITE}/">`, `<link rel="canonical" href="${SITE}/en/">`);
  html = replaceOnce(html, `<meta property="og:url" content="${SITE}/">`, `<meta property="og:url" content="${SITE}/en/">`);
  html = html.replace(/src="assets\//g, 'src="/assets/');
  html = replaceOnce(html, 'href="privacidad.html"', 'href="/en/privacidad.html"', 2);
  html = replaceOnce(html, '<input type="hidden" name="lang" value="es">', '<input type="hidden" name="lang" value="en">');
  html = swapLangSwitch(html, '/');
  return translate(html);
}

function buildPrivacy() {
  let html = readFileSync(join(root, 'privacidad.html'), 'utf8');
  html = commonPaths(html);
  html = replaceOnce(html, `<link rel="canonical" href="${SITE}/privacidad.html">`, `<link rel="canonical" href="${SITE}/en/privacidad.html">`);
  html = replaceOnce(html, `<meta property="og:url" content="${SITE}/privacidad.html">`, `<meta property="og:url" content="${SITE}/en/privacidad.html">`);
  html = replaceOnce(html, 'href="./"', 'href="/en/"', 2);
  html = swapLangSwitch(html, '/privacidad.html');
  return translate(html);
}

const out = { 'en/index.html': buildIndex(), 'en/privacidad.html': buildPrivacy() };

if (missing.size) {
  console.error(`Faltan ${missing.size} traducciones en i18n/en.json ("text"):\n`);
  for (const t of missing) console.error('  ' + JSON.stringify(t));
  process.exit(1);
}
const unused = Object.keys(text).filter((t) => !used.has(t));
if (unused.length) {
  console.warn(`Aviso: ${unused.length} traducciones ya no se usan (puedes borrarlas):`);
  for (const t of unused) console.warn('  ' + JSON.stringify(t));
}

mkdirSync(join(root, 'en'), { recursive: true });
for (const [file, html] of Object.entries(out)) {
  writeFileSync(join(root, file), html);
  console.log('Generado ' + file);
}
