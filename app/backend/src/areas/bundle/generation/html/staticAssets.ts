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
import { performance } from 'perf_hooks';
import type { StaticAssetNames } from './types.js';
import { recordTimingMetric } from '../../../../shared/telemetry/timingMetrics.js';
import { deterministicGzip, writeCompressionManifest } from '../../../../../../shared_code/utils/compressionManifestUtils.js';
import {
  CUSTOMIZATION_ASSETS_DIRECTORY,
  SPACED_REPETITION_ASSETS_DIRECTORY,
} from '../customizationAssets.js';

/**
 * Pre-gzip these shared assets at generation time. The excalidraw vendor
 * bundle is 7.7 MB raw — over the 4 MB per-file publish ceiling — but ~2.4 MB
 * gzipped. Pre-compressing once at generation (rather than at preview-serve
 * or publish time) means the bytes on disk are exactly what the browser
 * receives in production, so preview is a true preview. The local-export
 * path re-inflates these so file:// users still get parseable JS.
 */
const PRE_GZIPPED_BASENAMES = new Set(['excalidraw-vendor.js']);

interface ContentDigest {
  digest: string;
  bytes: Buffer;
}

interface RenameWithHashResult {
  oldBasename: string;
  newBasename: string;
  newPath: string;
  contentDigest: string;
}

interface RenameWithHashAndContentResult extends RenameWithHashResult {
  bytes: Buffer;
}

export interface PrecompressedAssetSource {
  sourceSha256: string;
  gzipPath: string;
  gzipSha256?: string;
}

interface HashStaticAssetsOptions {
  precompressedSourceAssets?: Record<string, PrecompressedAssetSource>;
}

function readContentDigest(filePath: string): ContentDigest {
  const bytes = fs.readFileSync(filePath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  return { digest, bytes };
}

function renameWithHash(filePath: string): RenameWithHashResult {
  const { digest } = readContentDigest(filePath);
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const hash = digest.slice(0, 8);
  const newBasename = `${base}.${hash}${ext}`;
  const newPath = path.join(dir, newBasename);
  fs.renameSync(filePath, newPath);
  return { oldBasename: path.basename(filePath), newBasename, newPath, contentDigest: digest };
}

function renameWithHashAndContent(filePath: string): RenameWithHashAndContentResult {
  const { digest, bytes } = readContentDigest(filePath);
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const hash = digest.slice(0, 8);
  const newBasename = `${base}.${hash}${ext}`;
  const newPath = path.join(dir, newBasename);
  fs.renameSync(filePath, newPath);
  return { oldBasename: path.basename(filePath), newBasename, newPath, contentDigest: digest, bytes };
}

function renameWithHashIfExists(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  return renameWithHash(filePath).newBasename;
}

function writePrecompressedSourceAsset(outputDir: string, assetBasename: string, source: PrecompressedAssetSource): string {
  const ext = path.extname(assetBasename);
  const base = path.basename(assetBasename, ext);
  const newBasename = `${base}.${source.sourceSha256.slice(0, 8)}${ext}`;
  const writeStart = performance.now();
  fs.copyFileSync(source.gzipPath, path.join(outputDir, newBasename));
  recordTimingMetric('bundle.static_assets.stage', performance.now() - writeStart, {
    stage: 'gzip_precompressed_asset',
    asset: assetBasename,
    precomputed: true,
  });
  return newBasename;
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
 * Hashes and renames the "static" assets in a rendered bundle folder.
 *
 * - Renames shared CSS/JS assets (including nested SRS and search runtime assets),
 *   `mermaid.min.js`, and all font files under `fonts/` by inserting
 *   `.<sha256_8>` before the extension. The frequently changing folder-navigation
 *   data keeps a stable filename so routine page additions do not rewrite every
 *   generated HTML page.
 * - Rewrites `style.css` font URLs to point at the renamed font files using a **relative**
 *   `fonts/<font>.<hash>.<ext>` path.
 *
 * Returns the new relative paths for shared assets so HTML rendering can reference them.
 */
export function hashAndRenameStaticAssets(outputDir: string, options: HashStaticAssetsOptions = {}): StaticAssetNames {
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
  const structuralPagesCss = renameWithHashIfExists(path.join(outputDir, 'structural-pages.css')) ?? '';
  const excalidrawCss = renameWithHashIfExists(path.join(outputDir, 'meadow-excalidraw.css')) ?? '';
  const excalidrawJs = renameWithHashIfExists(path.join(outputDir, 'meadow-excalidraw.js')) ?? '';

  // Hash for the URL was computed on the raw bytes (above), so the URL stays
  // stable across compression form. Now overwrite the on-disk bytes with the
  // gzipped form and record it in the manifest.
  const gzipPaths: string[] = [];
  let excalidrawVendorJs = '';
  const excalidrawVendorSource = options.precompressedSourceAssets?.['excalidraw-vendor.js'];
  if (excalidrawVendorSource && fs.existsSync(excalidrawVendorSource.gzipPath)) {
    excalidrawVendorJs = writePrecompressedSourceAsset(outputDir, 'excalidraw-vendor.js', excalidrawVendorSource);
    gzipPaths.push(excalidrawVendorJs);
  } else {
    const excalidrawVendorPath = path.join(outputDir, 'excalidraw-vendor.js');
    const excalidrawVendorResult = fs.existsSync(excalidrawVendorPath)
      ? renameWithHashAndContent(excalidrawVendorPath)
      : undefined;
    excalidrawVendorJs = excalidrawVendorResult?.newBasename ?? '';
    if (excalidrawVendorResult && PRE_GZIPPED_BASENAMES.has(excalidrawVendorResult.oldBasename)) {
      const gzipStart = performance.now();
      const gzippedBytes = deterministicGzip(excalidrawVendorResult.bytes);
      recordTimingMetric('bundle.static_assets.stage', performance.now() - gzipStart, {
        stage: 'gzip_precompressed_asset',
        asset: excalidrawVendorResult.oldBasename,
        precomputed: false,
      });
      fs.writeFileSync(excalidrawVendorResult.newPath, gzippedBytes);
      gzipPaths.push(excalidrawVendorJs);
    }
  }
  const srsDir = path.join(
    outputDir,
    CUSTOMIZATION_ASSETS_DIRECTORY,
    SPACED_REPETITION_ASSETS_DIRECTORY
  );
  const srsCssBase = renameWithHashIfExists(path.join(srsDir, 'srs.css'));
  const srsJsBase = renameWithHashIfExists(path.join(srsDir, 'srs.js'));
  const srsCss = srsCssBase
    ? `${CUSTOMIZATION_ASSETS_DIRECTORY}/${SPACED_REPETITION_ASSETS_DIRECTORY}/${srsCssBase}`
    : undefined;
  const srsJs = srsJsBase
    ? `${CUSTOMIZATION_ASSETS_DIRECTORY}/${SPACED_REPETITION_ASSETS_DIRECTORY}/${srsJsBase}`
    : undefined;

  const searchDir = path.join(outputDir, CUSTOMIZATION_ASSETS_DIRECTORY, 'search');
  const searchCssBase = renameWithHashIfExists(path.join(searchDir, 'search.css'));
  const searchJsBase = renameWithHashIfExists(path.join(searchDir, 'search.js'));
  const searchCss = searchCssBase ? `cust/search/${searchCssBase}` : undefined;
  const searchJs = searchJsBase ? `cust/search/${searchJsBase}` : undefined;

  const hoverPreviewDir = path.join(outputDir, CUSTOMIZATION_ASSETS_DIRECTORY, 'hover_preview');
  const hoverPreviewCssBase = renameWithHashIfExists(path.join(hoverPreviewDir, 'hover-preview.css'));
  const hoverPreviewJsBase = renameWithHashIfExists(path.join(hoverPreviewDir, 'hover-preview.js'));
  const hoverPreviewCss = hoverPreviewCssBase ? `cust/hover_preview/${hoverPreviewCssBase}` : undefined;
  const hoverPreviewJs = hoverPreviewJsBase ? `cust/hover_preview/${hoverPreviewJsBase}` : undefined;

  const folderNavigationDir = path.join(outputDir, CUSTOMIZATION_ASSETS_DIRECTORY, 'folder_nav');
  const folderNavigationCssBase = renameWithHashIfExists(path.join(folderNavigationDir, 'folder-nav.css'));
  const folderNavigationJsBase = renameWithHashIfExists(path.join(folderNavigationDir, 'folder-nav.js'));
  const folderNavigationCss = folderNavigationCssBase ? `cust/folder_nav/${folderNavigationCssBase}` : undefined;
  const folderNavigationDataJs = fs.existsSync(path.join(folderNavigationDir, 'folder-nav-data.js'))
    ? 'cust/folder_nav/folder-nav-data.js'
    : undefined;
  const folderNavigationJs = folderNavigationJsBase ? `cust/folder_nav/${folderNavigationJsBase}` : undefined;

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

  // Custom assets: global and bundle CSS/JS (both can coexist for append mode)
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
  const bundleStylePath = path.join(outputDir, 'bundle-style.css');
  rewriteCustomCssRefs(globalStylePath);
  rewriteCustomCssRefs(bundleStylePath);

  const globalStyleCss = renameWithHashIfExists(globalStylePath);
  const bundleStyleCss = renameWithHashIfExists(bundleStylePath);
  const globalJavascriptJs = renameWithHashIfExists(path.join(outputDir, 'global-javascript.js'));
  const bundleJavascriptJs = renameWithHashIfExists(path.join(outputDir, 'bundle-javascript.js'));

  // Only emit the manifest when there's something pre-compressed — consumers
  // already handle a missing manifest as "nothing special, treat normally."
  if (gzipPaths.length > 0) {
    writeCompressionManifest(outputDir, { gzip: gzipPaths });
  }

  return { styleCss, javascriptJs, mermaidMinJs, calloutsCss, structuralPagesCss, excalidrawCss, excalidrawVendorJs, excalidrawJs, srsCss, srsJs, searchCss, searchJs, hoverPreviewCss, hoverPreviewJs, folderNavigationCss, folderNavigationDataJs, folderNavigationJs, globalStyleCss, bundleStyleCss, globalJavascriptJs, bundleJavascriptJs };
}
