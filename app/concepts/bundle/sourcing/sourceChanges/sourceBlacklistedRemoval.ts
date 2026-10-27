/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../../language.js';

export const sourceBlacklistedRemoval = define({
  id: id.sourceBlacklistedRemoval, name: 'Blacklisted Source Removal', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.sourceRemoval, appAreaIds: [id.bundleSourcing],
  implementationRoles: ['classify-subtype'] as const,
  definition: text`A departing page deliberately excluded by proposed blacklist configuration.`,
  mechanics: [text`A blacklist stop can also break routes to other pages. Those downstream pages are Not reachable; their evidence points to the blacklisted causal page.`],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} uses this definition for the page filter. The run overview’s nested subtype row selects scenarios that explicitly document and verify it.`,
});
