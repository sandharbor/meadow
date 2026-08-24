(() => {
  'use strict';
  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement) || !script.src || !/^https?:$/.test(location.protocol)) return;
  try {
    const scriptUrl = new URL(script.src, location.href);
    if (scriptUrl.origin !== location.origin) return;
    const versionRoot = new URL('../../', scriptUrl);
    const rootSegment = versionRoot.pathname.replace(/\/$/, '').split('/').pop() || '';
    const match = rootSegment.match(/^(.*)-(v[A-Za-z0-9]{6})$/);
    if (!match) return;
    const destinationStem = match[1];
    const currentVersionId = match[2];
    const destinationParent = new URL('../', versionRoot);
    const manifestUrl = new URL(destinationStem + '-versions.json', destinationParent);
    const nodeId = document.querySelector('meta[name="meadow-bundle-node-id"]')?.getAttribute('content') || null;
    const currentPath = decodeURIComponent(location.pathname.slice(versionRoot.pathname.length));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const validRelativePath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.split('/').includes('..');
    const getJson = async url => {
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok || !/^application\/(?:json|[^;]+\+json)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('untrusted response');
      return response.json();
    };
    (async () => {
      try {
        const manifest = await getJson(manifestUrl);
        if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.successors !== 'object') return;
        const successor = manifest.successors[currentVersionId];
        if (!successor || !validRelativePath(successor.versionRoot) || !validRelativePath(successor.routeIndex) || !validRelativePath(successor.entryPath)) return;
        const successorRoot = new URL(successor.versionRoot.replace(/\/$/, '') + '/', destinationParent);
        if (successorRoot.origin !== location.origin) return;
        const routeIndex = await getJson(new URL(successor.routeIndex, successorRoot));
        if (!routeIndex || routeIndex.schemaVersion !== 1 || typeof routeIndex.routesByBundleNodeId !== 'object' || !Array.isArray(routeIndex.generatedPagePaths)) return;
        let equivalentPath = nodeId ? routeIndex.routesByBundleNodeId[nodeId] : null;
        if (!nodeId && routeIndex.generatedPagePaths.includes(currentPath)) equivalentPath = currentPath;
        if (equivalentPath && !validRelativePath(equivalentPath)) equivalentPath = null;
        const targetPath = equivalentPath || successor.entryPath;
        if (!validRelativePath(targetPath)) return;
        const callout = document.createElement('aside');
        callout.className = 'meadow-version-awareness' + (equivalentPath ? '' : ' meadow-version-awareness--missing');
        callout.setAttribute('role', 'status');
        const message = document.createElement('span');
        message.textContent = equivalentPath
          ? 'A newer version of this page is available. '
          : 'A newer version of this bundle is available, but this page is not included in it. ';
        const link = document.createElement('a');
        link.href = new URL(targetPath, successorRoot).href;
        link.textContent = 'Open the newer version.';
        callout.append(message, link);
        const content = document.querySelector('main') || document.body;
        content?.prepend(callout);
      } catch {
        // Reader awareness is optional and must never obstruct an older page.
      } finally {
        clearTimeout(timeout);
      }
    })();
  } catch {
    // Malformed page or asset URLs must also fail silently.
  }
})();
