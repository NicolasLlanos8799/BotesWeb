/**
 * Build script — Seaduced Experience
 *
 * 1. Bundles JS entry points with esbuild (content-hashed filenames)
 * 2. Copies all static files to dist/
 * 3. Rewrites HTML <script src> tags to use hashed filenames
 *
 * Run: node build.js
 * Output: dist/  (served by Vercel via outputDirectory)
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

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
  'scratch',      // dev scratch pad
  'build.js',
  'middleware.js',
  'migrate-data.js',
  'AppScript-PROD.js',
  'AppScript-DEMO.js',
  'convert_to_webp.py',
  'package.json',
  'package-lock.json',
  'vercel.json',
  'CLAUDE.md',
  'README.md',
  'ENVIRONMENTS.md',
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

function updateHtml(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const [name, hashed] of Object.entries(manifest)) {
    // Matches /js/name.js and /js/name.js?v=anything
    const pattern = new RegExp(`/js/${name}\\.js(?:\\?[^"'\\s>]*)?`, 'g');
    const next = html.replace(pattern, `/js/${hashed}`);
    if (next !== html) { html = next; changed = true; }
  }

  if (changed) fs.writeFileSync(filePath, html, 'utf8');
}

function walkHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(p);
    else if (entry.name.endsWith('.html')) updateHtml(p);
  }
}

console.log('Updating HTML references...');
walkHtml(DIST);

console.log(`\n✓ Build complete → ${DIST}/`);
