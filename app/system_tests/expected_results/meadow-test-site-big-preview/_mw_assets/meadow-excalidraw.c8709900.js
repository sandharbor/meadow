// Renders Obsidian-Excalidraw drawings into placeholder containers.
//
// Each container looks like:
//   <div class="meadow-excalidraw-page" data-meadow-excalidraw-src="…/foo.excalidraw.md">
//     ...placeholder...
//   </div>
//
// We fetch the .md, decompress the lz-string `compressed-json` block, and
// hand the scene to Excalidraw's own `exportToSvg` (loaded via
// excalidraw-vendor.js, which exposes `window.MeadowExcalidraw`). This gives
// pixel parity with the Obsidian editor — RoughJS, perfect-freehand, fonts,
// links inside the drawing, all included.

(function () {
  'use strict';

  var FULLSCREEN_CLASS = 'is-fullscreen';
  var BODY_CLASS = 'meadow-excalidraw-fullscreen-active';

  function makeFullscreenButton(container) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'meadow-excalidraw-fullscreen-btn';
    btn.textContent = '⛶';
    btn.title = 'Fullscreen';
    btn.setAttribute('aria-label', 'Fullscreen');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var on = container.classList.toggle(FULLSCREEN_CLASS);
      document.body.classList.toggle(BODY_CLASS, on);
      btn.textContent = on ? '×' : '⛶';
      btn.title = on ? 'Exit fullscreen' : 'Fullscreen';
      btn.setAttribute('aria-label', btn.title);
    });
    return btn;
  }

  function extractCompressedScene(md) {
    var match = md.match(/```compressed-json\n([\s\S]*?)\n```/);
    if (!match) return null;
    var blob = match[1].replace(/\s+/g, '');
    var json = window.MeadowExcalidraw.LZString.decompressFromBase64(blob);
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch (err) {
      console.warn('[meadow-excalidraw] scene JSON parse failed', err);
      return null;
    }
  }

  // Parses the `## Text Elements` block of an Obsidian-Excalidraw .md and
  // returns a Map from element-id (the `^xxxx` block id) to its rendered
  // text (which may contain `[[wikilinks]]`). Obsidian uses this section as
  // the editable representation of the in-drawing text — scene elements with
  // `hasTextLink: true` get their link target from here.
  function parseTextElementsSection(md) {
    var map = new Map();
    var match = md.match(/##\s+Text Elements\s*\n([\s\S]*?)(?=\n##\s|\n%%|$)/);
    if (!match) return map;
    var lines = match[1].split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(.+?)\s+\^([A-Za-z0-9_-]+)\s*$/);
      if (!m) continue;
      map.set(m[2], m[1].trim());
    }
    return map;
  }

  // Extracts the inner-link text from an Obsidian-side wikilink like
  // `[[Target|alias]]` or `[[folder/Target]]`. Returns null when the input
  // isn't a wikilink. The returned string matches what Meadow's link layer
  // (Rust working_graph) keys its resolution map by.
  function extractWikilinkInner(text) {
    var m = text.match(/\[\[([^\]]+)\]\]/);
    if (!m) return null;
    return m[1].trim();
  }

  // Stamps `link` onto text elements whose Obsidian-side form is a wikilink,
  // using a server-resolved `linkMap` from the placeholder container. The
  // map keys are the original wikilink-inner-text strings produced by
  // Meadow's working graph; values are pre-computed hrefs relative to the
  // page hosting this drawing. Untracked targets are simply absent from the
  // map → we leave the text non-clickable.
  function applyTextElementLinks(scene, md, linkMap) {
    if (!scene || !scene.elements) return;
    var textMap = parseTextElementsSection(md);
    for (var i = 0; i < scene.elements.length; i++) {
      var el = scene.elements[i];
      if (el.type !== 'text') continue;
      if (el.link) continue;
      if (!el.hasTextLink) continue;
      var src = textMap.get(el.id);
      if (!src) continue;
      var inner = extractWikilinkInner(src);
      if (!inner) continue;
      var href = linkMap[inner];
      if (href) el.link = href;
    }
  }

  function readLinkMap(container) {
    var raw = container.getAttribute('data-meadow-excalidraw-links');
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      console.warn('[meadow-excalidraw] could not parse data-meadow-excalidraw-links', err);
      return {};
    }
  }

  async function renderContainer(container) {
    var src = container.getAttribute('data-meadow-excalidraw-src');
    if (!src) return;

    try {
      var resp = await fetch(src);
      if (!resp.ok) {
        container.textContent = 'Excalidraw drawing failed to load.';
        return;
      }
      var md = await resp.text();
      var scene = extractCompressedScene(md);
      if (!scene) {
        container.textContent = 'Excalidraw drawing data is missing or unreadable.';
        return;
      }
      applyTextElementLinks(scene, md, readLinkMap(container));
      var svg = await window.MeadowExcalidraw.exportToSvg({
        elements: scene.elements || [],
        appState: Object.assign({ exportBackground: true, exportWithDarkMode: false }, scene.appState || {}),
        files: scene.files || null,
        exportPadding: 12,
      });
      // Keep the intrinsic width/height attributes so the SVG has a real size
      // even when its container is `inline-block` (the embed-link case). CSS
      // (`max-width: 100%; height: auto`) handles responsive shrinking.
      container.replaceChildren(svg);
      // Standalone pages get a fullscreen toggle. Inline embeds (rendered as
      // anchors elsewhere) don't go through this path.
      if (container.classList.contains('meadow-excalidraw-page')) {
        container.appendChild(makeFullscreenButton(container));
      }
    } catch (err) {
      console.warn('[meadow-excalidraw] render failed', err);
      container.textContent = 'Excalidraw drawing failed to render.';
    }
  }

  function init() {
    var containers = document.querySelectorAll('[data-meadow-excalidraw-src]');
    containers.forEach(renderContainer);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var fs = document.querySelector('.meadow-excalidraw-page.' + FULLSCREEN_CLASS);
      if (!fs) return;
      var btn = fs.querySelector('.meadow-excalidraw-fullscreen-btn');
      if (btn) btn.click();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
