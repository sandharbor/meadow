/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import { splitSourceGraphPath } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import type { SourceOrphanExplanation } from '../../../../../../../contracts/types/sourcing.js';
import { sourcePath, type SourceSnapshot } from '../../../../shared/source-snapshot/sourceSnapshots.js';

type Graph = SourceSnapshot['graph'];
const relative = (value: string) => value.replace(/^\/+/, '');
function links(graph: Graph, filename: string) {
  return graph?.allLinkResolutionMaps[filename] ?? graph?.allLinkResolutionMaps[`/${filename}`];
}

/** Check only paths already named by the tracked route; never persist wider discovery. */
export function diagnoseOrphanConnection(root: string | undefined, previous: Graph, current: Graph, from: string, to: string, sources?: BundleSource[]): SourceOrphanExplanation['diagnosis'] {
  if (to.startsWith('folder:') || to.startsWith('collection:')) return undefined;
  const priorLinks = links(previous, from);
  const currentLinks = links(current, from);
  const originals = Object.entries(priorLinks ?? {}).filter(([, resolution]) => relative(resolution.link_resolved_target_path ?? '') === to).map(([original]) => original);
  const stillLinked = originals.some(original => currentLinks && Object.prototype.hasOwnProperty.call(currentLinks, original)
    && (!currentLinks[original].link_resolved_target_path || relative(currentLinks[original].link_resolved_target_path) === to));
  let exists: boolean | undefined;
  try {
    // An offline or inaccessible source root cannot establish that a file is absent.
    const locator = splitSourceGraphPath(to, sources);
    if (sources) root = sources.find(source => source.id === locator.sourceId)?.directory;
    if (root && fs.statSync(root).isDirectory()) {
      try { fs.statSync(sourcePath(root, locator.relativePath)); exists = true; }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) exists = false; }
    }
  } catch { /* Leave filesystem status unknown. */ }
  if (exists === false) return { kind: 'missing-file', to, ...(stillLinked && { from }) };
  if (originals.length && currentLinks && !stillLinked) return { kind: 'removed-link', from, to };
  if (exists === true) return { kind: 'outside-graph', to };
  return undefined;
}
