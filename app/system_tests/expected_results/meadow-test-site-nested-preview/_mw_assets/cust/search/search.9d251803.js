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

(function () {
  'use strict';

  var runtimeScript = document.currentScript;
  if (!runtimeScript || !runtimeScript.src) return;

  var searchAssetsUrl = new URL('./', runtimeScript.src);
  var siteRootUrl = new URL('../../../', runtimeScript.src);
  var manifest = null;
  var documents = [];
  var documentsByPath = {};
  var indexLoadPromise = null;

  window.__meadowSearchReceiveManifest = function (value) {
    manifest = value;
  };

  window.__meadowSearchReceiveShard = function (value) {
    if (!Array.isArray(value)) return;
    value.forEach(function (entry) {
      if (entry && typeof entry.p === 'string') documentsByPath[entry.p] = entry;
    });
  };

  function loadScript(relativePath) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = new URL(relativePath, searchAssetsUrl).href;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Unable to load search index')); };
      document.head.appendChild(script);
    });
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function loadIndexAttempt(attempt) {
    return loadScript('index/manifest.js').then(function () {
      var shardIds = manifest && Array.isArray(manifest.shards) ? manifest.shards : [];
      return Promise.all(shardIds.map(function (shardId) {
        return loadScript('index/shard-' + shardId + '.js');
      }));
    }).then(function () {
      documents = Object.keys(documentsByPath).map(function (documentPath) { return documentsByPath[documentPath]; });
      documents.sort(function (left, right) { return left.p.localeCompare(right.p); });
      return documents;
    }).catch(function (error) {
      if (attempt < 20) {
        return wait(150).then(function () { return loadIndexAttempt(attempt + 1); });
      }
      throw error;
    });
  }

  function loadIndex() {
    if (indexLoadPromise) return indexLoadPromise;
    indexLoadPromise = loadIndexAttempt(0).catch(function (error) {
      indexLoadPromise = null;
      throw error;
    });
    return indexLoadPromise;
  }

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase();
  }

  function queryTerms(value) {
    return normalize(value).split(/\s+/).filter(function (term) { return term.length >= 2; });
  }

  function matchesEveryTerm(value, terms) {
    return terms.every(function (term) { return value.indexOf(term) !== -1; });
  }

  function titleRank(title, normalizedQuery) {
    if (title === normalizedQuery) return 0;
    if (title.indexOf(normalizedQuery) === 0) return 1;
    if (title.indexOf(' ' + normalizedQuery) !== -1) return 2;
    return 3;
  }

  function makeSnippet(body, terms) {
    var normalizedBody = normalize(body);
    var firstMatch = normalizedBody.length;
    terms.forEach(function (term) {
      var index = normalizedBody.indexOf(term);
      if (index >= 0 && index < firstMatch) firstMatch = index;
    });
    if (firstMatch === normalizedBody.length) firstMatch = 0;

    var start = Math.max(0, firstMatch - 70);
    var end = Math.min(body.length, firstMatch + 130);
    if (start > 0) {
      var nextSpace = body.indexOf(' ', start);
      if (nextSpace >= 0 && nextSpace < firstMatch) start = nextSpace + 1;
    }
    if (end < body.length) {
      var previousSpace = body.lastIndexOf(' ', end);
      if (previousSpace > firstMatch) end = previousSpace;
    }
    return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
  }

  function createResult(documentEntry, kind, terms) {
    var link = document.createElement('a');
    link.className = 'meadow-search-result meadow-search-result-' + kind;
    link.dataset.searchResultKind = kind;
    link.href = new URL(documentEntry.p, siteRootUrl).href;

    var label = document.createElement('span');
    label.className = 'meadow-search-result-title';
    label.textContent = documentEntry.t;
    link.appendChild(label);

    if (kind === 'content') {
      var snippet = document.createElement('span');
      snippet.className = 'meadow-search-result-snippet';
      snippet.textContent = makeSnippet(documentEntry.b, terms);
      link.appendChild(snippet);
    }

    return link;
  }

  function appendSection(resultsElement, headingText, kind, entries, terms) {
    if (entries.length === 0) return;
    var section = document.createElement('section');
    section.className = 'meadow-search-results-section';
    section.dataset.searchResultsKind = kind;

    var heading = document.createElement('h2');
    heading.textContent = headingText;
    section.appendChild(heading);

    entries.slice(0, 20).forEach(function (entry) {
      section.appendChild(createResult(entry, kind, terms));
    });
    resultsElement.appendChild(section);
  }

  function renderResults(input, status, resultsElement) {
    var terms = queryTerms(input.value);
    resultsElement.replaceChildren();
    if (terms.length === 0) {
      status.textContent = 'Enter at least two characters.';
      return;
    }

    var normalizedQuery = normalize(input.value.trim());
    var titleResults = [];
    var contentResults = [];

    documents.forEach(function (entry) {
      var normalizedTitle = normalize(entry.t);
      if (matchesEveryTerm(normalizedTitle, terms)) {
        titleResults.push(entry);
      } else if (matchesEveryTerm(normalize(entry.b), terms)) {
        contentResults.push(entry);
      }
    });

    titleResults.sort(function (left, right) {
      var rankDifference = titleRank(normalize(left.t), normalizedQuery) - titleRank(normalize(right.t), normalizedQuery);
      return rankDifference || left.t.localeCompare(right.t);
    });
    contentResults.sort(function (left, right) { return left.t.localeCompare(right.t); });

    var resultCount = titleResults.length + contentResults.length;
    status.textContent = resultCount === 1 ? '1 result' : resultCount + ' results';
    if (resultCount === 0) return;

    appendSection(resultsElement, 'Page titles', 'title', titleResults, terms);
    appendSection(resultsElement, 'Page contents', 'content', contentResults, terms);
  }

  function initializeSearch() {
    var openButton = document.querySelector('[data-meadow-search-open]');
    var panel = document.querySelector('[data-meadow-search-panel]');
    if (!openButton || !panel) return;

    var closeButton = panel.querySelector('[data-meadow-search-close]');
    var input = panel.querySelector('[data-meadow-search-input]');
    var status = panel.querySelector('[data-meadow-search-status]');
    var resultsElement = panel.querySelector('[data-meadow-search-results]');
    if (!closeButton || !input || !status || !resultsElement) return;

    var previousFocus = null;
    var open = function () {
      previousFocus = document.activeElement;
      panel.hidden = false;
      document.body.classList.add('meadow-search-is-open');
      input.focus();
      status.textContent = 'Loading search…';
      loadIndex().then(function () {
        renderResults(input, status, resultsElement);
      }).catch(function () {
        status.textContent = 'Search could not be loaded.';
      });
    };
    var close = function () {
      panel.hidden = true;
      document.body.classList.remove('meadow-search-is-open');
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };

    openButton.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    panel.addEventListener('click', function (event) {
      if (event.target === panel) close();
    });
    input.addEventListener('input', function () {
      if (indexLoadPromise) {
        indexLoadPromise.then(function () { renderResults(input, status, resultsElement); });
      } else {
        renderResults(input, status, resultsElement);
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) close();
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        if (panel.hidden) open(); else close();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSearch);
  } else {
    initializeSearch();
  }
})();
