/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../../language.js';

export const sourceConfigurationChange = define({
  id: id.sourceConfigurationChange, name: 'Source Configuration Change', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.sourceModification, appAreaIds: [id.bundleSourcing],
  implementationRoles: ['classify-subtype'] as const,
  definition: text`A modified page whose proposed saved graph settings differ from its accepted settings.`,
  mechanics: [text`Traversal depth, blacklist policy, and collection membership can change without changing source bytes. These settings are isolated in the proposal; tracking decisions have their own summary.`],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} uses this definition for the page filter. The run overview’s nested subtype row selects scenarios that explicitly document and verify it.`,
});
