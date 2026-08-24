(function() {
  'use strict';

  var runtimeScript = document.currentScript;
  var bundleRoot = runtimeScript && runtimeScript.src
    ? new URL('../../../', runtimeScript.src)
    : new URL('.', window.location.href);

  // Apply persisted layout state before stylesheets load so cross-page
  // navigation never paints the responsive defaults first.
  function applyInitialLayout() {
    var root = document.documentElement;
    var storageKey = root.getAttribute('data-meadow-folder-nav-storage-key') || 'meadow-folder-nav';
    var state = {};

    try {
      var parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
      if (parsed && typeof parsed === 'object') state = parsed;
    } catch (_error) {
      // Use responsive defaults when bundle storage is unavailable.
    }

    var isOpen = typeof state.open === 'boolean'
      ? state.open
      : !window.matchMedia('(max-width: 767px)').matches;
    root.setAttribute('data-meadow-folder-nav-open', isOpen ? 'true' : 'false');

    var width = Number(state.width);
    if (!Number.isFinite(width)) width = 280;
    var maximumWidth = Math.max(220, Math.min(520, window.innerWidth - 52));
    width = Math.round(Math.min(maximumWidth, Math.max(220, width)));
    root.style.setProperty('--meadow-folder-nav-width', width + 'px');
  }

  applyInitialLayout();

  function encodedPath(outputPath) {
    return outputPath.split('/').map(function(segment) {
      return encodeURIComponent(segment);
    }).join('/');
  }

  function renderNavigationTree(sidebar) {
    var navigation = sidebar.querySelector('.meadow-folder-nav-scroll');
    var data = window.MeadowFolderNavData;
    if (!navigation || !data || !Array.isArray(data.folders) || !Array.isArray(data.files)) {
      return;
    }

    var currentPagePath = '';
    try {
      var rootPath = decodeURIComponent(bundleRoot.pathname);
      var locationPath = decodeURIComponent(window.location.pathname);
      if (locationPath.indexOf(rootPath) === 0) {
        currentPagePath = locationPath.slice(rootPath.length);
      }
    } catch (_error) {
      // An undecodable URL can still display the tree; it simply has no
      // selected file until the visitor navigates to another generated page.
    }
    var lastSlash = currentPagePath.lastIndexOf('/');
    var currentPageDirectory = lastSlash >= 0 ? currentPagePath.slice(0, lastSlash) : '';

    function renderFile(file) {
      var item = document.createElement('li');
      item.className = 'meadow-folder-nav-file';
      item.setAttribute('role', 'treeitem');

      var link = document.createElement('a');
      link.className = 'meadow-folder-nav-link';
      link.setAttribute('href', new URL(encodedPath(file.path), bundleRoot).href);
      link.textContent = file.name;
      if (file.path === currentPagePath) {
        link.classList.add('is-current');
        link.setAttribute('aria-current', 'page');
        link.setAttribute('data-current-page', 'true');
      }

      item.appendChild(link);
      return item;
    }

    function renderFolder(folder) {
      var item = document.createElement('li');
      item.className = 'meadow-folder-nav-folder';
      item.setAttribute('role', 'treeitem');

      var details = document.createElement('details');
      details.setAttribute('data-folder-path', folder.path);
      if (currentPageDirectory === folder.path || currentPageDirectory.indexOf(folder.path + '/') === 0) {
        details.setAttribute('data-current-ancestor', 'true');
      }

      var summary = document.createElement('summary');
      var icon = document.createElement('span');
      icon.className = 'meadow-folder-nav-folder-icon';
      icon.setAttribute('aria-hidden', 'true');
      var name = document.createElement('span');
      name.textContent = folder.name;
      summary.appendChild(icon);
      summary.appendChild(name);
      details.appendChild(summary);

      var group = document.createElement('ul');
      group.setAttribute('role', 'group');
      for (var folderIndex = 0; folderIndex < folder.folders.length; folderIndex++) {
        group.appendChild(renderFolder(folder.folders[folderIndex]));
      }
      for (var fileIndex = 0; fileIndex < folder.files.length; fileIndex++) {
        group.appendChild(renderFile(folder.files[fileIndex]));
      }
      details.appendChild(group);
      item.appendChild(details);
      return item;
    }

    var tree = document.createElement('ul');
    tree.className = 'meadow-folder-nav-tree';
    tree.setAttribute('role', 'tree');
    for (var folderIndex = 0; folderIndex < data.folders.length; folderIndex++) {
      tree.appendChild(renderFolder(data.folders[folderIndex]));
    }
    for (var fileIndex = 0; fileIndex < data.files.length; fileIndex++) {
      tree.appendChild(renderFile(data.files[fileIndex]));
    }
    navigation.replaceChildren(tree);
  }

  function start() {
    var sidebar = document.querySelector('[data-meadow-folder-nav]');
    if (!sidebar) return;

    renderNavigationTree(sidebar);

    var storageKey = sidebar.getAttribute('data-storage-key') || 'meadow-folder-nav';
    var closeButton = sidebar.querySelector('[data-meadow-folder-nav-close]');
    var openButton = document.querySelector('button[data-meadow-folder-nav-open]');
    var resizeHandle = sidebar.querySelector('[data-meadow-folder-nav-resize]');
    var folderDetails = sidebar.querySelectorAll('details[data-folder-path]');
    var mobileMedia = window.matchMedia('(max-width: 767px)');
    var state = { folders: {} };

    try {
      var parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
      if (parsed && typeof parsed === 'object') {
        state = parsed;
      }
    } catch (_error) {
      state = { folders: {} };
    }

    if (!state.folders || typeof state.folders !== 'object') {
      state.folders = {};
    }

    function saveState() {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (_error) {
        // Navigation still works when storage is unavailable (for example in
        // a browser with blocked bundle storage); only persistence is skipped.
      }
    }

    function defaultOpen() {
      return !mobileMedia.matches;
    }

    function setSidebarOpen(isOpen, persist) {
      document.documentElement.setAttribute(
        'data-meadow-folder-nav-open',
        isOpen ? 'true' : 'false'
      );
      if (openButton) openButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (closeButton) closeButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (persist) {
        state.open = isOpen;
        saveState();
      }
    }

    function maximumWidth() {
      return Math.max(220, Math.min(520, window.innerWidth - 52));
    }

    function applyWidth(width, persist) {
      var numericWidth = Number(width);
      if (!Number.isFinite(numericWidth)) numericWidth = 280;
      numericWidth = Math.round(Math.min(maximumWidth(), Math.max(220, numericWidth)));
      document.documentElement.style.setProperty('--meadow-folder-nav-width', numericWidth + 'px');
      if (resizeHandle) resizeHandle.setAttribute('aria-valuenow', String(numericWidth));
      if (persist) {
        state.width = numericWidth;
        saveState();
      }
      return numericWidth;
    }

    var hasExplicitOpenState = typeof state.open === 'boolean';
    setSidebarOpen(hasExplicitOpenState ? state.open : defaultOpen(), false);
    applyWidth(state.width, false);

    if (!hasExplicitOpenState) {
      mobileMedia.addEventListener('change', function(event) {
        setSidebarOpen(!event.matches, false);
      });
    }

    if (closeButton) {
      closeButton.addEventListener('click', function() { setSidebarOpen(false, true); });
    }
    if (openButton) {
      openButton.addEventListener('click', function() { setSidebarOpen(true, true); });
    }

    var pageLinks = sidebar.querySelectorAll('a.meadow-folder-nav-link');
    for (var pageLinkIndex = 0; pageLinkIndex < pageLinks.length; pageLinkIndex++) {
      pageLinks[pageLinkIndex].addEventListener('click', function() {
        if (mobileMedia.matches) setSidebarOpen(false, true);
      });
    }

    for (var i = 0; i < folderDetails.length; i++) {
      (function(details) {
        var folderPath = details.getAttribute('data-folder-path') || '';
        if (Object.prototype.hasOwnProperty.call(state.folders, folderPath)) {
          details.open = state.folders[folderPath] === true;
        } else if (details.hasAttribute('data-current-ancestor')) {
          details.open = true;
        }

        details.addEventListener('toggle', function() {
          state.folders[folderPath] = details.open;
          saveState();
        });
      })(folderDetails[i]);
    }

    if (resizeHandle) {
      resizeHandle.addEventListener('pointerdown', function(event) {
        if (event.button !== 0) return;
        event.preventDefault();
        var startX = event.clientX;
        var startWidth = sidebar.getBoundingClientRect().width;
        resizeHandle.classList.add('is-resizing');
        resizeHandle.setPointerCapture(event.pointerId);

        function onPointerMove(moveEvent) {
          applyWidth(startWidth + moveEvent.clientX - startX, false);
        }

        function finishResize(upEvent) {
          resizeHandle.classList.remove('is-resizing');
          resizeHandle.removeEventListener('pointermove', onPointerMove);
          resizeHandle.removeEventListener('pointerup', finishResize);
          resizeHandle.removeEventListener('pointercancel', finishResize);
          if (resizeHandle.hasPointerCapture(upEvent.pointerId)) {
            resizeHandle.releasePointerCapture(upEvent.pointerId);
          }
          state.width = Math.round(sidebar.getBoundingClientRect().width);
          saveState();
        }

        resizeHandle.addEventListener('pointermove', onPointerMove);
        resizeHandle.addEventListener('pointerup', finishResize);
        resizeHandle.addEventListener('pointercancel', finishResize);
      });

      resizeHandle.addEventListener('keydown', function(event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        var direction = event.key === 'ArrowLeft' ? -1 : 1;
        applyWidth(sidebar.getBoundingClientRect().width + direction * 10, true);
      });
    }

    window.addEventListener('resize', function() {
      var currentWidth = sidebar.getBoundingClientRect().width;
      if (currentWidth > maximumWidth()) applyWidth(currentWidth, false);
    });

    var currentPage = sidebar.querySelector('[aria-current="page"]');
    if (currentPage && typeof currentPage.scrollIntoView === 'function') {
      currentPage.scrollIntoView({ block: 'nearest' });
    }

    // Safari can leave the two transitioning layout layers unpainted when
    // their persisted state is applied during initial page construction.
    // Give the initial layout a paint opportunity before enabling transitions.
    window.requestAnimationFrame(function() {
      window.requestAnimationFrame(function() {
        document.documentElement.setAttribute('data-meadow-folder-nav-ready', 'true');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
