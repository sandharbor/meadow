// One-off build of the Excalidraw vendor bundle. Output is checked into
// src/html/shared/excalidraw-vendor.js. Re-run when bumping the
// @excalidraw/excalidraw version.

import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const entry = path.join(__dirname, 'excalidraw-vendor-entry.js');
const outfile = path.join(__dirname, '..', 'src', 'html', 'shared', 'excalidraw-vendor.js');

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

console.log(`Built ${outfile}`);
