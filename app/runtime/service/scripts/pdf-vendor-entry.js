// Build entry for the vendored pdf.js renderer bundle.
//
// The bundled output is checked into `src/areas/bundle/generation/html/shared/pdf-vendor.js`,
// with pdf.js's worker beside it as `pdf-worker.js` — the model is "vendor a
// third-party renderer", as for Excalidraw and Mermaid. Refresh by running:
//
//   node scripts/build-pdf-vendor.mjs
//
// It uses pdf.js's legacy build, whose polyfills let readers' older browsers
// show PDFs too. The bundle exposes a `window.MeadowPdf` global with the small
// surface our init script (`meadow-pdf.js`) needs.

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

window.MeadowPdf = { getDocument, GlobalWorkerOptions };
