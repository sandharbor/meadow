// Build entry for the vendored Excalidraw renderer bundle.
//
// The bundled output is checked into `src/html/shared/excalidraw-vendor.js`
// alongside `mermaid.min.js` — the model is "vendor a third-party renderer";
// we don't maintain its source. Refresh by running:
//
//   node scripts/build-excalidraw-vendor.mjs
//
// The bundle exposes a `window.MeadowExcalidraw` global with the small
// surface our init script (`meadow-excalidraw.js`) needs.

import { exportToSvg } from '@excalidraw/excalidraw';
import LZString from 'lz-string';

// React/ReactDOM are bundled in too because Excalidraw's renderer expects
// them at module load time even if we never mount the React component.

window.MeadowExcalidraw = { exportToSvg, LZString };
