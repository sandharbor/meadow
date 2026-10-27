/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../../language.js';

export const sourceSensitivityChange = define({
  id: id.sourceSensitivityChange, name: 'Source Sensitivity Change', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.sourceModification, appAreaIds: [id.bundleSourcing],
  implementationRoles: ['classify-subtype'] as const,
  definition: text`A tracked node becomes sensitive under the proposed source or policy assessment.`,
  mechanics: [text`A source edit or sensitivity policy change can trigger renewed inclusion review. Confirm tracking sensitive material, untrack it, or exclude it deliberately; source-byte changes are a separate subtype.`],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} uses this definition for the page filter. The run overview’s nested subtype row selects scenarios that explicitly document and verify it.`,
});
