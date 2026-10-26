// One-off build of the pdf.js vendor bundle and its worker. Output is checked
// into src/areas/bundle/generation/html/shared/. Re-run when bumping the
// pdfjs-dist version.

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDirectory = path.join(__dirname, '..', 'src', 'areas', 'bundle', 'generation', 'html', 'shared');
const outfile = path.join(sharedDirectory, 'pdf-vendor.js');
const workerOutfile = path.join(sharedDirectory, 'pdf-worker.js');

await esbuild.build({
  entryPoints: [path.join(__dirname, 'pdf-vendor-entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile,
  platform: 'browser',
  target: 'es2020',
  // `import.meta.url` is only read on pdf.js's Node.js path.
  define: { 'import.meta.url': 'undefined' },
});

// pdf.js starts its worker as a module worker from this file.
fs.copyFileSync(
  path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
  workerOutfile,
);

console.log(`Built ${outfile}`);
console.log(`Copied ${workerOutfile}`);
