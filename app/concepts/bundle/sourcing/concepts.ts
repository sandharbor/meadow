/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../language.js';

export const sourceSnapshot = define({
  id: id.sourceSnapshot, name: 'Source Snapshot', kind: 'artifact', searchFacet: true, appAreaIds: [id.bundleSourcing],
  definition: text`An immutable capture of source files, assets, and graph context that a bundle can accept as its source material.`,
  mechanics: [
    text`Untracked files that leave the candidate snapshot are shown as No longer included. Absence from a snapshot does not establish filesystem deletion. Tracked entries that leave the working graph are reviewed as orphaned configuration.`,
    text`Capture and acceptance are distinct events. Background discovery retains a candidate while curation and generation continue using the accepted snapshot. Source changes reviews the proposed update; Source snapshots separately lists accepted history and marks the current snapshot. Opening history does not refresh or accept sources.`,
    text`Included source files and required embedded assets are stored in Git trees on source-history branches in Meadow Home. Unchanged content shares blobs. All accepted snapshots remain retained; only the current unaccepted candidate is retained. Normal checkout and staging are unchanged.`,
    text`Library-wide discovery is temporary. Durable metadata and content are scoped to the included graph. Expanded trees are disposable caches; historical text comparisons read immutable Git blobs. Backups preserve the repository and its source-history references.`,
  ],
  interplay: text`${link(id.bundleSourcing, 'Sourcing')} owns capture and acceptance; ${link(id.bundleCuration, 'Curation')} selects from the accepted material and ${link(id.bundleGeneration, 'Generation')} consumes it without refreshing live source files.`,
  implementationRoles: ['capture', 'accept'] as const,
});

export const sourceMove = define({
  id: id.sourceMove, name: 'Source Move', kind: 'mechanism', searchFacet: true, appAreaIds: [id.bundleSourcing],
  definition: text`A proposed correspondence between a configured page whose source location disappeared and a source file at another location.`,
  mechanics: [text`Content fingerprints and graph context provide inspectable evidence. Two independent, unambiguous content matches can establish a shared folder move for related pages whose contents remain highly similar after consistent filename and link rewrites. The highest-ranked available match is proposed as a rename. Accepting the source update applies the proposal and preserves identity; Details exposes evidence and an optional correction to treat them as different pages, removing the old orphaned configuration and leaving the new page untracked. Traversal details show the route leading to the page as file pills, without repeating the moved endpoint. An unchanged leading route is shown once; different routes retain Before and After. Content comparison is offered only when captured file contents differ. Proposed matches never assign two configured identities to one destination. Pages in move review are excluded from orphan cleanup and separate added or missing entries.`],
  interplay: text`Identity proposals are applied when accepting a ${link(id.sourceSnapshot, 'Source Snapshot')}. A file moved beyond the admitted graph remains an ${link(id.orphan, 'Orphaned Bundle Page')} at its historical locator; discovery does not retain an unrelated destination outside the capture boundary.`,
});

export const sourceChange = define({
  id: id.sourceChange, name: 'Source Change', kind: 'artifact', searchFacet: true, appAreaIds: [id.bundleSourcing],
  definition: text`A named set of simple filesystem operations applied to an isolated fixture source graph for development and acceptance testing.`,
  mechanics: [text`Development controls and automated scenarios share the executor. PageSpecs describe concrete states unconditionally; TypeScript scenarios own sequencing and decisions. Start scenario resets the fixture, refreshes and accepts its baseline (including orphan cleanup), applies the selected change, refreshes sources, and opens source review. Apply change modifies only the running fixture files, leaving automatic detection and manual refresh observable. Development and E2E compose shared setup primitives backed by Command operations. Opening source review is a navigation destination; it does not refresh or accept material.`],
  interplay: text`Source Changes exercise ${link(id.sourceSnapshot, 'Source Snapshot')} discovery and ${link(id.sourceMove, 'Source Move')} review through normal application behavior.`,
  implementationRoles: ['apply'] as const,
});

export const orphan = define({
  id: id.orphan, name: 'Orphaned Configuration', aliases: ['Orphan', 'Orphaned Bundle Page', 'Orphaned Bundle Pages'],
  kind: 'state', searchFacet: true, appAreaIds: [id.bundleSourcing],
  definition: text`A non-blacklisted page with durable bundle configuration that is no longer reachable in the working graph of the source snapshot under review.`,
  mechanics: [text`Sourcing reviews the candidate graph when one is available, otherwise the accepted graph. Orphans contribute to the source-review count; possible moves are counted separately once. An orphan appears once in review, without a duplicate missing-file item. Accepting removes eligible orphaned configuration entries by default, including old identities left by rejected rename matches. Individual or bulk Keep in config overrides are optional and reversible before acceptance; explicitly kept orphans remain pending for later review. Source files are retained. Required traversal and collection entries cannot be removed here. Explanations distinguish a still-present link to a filesystem-confirmed missing file from a removed link or a file outside the captured graph. An unavailable source does not establish deletion. File pills identify the affected paths; the full previous route is available under a disclosure.`],
  interplay: text`${link(id.bundleSourcing, 'Sourcing')} owns orphan review together with ${link(id.sourceMove, 'Source Move')} decisions. ${link(id.bundleCuration, 'Curation')} continues to use the accepted graph until the review is applied.`,
});

export const sourcingConcepts = [sourceSnapshot, sourceMove, sourceChange, orphan] as const;
