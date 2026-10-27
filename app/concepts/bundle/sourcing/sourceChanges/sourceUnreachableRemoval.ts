/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../../language.js';

export const sourceUnreachableRemoval = define({
  id: id.sourceUnreachableRemoval, name: 'Unreachable Source Removal', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.sourceRemoval, appAreaIds: [id.bundleSourcing],
  implementationRoles: ['classify-subtype'] as const,
  definition: text`A departing page no longer admitted by the proposed graph traversal even though its own file need not be missing.`,
  mechanics: [text`Trace the accepted route to the first break: removed links, upstream exclusions, missing pages, or traversal settings. Keep this route cause separate from the departing page’s own removal subtype.`],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} uses this definition for the page filter. The run overview’s nested subtype row selects scenarios that explicitly document and verify it.`,
});
