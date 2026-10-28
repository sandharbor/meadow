(function () {
  'use strict';

  function wireFrame(frame) {
    function wireDocument() {
      var doc;
      try {
        doc = frame.contentDocument;
      } catch (_error) {
        return;
      }
      if (!doc || doc.documentElement.dataset.meadowSvgLinksWired === 'true') return;
      doc.documentElement.dataset.meadowSvgLinksWired = 'true';
      doc.addEventListener('click', function (event) {
        var target = event.target;
        var anchor = target && target.closest ? target.closest('a[href]') : null;
        if (!anchor) return;
        var href = anchor.getAttribute('href');
        if (!href || href.charAt(0) === '#' || anchor.dataset.meadowLinkNotTracked === 'true') return;

        event.preventDefault();
        var destination = new URL(href, frame.src);
        if (destination.origin === window.location.origin) {
          window.location.assign(destination.href);
        } else {
          window.open(destination.href, '_blank', 'noopener,noreferrer');
        }
      });
    }

    frame.addEventListener('load', wireDocument);
    wireDocument();
  }

  function setFullscreen(frame, enabled) {
    frame.classList.toggle('is-fullscreen', enabled);
    document.body.classList.toggle('meadow-svg-fullscreen-open', enabled);
    var button = frame.querySelector('.meadow-svg-fullscreen-btn');
    if (button) {
      button.setAttribute('aria-label', enabled ? 'Close SVG fullscreen' : 'Open SVG fullscreen');
      button.setAttribute('title', enabled ? 'Close fullscreen' : 'Open fullscreen');
      button.textContent = enabled ? '×' : '⛶';
    }
  }

  function init() {
    document.querySelectorAll('iframe.meadow-svg-embed').forEach(wireFrame);
    document.querySelectorAll('.meadow-svg-embed-frame').forEach(function (frame) {
      var button = frame.querySelector('.meadow-svg-fullscreen-btn');
      if (!button) return;
      button.addEventListener('click', function () {
        setFullscreen(frame, !frame.classList.contains('is-fullscreen'));
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var frame = document.querySelector('.meadow-svg-embed-frame.is-fullscreen');
      if (frame) setFullscreen(frame, false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
