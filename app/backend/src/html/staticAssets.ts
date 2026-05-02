/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { StaticAssetNames } from './types.js';
import { deterministicGzip, writeCompressionManifest } from '../../../shared_code/utils/compressionManifestUtils.js';

/**
 * Pre-gzip these shared assets at generation time. The excalidraw vendor
 * bundle is 7.7 MB raw — over the 4 MB per-file publish ceiling — but ~2.4 MB
 * gzipped. Pre-compressing once at generation (rather than at preview-serve
 * or publish time) means the bytes on disk are exactly what the browser
 * receives in production, so preview is a true preview. The local-export
 * path re-inflates these so file:// users still get parseable JS.
 */
const PRE_GZIPPED_BASENAMES = new Set(['excalidraw-vendor.js']);

function contentHashHex8(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

function renameWithHash(filePath: string): { oldBasename: string; newBasename: string; newPath: string } {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const hash = contentHashHex8(filePath);
  const newBasename = `${base}.${hash}${ext}`;
  const newPath = path.join(dir, newBasename);
  fs.renameSync(filePath, newPath);
  return { oldBasename: path.basename(filePath), newBasename, newPath };
}

function renameWithHashIfExists(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  return renameWithHash(filePath).newBasename;
}

function listFilesRecursively(rootDir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [rootDir];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function isFontFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.woff' || ext === '.woff2' || ext === '.ttf' || ext === '.eot' || ext === '.otf';
}

/**
 * Hashes and renames the "static" assets in a rendered site folder.
 *
 * - Renames `style.css`, `javascript.js`, `mermaid.min.js` and all font files under `fonts/`
 *   by inserting `.<sha256_8>` before the extension.
 * - Rewrites `style.css` font URLs to point at the renamed font files using a **relative**
 *   `fonts/<font>.<hash>.<ext>` path.
 *
 * Returns the new basenames for the top-level shared assets so HTML rendering can reference them.
 */
export function hashAndRenameStaticAssets(outputDir: string): StaticAssetNames {
  const fontsDir = path.join(outputDir, 'fonts');
  const fontRenameMap: Map<string, string> = new Map(); // oldBasename -> newBasename

  if (fs.existsSync(fontsDir) && fs.statSync(fontsDir).isDirectory()) {
    const fontFiles = listFilesRecursively(fontsDir).filter(isFontFile);
    // Deterministic ordering for deterministic renames in logs/tests.
    fontFiles.sort();
    for (const fontPath of fontFiles) {
      const { oldBasename, newBasename } = renameWithHash(fontPath);
      fontRenameMap.set(oldBasename, newBasename);
    }
  }

  // Rewrite style.css font references before hashing/renaming it.
  const stylePath = path.join(outputDir, 'style.css');
  if (fs.existsSync(stylePath)) {
    let css = fs.readFileSync(stylePath, 'utf8');

    // First: ensure "absolute /shared/fonts" and "/fonts" become relative "fonts/".
    css = css.split('/shared/fonts/').join('fonts/');
    css = css.split('shared/fonts/').join('fonts/');
    css = css.split('/fonts/').join('fonts/');

    // Then: apply hashed font basenames.
    for (const [oldBasename, newBasename] of fontRenameMap.entries()) {
      const replacements = [
        `fonts/${oldBasename}`,
        `/fonts/${oldBasename}`,
        `/shared/fonts/${oldBasename}`,
        `shared/fonts/${oldBasename}`,
      ];
      for (const needle of replacements) {
        css = css.split(needle).join(`fonts/${newBasename}`);
      }
    }

    fs.writeFileSync(stylePath, css, 'utf8');
  }

  // style.css and javascript.js may not exist if base is disabled
  const styleCss = renameWithHashIfExists(stylePath) ?? '';
  const javascriptJs = renameWithHashIfExists(path.join(outputDir, 'javascript.js')) ?? '';
  const { newBasename: mermaidMinJs } = renameWithHash(path.join(outputDir, 'mermaid.min.js'));
  const { newBasename: calloutsCss } = renameWithHash(path.join(outputDir, 'callouts.css'));
  const excalidrawCss = renameWithHashIfExists(path.join(outputDir, 'meadow-excalidraw.css')) ?? '';
  const excalidrawVendorJs = renameWithHashIfExists(path.join(outputDir, 'excalidraw-vendor.js')) ?? '';
  const excalidrawJs = renameWithHashIfExists(path.join(outputDir, 'meadow-excalidraw.js')) ?? '';

  // Hash for the URL was computed on the raw bytes (above), so the URL stays
  // stable across compression form. Now overwrite the on-disk bytes with the
  // gzipped form and record it in the manifest.
  const gzipPaths: string[] = [];
  if (excalidrawVendorJs && PRE_GZIPPED_BASENAMES.has('excalidraw-vendor.js')) {
    const fullPath = path.join(outputDir, excalidrawVendorJs);
    const raw = fs.readFileSync(fullPath);
    fs.writeFileSync(fullPath, deterministicGzip(raw));
    gzipPaths.push(excalidrawVendorJs);
  }
  const srsDir = path.join(outputDir, 'srs');
  const srsCssBase = renameWithHashIfExists(path.join(srsDir, 'srs.css'));
  const srsJsBase = renameWithHashIfExists(path.join(srsDir, 'srs.js'));
  const srsCss = srsCssBase ? `srs/${srsCssBase}` : undefined;
  const srsJs = srsJsBase ? `srs/${srsJsBase}` : undefined;

  // Hash extra files first so we can rewrite references in custom CSS
  const extraDir = path.join(outputDir, 'extra');
  const extraRenameMap: Map<string, string> = new Map();
  if (fs.existsSync(extraDir) && fs.statSync(extraDir).isDirectory()) {
    const extraFiles = listFilesRecursively(extraDir);
    extraFiles.sort();
    for (const extraFilePath of extraFiles) {
      const { oldBasename, newBasename } = renameWithHash(extraFilePath);
      extraRenameMap.set(oldBasename, newBasename);
    }
  }

  // Custom assets: global and site CSS/JS (both can coexist for append mode)
  // Rewrite font and extra file references in custom CSS before hashing
  function rewriteCustomCssRefs(cssPath: string): void {
    if (!fs.existsSync(cssPath)) return;
    let css = fs.readFileSync(cssPath, 'utf8');
    css = css.split('/shared/fonts/').join('fonts/');
    css = css.split('shared/fonts/').join('fonts/');
    css = css.split('/fonts/').join('fonts/');
    for (const [oldBasename, newBasename] of fontRenameMap.entries()) {
      css = css.split(`fonts/${oldBasename}`).join(`fonts/${newBasename}`);
    }
    for (const [oldBase, newBase] of extraRenameMap.entries()) {
      css = css.split(`extra/${oldBase}`).join(`extra/${newBase}`);
    }
    fs.writeFileSync(cssPath, css, 'utf8');
  }

  const globalStylePath = path.join(outputDir, 'global-style.css');
  const siteStylePath = path.join(outputDir, 'site-style.css');
  rewriteCustomCssRefs(globalStylePath);
  rewriteCustomCssRefs(siteStylePath);

  const globalStyleCss = renameWithHashIfExists(globalStylePath);
  const siteStyleCss = renameWithHashIfExists(siteStylePath);
  const globalJavascriptJs = renameWithHashIfExists(path.join(outputDir, 'global-javascript.js'));
  const siteJavascriptJs = renameWithHashIfExists(path.join(outputDir, 'site-javascript.js'));

  // Only emit the manifest when there's something pre-compressed — consumers
  // already handle a missing manifest as "nothing special, treat normally."
  if (gzipPaths.length > 0) {
    writeCompressionManifest(outputDir, { gzip: gzipPaths });
  }

  return { styleCss, javascriptJs, mermaidMinJs, calloutsCss, excalidrawCss, excalidrawVendorJs, excalidrawJs, srsCss, srsJs, globalStyleCss, siteStyleCss, globalJavascriptJs, siteJavascriptJs };
}

