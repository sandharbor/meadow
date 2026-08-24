// One-off build of the Excalidraw vendor bundle. Output is checked into
// src/areas/bundle/generation/html/shared/excalidraw-vendor.js. Re-run when bumping the
// @excalidraw/excalidraw version.

import * as esbuild from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GZIP_HEADER_OS_OFFSET = 9;
const gzipOnly = process.argv.includes('--gzip-only');

const entry = path.join(__dirname, 'excalidraw-vendor-entry.js');
const outfile = path.join(__dirname, '..', 'src', 'areas', 'bundle', 'generation', 'html', 'shared', 'excalidraw-vendor.js');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function deterministicGzip(input) {
  const out = zlib.gzipSync(input, { level: zlib.constants.Z_BEST_COMPRESSION });
  out[GZIP_HEADER_OS_OFFSET] = 0xff;
  return out;
}

if (!gzipOnly) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'iife',
    outfile,
    platform: 'browser',
    target: 'es2020',
    // Excalidraw's index.ts side-imports SCSS/CSS/font files for the React
    // component. We don't render that component, but the imports still execute.
    // `empty` makes esbuild treat them as no-ops; visually-correct rendering
    // still works because exportToSvg uses a string-based SVG renderer.
    loader: {
      '.css': 'empty',
      '.scss': 'empty',
      '.woff2': 'empty',
      '.woff': 'empty',
      '.ttf': 'empty',
      '.eot': 'empty',
      '.svg': 'empty',
      '.png': 'empty',
    },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
} else if (!fs.existsSync(outfile)) {
  throw new Error(`Cannot update gzip artifact because ${outfile} does not exist.`);
}

const sourceBytes = fs.readFileSync(outfile);
const gzipBytes = deterministicGzip(sourceBytes);
const gzipOutfile = `${outfile}.gz`;
const metadataOutfile = `${gzipOutfile}.meta.json`;
const metadata = {
  version: 1,
  source: path.basename(outfile),
  sourceSha256: sha256(sourceBytes),
  gzip: path.basename(gzipOutfile),
  gzipSha256: sha256(gzipBytes),
  gzipAlgorithm: 'gzip',
  gzipLevel: zlib.constants.Z_BEST_COMPRESSION,
  gzipHeaderOsByte: 'ff',
};

fs.writeFileSync(gzipOutfile, gzipBytes);
fs.writeFileSync(metadataOutfile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

if (!gzipOnly) {
  console.log(`Built ${outfile}`);
}
console.log(`${gzipOnly ? 'Updated' : 'Built'} ${gzipOutfile}`);
console.log(`${gzipOnly ? 'Updated' : 'Built'} ${metadataOutfile}`);
