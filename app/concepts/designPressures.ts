/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from './ids.js';
import { designPressureIds, type CoreDocumentId } from './documentIds.js';
import { conceptLink as link, conceptText as text } from './language.js';
import type { DesignPressure } from './documents.js';

export const preventAccidentalSharing = {
  id: designPressureIds.preventAccidentalSharing,
  name: 'Prevent accidental sharing of sensitive material',
  documentKind: 'design-pressure',
  appAreaIds: [id.bundleSourcing, id.bundleCuration, id.bundleGeneration, id.bundleSharing],
  description: text`Meadow should make sensitive material recognizable and keep it out of routine inclusion workflows, while supporting deliberate, informed decisions to include it.`,
  sections: [
    { id: 'motivation', heading: 'Motivation', blocks: [{ kind: 'paragraph', text: text`A source graph can mix public knowledge with private notes. Discovering or accepting a ${link(id.sourceSnapshot, 'source snapshot')} should preserve the material without silently deciding that every page belongs in a shared bundle.` }] },
    { id: 'response', heading: 'How the design responds', blocks: [{ kind: 'list', items: [
      text`A ${link(id.sensitive, 'Sensitive Bundle Page')} can be marked directly in its source with meadow-sensitive: true YAML front matter. Source review and curation make that sensitivity visible. Marking or unmarking a source becomes part of the accepted graph through source review.`,
      text`${link(id.filterSensitivity, 'Filter-Derived Sensitivity')} also protects pages matched by enabled ${link(id.filters, 'Custom Filters')}. Filter policy changes effective sensitivity without rewriting source markings.`,
      text`${link(id.sourceReviewSensitivity, 'Source Review Sensitivity')} leaves sensitive additions untracked when Track added pages is enabled. Its sensitive-skipped count opens Tracking changes, where the exact pages and their proposed untracked state can be inspected. Ordinary ${link(id.tracking, 'tracking')} preserves deliberate choices.`,
      text`Refreshing or reopening a proposal reassesses sensitivity. Automatic choices that become sensitive are removed; previously explicit choices can require renewed confirmation or untracking before acceptance.`,
      text`${link(id.htmlGeneration, 'Generation')} checks the bundle boundary before producing output. A tracked page whose sensitivity now requires reaffirmation blocks generation until its inclusion is reviewed. This guard needs its own direct E2E example; related publication examples do not establish its coverage.`,
      text`${link(id.publishing, 'Publishing')} delivers the selected generated output. Publication scenarios can verify that pages left untracked, and references to them, are absent. Sharing does not apply a separate sensitivity filter.`,
    ] }] },
    { id: 'tradeoffs', heading: 'Tradeoffs', blocks: [{ kind: 'paragraph', text: text`Sensitivity supports informed inclusion rather than an unconditional ban. Accepted sources may contain sensitive pages, and a deliberately confirmed page can be tracked and published. The design must explain skipped or invalidated choices without changing source content through filter policy or silently overriding a user's reviewed choice.` }] },
  ],
} as const satisfies DesignPressure<typeof designPressureIds.preventAccidentalSharing, CoreDocumentId>;

export const designPressures = [preventAccidentalSharing] as const;
