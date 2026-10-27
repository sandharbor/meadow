/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../../language.js';

export const sourceMissingRemoval = define({
  id: id.sourceMissingRemoval, name: 'Source Missing Removal', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.sourceRemoval, appAreaIds: [id.bundleSourcing],
  implementationRoles: ['classify-subtype'] as const,
  definition: text`A departing page whose source path was confirmed missing when the proposed snapshot was captured.`,
  mechanics: [text`A missing file differs from a disconnected registered source and from a page that still exists outside the admitted graph. Acceptance cleans unreachable saved configuration and does not delete source files.`],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} uses this definition for the page filter. The run overview’s nested subtype row selects scenarios that explicitly document and verify it.`,
});
