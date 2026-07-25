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

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying static files...');
copyDir(ROOT, DIST);

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

console.log(`\n✓ Build complete → ${DIST}/`);
