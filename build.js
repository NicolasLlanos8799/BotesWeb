/**
 * Build script — Seaduced Experience
 *
 * 1. Bundles JS entry points with esbuild (content-hashed filenames)
 * 2. Copies all static files to dist/
 * 3. Rewrites HTML <script src> tags to use hashed JS filenames
 * 4. Hashes bundle.css and rewrites HTML <link href> tags
 *
 * Run: node build.js
 * Output: dist/  (served by Vercel via outputDirectory)
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = '.';
const DIST = './dist';

// Directories / files that must NOT be copied to the static output.
// Server-side code (api/, lib/, middleware.js) stays at project root
// so Vercel can discover serverless functions.
const EXCLUDE = new Set([
  'node_modules',
  '.git',
  '.vercel',
  'dist',
  'js',           // replaced by hashed bundles in dist/js/
  'api',          // Vercel serverless functions — stay at root
  'lib',          // imported by api/ — stay at root
  'scripts',      // CLI/admin Node scripts
  'db',           // SQL schema only
  'docs',         // internal documentation
  '.claude',
  'build.js',
  'middleware.js',
  'AppScript-PROD-BookingWeb.js',
  'AppScript-DEMO-BookingWeb.js',
  'AppScript-PROD-GYG.js',
  'AppScript-DEMO-GYG.js',
  'package.json',
  'package-lock.json',
  'vercel.json',
  'CLAUDE.md',
  'README.md',
  '.DS_Store',
]);

// ─── 1. Clean & prepare dist ────────────────────────────────────────────────

try {
  fs.rmSync(DIST, { recursive: true, force: true });
} catch (_) {
  // dist may not exist or be unremovable in some environments — overwrite in place
}
fs.mkdirSync(`${DIST}/js`, { recursive: true });

// ─── 2. Bundle JS with content hashes ───────────────────────────────────────

console.log('Bundling JS...');

const result = await esbuild.build({
  entryPoints: [
    'js/main.js',
    'js/admin.js',
    'js/admin-calendar.js',
    'js/i18n.js',
    'js/analytics.js',
    'js/success.js',
  ],
  bundle: true,
  splitting: true,       // handles dynamic imports (experience.js, booking.js, reserve.js)
  format: 'esm',
  outdir: `${DIST}/js`,
  entryNames: '[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  metafile: true,
  minify: true,
});

// Build manifest: original entry name → hashed output filename
// e.g. { main: 'main-ABC123.js', admin: 'admin-DEF456.js', ... }
const manifest = {};
for (const [outPath, info] of Object.entries(result.metafile.outputs)) {
  if (info.entryPoint) {
    const name = path.basename(info.entryPoint, '.js');
    manifest[name] = path.basename(outPath);
  }
}

console.log('JS manifest:', manifest);

// ─── 3. Copy static files to dist/ ──────────────────────────────────────────

function copyDir(src, dest, isRoot = false) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    // EXCLUDE only applies at the project root — otherwise a name like
    // "docs" also matches subfolders (e.g. assets/docs/) and silently
    // drops them from dist/.
    if (isRoot && EXCLUDE.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, false);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying static files...');
copyDir(ROOT, DIST, true);

// ─── 4. Rewrite <script src="/js/NAME.js"> in all HTML files ────────────────

// Walks dist/ and applies `transform(html)` to every .html file.
function walkHtml(dir, transform) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(p, transform);
    else if (entry.name.endsWith('.html')) {
      const html = fs.readFileSync(p, 'utf8');
      const next = transform(html);
      if (next !== html) fs.writeFileSync(p, next, 'utf8');
    }
  }
}

// Replaces /asset/name.ext (and ?v=... variants) with the hashed filename.
function rewriteAsset(html, dirName, name, ext, hashed) {
  const pattern = new RegExp(`/${dirName}/${name}\\.${ext}(?:\\?[^"'\\s>]*)?`, 'g');
  return html.replace(pattern, `/${dirName}/${hashed}`);
}

console.log('Updating HTML references...');
walkHtml(DIST, (html) => {
  for (const [name, hashed] of Object.entries(manifest)) {
    html = rewriteAsset(html, 'js', name, 'js', hashed);
  }
  return html;
});

// ─── 5. Hash CSS bundle and rewrite HTML <link href> ────────────────────────

console.log('Hashing CSS bundle...');

const CSS_FILES = ['bundle.css', 'admin.css'];

for (const cssFile of CSS_FILES) {
  const srcCss = path.join(DIST, 'css', cssFile);
  if (!fs.existsSync(srcCss)) continue;

  // Minify before hashing — bundle.css ships ~188 KB raw and is render-blocking.
  const rawCss = fs.readFileSync(srcCss, 'utf8');
  const minified = (await esbuild.transform(rawCss, {
    loader: 'css',
    minify: true,
  })).code;
  fs.writeFileSync(srcCss, minified, 'utf8');
  console.log(
    `  minified ${cssFile}: ${(rawCss.length / 1024).toFixed(0)} KB → ${(minified.length / 1024).toFixed(0)} KB`
  );

  const content = fs.readFileSync(srcCss);
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  const baseName = path.basename(cssFile, '.css');
  const hashedName = `${baseName}-${hash}.css`;

  fs.renameSync(srcCss, path.join(DIST, 'css', hashedName));

  // Rewrite all HTML files: /css/bundle.css → /css/bundle-[hash].css
  walkHtml(DIST, (html) => rewriteAsset(html, 'css', baseName, 'css', hashedName));
  console.log(`  ${cssFile} → ${hashedName}`);
}

// ─── 6. Generate language subdirectories (es/, da/) ────────────────────────
// Copy all HTML files to dist/es/ and dist/da/ preserving structure.
// Assets use absolute paths so they work from any subdir.

console.log('Generating language directories...');

const LANGS = ['es', 'da'];

function copyHtmlTree(src, langDest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(langDest, entry.name);
    if (entry.isDirectory()) {
      // Skip the language dirs themselves to avoid infinite nesting
      if (LANGS.includes(entry.name)) continue;
      copyHtmlTree(srcPath, destPath);
    } else if (entry.name.endsWith('.html')) {
      fs.mkdirSync(langDest, { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const lang of LANGS) {
  copyHtmlTree(DIST, path.join(DIST, lang));
  console.log(`  ✓ dist/${lang}/`);
}

// ─── 7. Localize SEO head tags in dist/es/ and dist/da/ ────────────────────
// The language dirs are byte-identical copies of the EN HTML, so without this
// step every /es/ and /da/ page ships an English <title>/<meta description>
// and a canonical pointing at the EN URL → Google never indexes them.

console.log('Localizing SEO head tags...');

const SITE = 'https://www.seaduced-experience.com';
const OG_LOCALE = { en: 'en_US', es: 'es_ES', da: 'da_DK' };

const locales = {};
for (const lang of LANGS) {
  locales[lang] = JSON.parse(fs.readFileSync(`${DIST}/locales/${lang}.json`, 'utf8'));
}

// Resolves "a.b.c" against a locale object.
function tkey(obj, key) {
  return key.split('.').reduce((o, k) => (o != null && k in o ? o[k] : undefined), obj);
}

// Maps a dist-relative HTML path to its i18n title/description keys.
// Falls back to the page's body[data-i18n-title] prefix when present.
function seoKeys(html, urlPath) {
  const m = html.match(/data-i18n-title="([^"]+)"/);
  if (m) {
    const base = m[1].replace(/\.title$/, '');
    return { title: `${base}.title`, desc: [`${base}.description`, `${base}.desc`] };
  }
  // Only the home page may use the root page.* keys — otherwise untranslated
  // pages (e.g. /guides/) would inherit the home title and description.
  if (urlPath === '/') return { title: 'page.title', desc: ['page.description', 'page.desc'] };
  return { title: null, desc: [] };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Replaces the content="..." of a meta tag matched by `attr="value"`.
function setMeta(html, attr, value, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${value}"[^>]*?content=")[^"]*(")`, 'i');
  if (re.test(html)) return html.replace(re, `$1${esc(content)}$2`);
  // handle attribute order where content comes first
  const re2 = new RegExp(`(<meta\\s+content=")[^"]*("[^>]*?${attr}="${value}")`, 'i');
  return html.replace(re2, `$1${esc(content)}$2`);
}

function localizeHtml(html, lang, urlPath) {
  const L = locales[lang];
  const keys = seoKeys(html, urlPath);
  const title = keys.title ? tkey(L, keys.title) : undefined;
  let desc;
  for (const dk of keys.desc) { desc = desc ?? tkey(L, dk); }

  // No translated copy for this page (e.g. /guides/): keep the EN canonical and
  // noindex the language copy so it can't compete as duplicate content.
  if (!title && !desc) {
    if (/<meta name="robots"/i.test(html)) {
      html = html.replace(/(<meta name="robots"[^>]*content=")[^"]*(")/i, '$1noindex, follow$2');
    } else {
      html = html.replace(/<\/head>/i, '  <meta name="robots" content="noindex, follow" />\n</head>');
    }
    return html;
  }

  // <html lang>
  html = html.replace(/<html\s+lang="[^"]*"/i, `<html lang="${lang}"`);

  // <title> + meta description
  if (title) html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  if (desc) html = setMeta(html, 'name', 'description', desc);

  // canonical → self (localized URL), otherwise /es/ and /da/ are deindexed
  html = html.replace(
    /(<link rel="canonical"\s+href=")[^"]*(")/i,
    `$1${SITE}/${lang}${urlPath}$2`
  );

  // Open Graph / Twitter
  html = html.replace(/(<meta property="og:url"[^>]*content=")[^"]*(")/i, `$1${SITE}/${lang}${urlPath}$2`);
  if (/<meta property="og:locale"/i.test(html)) {
    html = html.replace(/(<meta property="og:locale"[^>]*content=")[^"]*(")/i, `$1${OG_LOCALE[lang]}$2`);
  } else {
    html = html.replace(/(<meta property="og:url"[^>]*>)/i, `$1\n  <meta property="og:locale" content="${OG_LOCALE[lang]}" />`);
  }
  if (title) {
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'name', 'twitter:title', title);
  }
  if (desc) {
    html = setMeta(html, 'property', 'og:description', desc);
    html = setMeta(html, 'name', 'twitter:description', desc);
  }
  return html;
}

// Walks dist/<lang>/ and rewrites each HTML file with its localized head.
function localizeTree(lang, dir, base) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      localizeTree(lang, p, `${base}${entry.name}/`);
    } else if (entry.name === 'index.html') {
      const html = fs.readFileSync(p, 'utf8');
      fs.writeFileSync(p, localizeHtml(html, lang, base), 'utf8');
    }
  }
}

for (const lang of LANGS) {
  localizeTree(lang, path.join(DIST, lang), '/');
  console.log(`  ✓ localized dist/${lang}/`);
}

console.log(`\n✓ Build complete → ${DIST}/`);
