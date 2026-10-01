/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds } from '../ids.js';
import { conceptLink, conceptText, defineMeadowConcept } from '../language.js';

export const bundleNodeKey = defineMeadowConcept({
  id: coreConceptIds.bundleNodeKey,
  name: 'Bundle Node Key',
  kind: 'entity',
  searchFacet: false,
  appAreaIds: [coreConceptIds.bundleSourcing, coreConceptIds.bundleCuration, coreConceptIds.bundleGeneration],
  implementationRoles: ['construct', 'parse', 'render', 'graph-lookup'] as const,
  definition: conceptText`The current address of a file, folder, or collection within one bundle graph. Every discovered node has a key, and edges and traversal routes reference keys.`,
  mechanics: [
    conceptText`The executable contract is an immutable, typed value: a file or folder has a normalized source-relative path and, for a registered source, its stable source identity; a collection has its configured node identity. A source-root folder has an empty path.`,
    conceptText`The shared codec is the only authority for string rendering. Encoded keys begin with file:, folder:, or collection:. File and folder locators have no leading slash; registered sources use the reserved _mw_sources/<sourceId> namespace. An absent source identity represents a legacy single-source graph.`,
    conceptText`JSON, DOM attributes, and value-based indexes use a distinct validated encoded-key type. Graph operations accept that type or a structured key and compare addresses by value. Plain source paths must be explicitly converted; a key is never implicitly a filesystem path or a published route.`,
    conceptText`A graph-relative locator can differ from a stored source filename: an Excalidraw address ends in .excalidraw, while its captured source file ends in .excalidraw.md. Filesystem access uses explicit source-file metadata rather than treating a key as a filename.`,
    conceptText`Moves change file and folder keys. Source renames and physical relocation preserve registered source identities. Retained historical graphs migrate their old path-shaped keys at the storage boundary; current producers and consumers use the canonical codec. TypeScript and the native adapter share grammar conformance cases.`,
  ],
  interplay: conceptText`${conceptLink(coreConceptIds.bundleNodeId, 'Bundle Node ID')} supplies durable configured identity across moves. ${conceptLink(coreConceptIds.sourceSnapshot, 'Source Snapshots')}, ${conceptLink(coreConceptIds.tracking, 'Tracking')}, and ${conceptLink(coreConceptIds.htmlGeneration, 'Generation')} share this addressing contract.`,
});

export const bundleNodeId = defineMeadowConcept({
  id: coreConceptIds.bundleNodeId,
  name: 'Bundle Node ID',
  kind: 'entity',
  searchFacet: false,
  appAreaIds: [coreConceptIds.bundleSourcing, coreConceptIds.bundleCuration, coreConceptIds.bundleGeneration],
  definition: conceptText`The persistent bundle-local identity assigned when a node is configured.`,
  mechanics: [conceptText`The twelve lowercase letters or digits survive accepted moves. Unconfigured discovered nodes have graph keys but no configured identity. Bundle roles and collection membership reference this identity.`],
  interplay: conceptText`A ${conceptLink(coreConceptIds.bundleNodeKey, 'Bundle Node Key')} locates the node in its current graph; its configured identity records continuity across source locations.`,
});

export const bundleIdentityConcepts = [bundleNodeKey, bundleNodeId] as const;
