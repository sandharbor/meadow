/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../../language.js';

export const sourceDisconnectedRemoval = define({
  id: id.sourceDisconnectedRemoval, name: 'Disconnected Source Removal', kind: 'behavioral-rule', searchFacet: false,
  parentId: id.sourceRemoval, appAreaIds: [id.bundleSourcing],
  implementationRoles: ['classify-subtype'] as const,
  definition: text`A departing page whose registered source was deliberately removed from the proposed source registry.`,
  mechanics: [text`The files can still exist. Removing a source from the bundle does not delete its files or prove that any file is missing.`],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} uses this definition for the page filter. The run overview’s nested subtype row selects scenarios that explicitly document and verify it.`,
});
