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

// Fetch and display a preview popup when hovering over internal links.
document.addEventListener('DOMContentLoaded', function() {
  var previewEl = null;
  var hideTimeout = null;
  var cache = {};

  function createPreview() {
    var el = document.createElement('div');
    el.className = 'hover-preview';
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('mouseenter', function() { clearTimeout(hideTimeout); });
    el.addEventListener('mouseleave', function() { hide(); });
    return el;
  }

  function hide() {
    if (previewEl) previewEl.hidden = true;
  }

  function show(anchor) {
    if (!previewEl) previewEl = createPreview();
    clearTimeout(hideTimeout);

    var href = anchor.getAttribute('href');
    if (!href || !href.endsWith('.html') || href.startsWith('http://') || href.startsWith('https://')) return;

    function position() {
      var rect = anchor.getBoundingClientRect();
      var top = rect.bottom + window.scrollY + 6;
      var left = rect.left + window.scrollX;
      // Keep within viewport horizontally.
      var maxLeft = window.innerWidth - 420;
      if (left > maxLeft) left = maxLeft > 0 ? maxLeft : 0;
      previewEl.style.top = top + 'px';
      previewEl.style.left = left + 'px';
    }

    if (cache[href]) {
      previewEl.innerHTML = cache[href];
      position();
      previewEl.hidden = false;
      return;
    }

    previewEl.innerHTML = '<em class="hover-preview-loading">Loading...</em>';
    position();
    previewEl.hidden = false;

    fetch(href)
      .then(function(response) {
        if (!response.ok) return null;
        return response.text().then(function(html) {
          return { html: html, url: response.url };
        });
      })
      .then(function(result) {
        if (!result) { hide(); return; }
        var doc = new DOMParser().parseFromString(result.html, 'text/html');
        var main = doc.querySelector('main');
        if (!main) { hide(); return; }
        var previewLinks = main.querySelectorAll('a[href]');
        for (var linkIndex = 0; linkIndex < previewLinks.length; linkIndex++) {
          var previewHref = previewLinks[linkIndex].getAttribute('href');
          if (!previewHref) continue;
          try {
            previewLinks[linkIndex].setAttribute('href', new URL(previewHref, result.url).href);
          } catch (_error) {
            // Leave malformed or unsupported URLs untouched.
          }
        }
        // Take the h1 + first few content elements.
        var preview = '';
        var children = main.children;
        var count = 0;
        for (var i = 0; i < children.length && count < 4; i++) {
          preview += children[i].outerHTML;
          count++;
        }
        cache[href] = preview;
        previewEl.innerHTML = preview;
        position();
      })
      .catch(function() { hide(); });
  }

  // Attach to all internal links in main content and footer (backlinks).
  var links = document.querySelectorAll('main a[href$=".html"], footer a[href$=".html"]');
  for (var i = 0; i < links.length; i++) {
    (function(link) {
      var href = link.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) return;
      link.addEventListener('mouseenter', function() { show(link); });
      link.addEventListener('mouseleave', function() {
        hideTimeout = setTimeout(hide, 200);
      });
    })(links[i]);
  }
});
