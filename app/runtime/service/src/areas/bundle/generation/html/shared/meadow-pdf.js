(function () {
  'use strict';

  // The page loads pdf.js's worker from the URL on this script's tag.
  var script = document.currentScript;
  var workerSrc = script && script.dataset.meadowPdfWorker
    ? new URL(script.dataset.meadowPdfWorker, document.baseURI).href
    : null;

  function parseJson(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (err) {
      console.warn('[meadow-pdf] could not parse link data', err);
      return fallback;
    }
  }

  // A file a PDF opens, as the working graph records its URI: `%`, `#`, `?`,
  // control characters, and non-ASCII characters percent-encoded.
  function fileUri(name) {
    return name.replace(/[%#?\u0000-\u001f\u007f]|[^\u0000-\u007f]+/g, encodeURIComponent);
  }

  // Where a link annotation goes: a page in the bundle, a page in this PDF, a
  // web address, or a file that is not tracked. Anything else is no link.
  function linkTarget(links, annotation) {
    if (annotation.dest) return { dest: annotation.dest };
    var raw = annotation.unsafeUrl || annotation.url;
    if (!raw) return null;
    var tracked = links.tracked[raw] || links.tracked[fileUri(raw)];
    if (tracked) return { href: tracked.href };
    if (links.untracked.indexOf(raw) >= 0 || links.untracked.indexOf(fileUri(raw)) >= 0) return { untracked: true };
    if (/^(?:https?|mailto):/i.test(raw)) return { external: raw };
    return null;
  }

  function addLink(viewer, doc, sheets, sheet, base, annotation, links) {
    var target = linkTarget(links, annotation);
    if (!target) return;
    var corner = base.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
    var opposite = base.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
    var rect = [corner[0], corner[1], opposite[0], opposite[1]];
    var left = Math.min(rect[0], rect[2]);
    var top = Math.min(rect[1], rect[3]);
    var element = document.createElement(target.untracked ? 'span' : 'a');
    element.className = target.untracked ? 'meadow-pdf-link meadow-pdf-link-not-tracked' : 'meadow-pdf-link';
    element.style.left = (left / base.width) * 100 + '%';
    element.style.top = (top / base.height) * 100 + '%';
    element.style.width = (Math.abs(rect[2] - rect[0]) / base.width) * 100 + '%';
    element.style.height = (Math.abs(rect[3] - rect[1]) / base.height) * 100 + '%';
    if (target.untracked) {
      element.title = 'link not tracked';
    } else if (target.href) {
      element.href = target.href;
    } else if (target.external) {
      element.href = target.external;
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
    } else {
      element.href = '#';
      element.addEventListener('click', function (event) {
        event.preventDefault();
        goToDestination(viewer, doc, sheets, target.dest);
      });
    }
    sheet.appendChild(element);
  }

  function goToDestination(viewer, doc, sheets, dest) {
    var explicit = typeof dest === 'string' ? doc.getDestination(dest) : Promise.resolve(dest);
    explicit
      .then(function (resolved) {
        if (!resolved) return null;
        return typeof resolved[0] === 'number' ? resolved[0] : doc.getPageIndex(resolved[0]);
      })
      .then(function (index) {
        if (index !== null && sheets[index]) showSheet(viewer, sheets[index].element);
      })
      .catch(function () {});
  }

  // An embedded viewer scrolls itself; a PDF's own page scrolls the window.
  function showSheet(viewer, element) {
    if (viewer.scrollHeight > viewer.clientHeight) {
      viewer.scrollTop = element.offsetTop;
    } else {
      element.scrollIntoView();
    }
  }

  function renderSheet(entry) {
    var width = entry.element.clientWidth;
    if (!width || width === entry.renderedWidth) return;
    entry.renderedWidth = width;
    if (entry.task) entry.task.cancel();
    var viewport = entry.page.getViewport({ scale: (width * (window.devicePixelRatio || 1)) / entry.base.width });
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    entry.task = entry.page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
    entry.task.promise
      .then(function () {
        // Swap in the finished canvas so a resize never shows a blank page.
        if (entry.canvas) entry.canvas.replaceWith(canvas);
        else entry.element.insertBefore(canvas, entry.element.firstChild);
        entry.canvas = canvas;
      })
      .catch(function (err) {
        // A resize cancels the render it replaces; that is not a failure.
        if (err && err.name === 'RenderingCancelledException') return;
        console.warn('[meadow-pdf] page render failed', err);
      });
  }

  function hydrate(viewer) {
    var pdf = window.MeadowPdf;
    if (!pdf || viewer.dataset.meadowPdfHydrated === 'true') return;
    viewer.dataset.meadowPdfHydrated = 'true';
    if (workerSrc && !pdf.GlobalWorkerOptions.workerSrc) pdf.GlobalWorkerOptions.workerSrc = workerSrc;

    var links = viewer.dataset.meadowPdfLinksEnabled === 'true'
      ? {
          tracked: parseJson(viewer.dataset.meadowPdfLinks, {}),
          untracked: parseJson(viewer.dataset.meadowPdfUntrackedLinks, []),
        }
      : null;
    var src = new URL(viewer.dataset.meadowPdfSrc, document.baseURI).href;

    pdf.getDocument({ url: src }).promise
      .then(function (doc) {
        var pages = [];
        for (var number = 1; number <= doc.numPages; number++) pages.push(doc.getPage(number));
        return Promise.all(pages).then(function (loaded) {
          return { doc: doc, pages: loaded };
        });
      })
      .then(function (result) {
        viewer.textContent = '';
        var sheets = result.pages.map(function (page) {
          var base = page.getViewport({ scale: 1 });
          var element = document.createElement('div');
          element.className = 'meadow-pdf-sheet';
          element.style.aspectRatio = base.width + ' / ' + base.height;
          viewer.appendChild(element);
          return { element: element, page: page, base: base, renderedWidth: 0, visible: false };
        });
        if (links) {
          sheets.forEach(function (entry) {
            entry.page.getAnnotations({ intent: 'display' }).then(function (annotations) {
              annotations.forEach(function (annotation) {
                if (annotation.subtype !== 'Link') return;
                addLink(viewer, result.doc, sheets, entry.element, entry.base, annotation, links);
              });
            });
          });
        }

        // Render only the pages in view, and again when the viewer's width
        // changes, as it does in fullscreen.
        var observer = new IntersectionObserver(function (changes) {
          changes.forEach(function (change) {
            var entry = sheets[Array.prototype.indexOf.call(viewer.children, change.target)];
            if (!entry) return;
            entry.visible = change.isIntersecting;
            if (entry.visible) renderSheet(entry);
          });
        }, { rootMargin: '200px' });
        sheets.forEach(function (entry) { observer.observe(entry.element); });
        new ResizeObserver(function () {
          sheets.forEach(function (entry) {
            if (entry.visible) renderSheet(entry);
          });
        }).observe(viewer);

        var startPage = Number(viewer.dataset.meadowPdfPage);
        if (startPage > 1 && sheets[startPage - 1]) showSheet(viewer, sheets[startPage - 1].element);
      })
      .catch(function (err) {
        console.warn('[meadow-pdf] could not load PDF', err);
        viewer.textContent = '';
        var message = document.createElement('span');
        message.className = 'meadow-pdf-error';
        message.textContent = 'This PDF could not be shown.';
        viewer.appendChild(message);
      });
  }

  function setFullscreen(frame, enabled) {
    frame.classList.toggle('is-fullscreen', enabled);
    document.body.classList.toggle('meadow-pdf-fullscreen-open', enabled);
    var button = frame.querySelector('.meadow-pdf-fullscreen-btn');
    if (button) {
      button.setAttribute('aria-label', enabled ? 'Close PDF fullscreen' : 'Open PDF fullscreen');
      button.setAttribute('title', enabled ? 'Close fullscreen' : 'Open fullscreen');
      button.textContent = enabled ? '×' : '⛶';
    }
  }

  function init() {
    document.querySelectorAll('.meadow-pdf-embed').forEach(hydrate);
    document.querySelectorAll('.meadow-pdf-embed-frame').forEach(function (frame) {
      var button = frame.querySelector('.meadow-pdf-fullscreen-btn');
      if (!button) return;
      button.addEventListener('click', function () {
        setFullscreen(frame, !frame.classList.contains('is-fullscreen'));
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var frame = document.querySelector('.meadow-pdf-embed-frame.is-fullscreen');
      if (frame) setFullscreen(frame, false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
