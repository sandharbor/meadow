/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import { splitSourceGraphPath } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import type { SourceOrphanExplanation } from '../../../../../../../contracts/types/sourcing.js';
import { sourcePath, type SourceSnapshot } from '../../../../shared/source-snapshot/sourceSnapshots.js';

import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';
import { bundleNodeKeySourceGraphPath, parseBundleNodeKey } from '../../../../../../../shared_code/utils/bundleNodeKey.js';

type Graph = SourceSnapshot['graph'];
const relative = (value: string) => value.replace(/^\/+/, '');
function links(graph: Graph, filename: EncodedBundleNodeKey) {
  return graph?.allLinkResolutionMaps[filename];
}

/** Check only paths already named by the tracked route; never persist wider discovery. */
export function diagnoseOrphanConnection(root: string | undefined, previous: Graph, current: Graph, from: EncodedBundleNodeKey, to: EncodedBundleNodeKey, sources?: BundleSource[]): SourceOrphanExplanation['diagnosis'] {
  if (parseBundleNodeKey(to).kind !== 'file') return undefined;
  const fromPath = parseBundleNodeKey(from).kind === 'collection' ? undefined : bundleNodeKeySourceGraphPath(from);
  const toPath = bundleNodeKeySourceGraphPath(to);
  const priorLinks = links(previous, from);
  const currentLinks = links(current, from);
  const originals = Object.entries(priorLinks ?? {}).filter(([, resolution]) => relative(resolution.link_resolved_target_path ?? '') === toPath).map(([original]) => original);
  const stillLinked = originals.some(original => currentLinks && Object.prototype.hasOwnProperty.call(currentLinks, original)
    && (!currentLinks[original].link_resolved_target_path || relative(currentLinks[original].link_resolved_target_path) === toPath));
  let exists: boolean | undefined;
  try {
    // An offline or inaccessible source root cannot establish that a file is absent.
    const locator = splitSourceGraphPath(toPath, sources);
    if (sources) root = sources.find(source => source.id === locator.sourceId)?.directory;
    if (root && fs.statSync(root).isDirectory()) {
      try { fs.statSync(sourcePath(root, locator.relativePath)); exists = true; }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) exists = false; }
    }
  } catch { /* Leave filesystem status unknown. */ }
  if (exists === false) return { kind: 'missing-file', to: toPath, ...(stillLinked && fromPath && { from: fromPath }) };
  if (originals.length && currentLinks && !stillLinked && fromPath) return { kind: 'removed-link', from: fromPath, to: toPath };
  if (exists === true) return { kind: 'outside-graph', to: toPath };
  return undefined;
}
