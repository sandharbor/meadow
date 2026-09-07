/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../language.js';

export const sourceSnapshot = define({
  id: id.sourceSnapshot, name: 'Source Snapshot', kind: 'artifact', appAreaIds: [id.bundleSourcing],
  definition: text`An immutable capture of source files, assets, and graph context that a bundle can accept as its source material.`,
  mechanics: [text`Capture and acceptance are distinct events. Background discovery retains a candidate while curation and generation continue using the accepted snapshot.`],
  interplay: text`${link(id.bundleSourcing, 'Sourcing')} owns capture and acceptance; ${link(id.bundleCuration, 'Curation')} selects from the accepted material and ${link(id.bundleGeneration, 'Generation')} consumes it without refreshing live source files.`,
  implementationRoles: ['capture', 'accept'] as const,
});

export const sourceMove = define({
  id: id.sourceMove, name: 'Source Move', kind: 'mechanism', appAreaIds: [id.bundleSourcing],
  definition: text`A proposed correspondence between a configured page whose source location disappeared and a source file at another location.`,
  mechanics: [text`Content fingerprints and graph context provide inspectable evidence. The highest-ranked available match is proposed as a rename. Accepting the source update applies the proposal and preserves identity; Details exposes evidence and an optional correction to keep pages separate. Proposed matches never assign two configured identities to one destination.`],
  interplay: text`Identity proposals are applied when accepting a ${link(id.sourceSnapshot, 'Source Snapshot')}. A confirmed move can still leave an ${link(id.orphan, 'Orphaned Bundle Page')} when its incoming route has disappeared.`,
});

export const sourceChange = define({
  id: id.sourceChange, name: 'Source Change', kind: 'artifact', appAreaIds: [id.bundleSourcing],
  definition: text`A named set of simple filesystem operations applied to an isolated fixture source graph for development and acceptance testing.`,
  mechanics: [text`Development controls and automated scenarios share the executor. PageSpecs describe concrete states unconditionally; TypeScript scenarios own sequencing and decisions.`],
  interplay: text`Source Changes exercise ${link(id.sourceSnapshot, 'Source Snapshot')} discovery and ${link(id.sourceMove, 'Source Move')} review through normal application behavior.`,
  implementationRoles: ['apply'] as const,
});

export const orphan = define({
  id: id.orphan, name: 'Orphaned Bundle Page', aliases: ['Orphan', 'Orphaned Bundle Pages'],
  kind: 'state', appAreaIds: [id.bundleSourcing],
  definition: text`A non-blacklisted page with durable bundle configuration that is no longer reachable in the working graph of the source snapshot under review.`,
  mechanics: [text`Sourcing reviews the candidate graph when one is available, otherwise the accepted graph. Orphans contribute to the source-review count; possible moves are counted separately once. Individual and bulk configuration removals are staged, reversible before applying, and applied with the source update. Source files are retained. Required traversal and collection entries cannot be removed here.`],
  interplay: text`${link(id.bundleSourcing, 'Sourcing')} owns orphan review together with ${link(id.sourceMove, 'Source Move')} decisions. ${link(id.bundleCuration, 'Curation')} continues to use the accepted graph until the review is applied.`,
});

export const sourcingConcepts = [sourceSnapshot, sourceMove, sourceChange, orphan] as const;
