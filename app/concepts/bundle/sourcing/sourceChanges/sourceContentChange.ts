/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../../language.js';

export const sourceContentChange = define({
  id: id.sourceContentChange, name: 'Source Content Change', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.sourceModification, appAreaIds: [id.bundleSourcing],
  implementationRoles: ['classify-subtype'] as const,
  definition: text`A modified page whose captured source bytes differ between the accepted and proposed snapshots.`,
  mechanics: [text`Compare captured material, not newer live files. The content comparison and line counts explain the changed bytes; tracking settings are reviewed separately.`],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} uses this definition for the page filter. The run overview’s nested subtype row selects scenarios that explicitly document and verify it.`,
});
