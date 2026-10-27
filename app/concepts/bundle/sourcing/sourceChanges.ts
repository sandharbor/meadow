/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { coreConceptIds as id } from '../../ids.js';
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from '../../language.js';
import { sourceContentChange } from './sourceChanges/sourceContentChange.js';
import { sourceSensitivityChange } from './sourceChanges/sourceSensitivityChange.js';
import { sourceConfigurationChange } from './sourceChanges/sourceConfigurationChange.js';
import { sourceMissingRemoval } from './sourceChanges/sourceMissingRemoval.js';
import { sourceDisconnectedRemoval } from './sourceChanges/sourceDisconnectedRemoval.js';
import { sourceBlacklistedRemoval } from './sourceChanges/sourceBlacklistedRemoval.js';
import { sourceUnreachableRemoval } from './sourceChanges/sourceUnreachableRemoval.js';
export { sourceContentChange } from './sourceChanges/sourceContentChange.js';
export { sourceSensitivityChange } from './sourceChanges/sourceSensitivityChange.js';
export { sourceConfigurationChange } from './sourceChanges/sourceConfigurationChange.js';
export { sourceMissingRemoval } from './sourceChanges/sourceMissingRemoval.js';
export { sourceDisconnectedRemoval } from './sourceChanges/sourceDisconnectedRemoval.js';
export { sourceBlacklistedRemoval } from './sourceChanges/sourceBlacklistedRemoval.js';
export { sourceUnreachableRemoval } from './sourceChanges/sourceUnreachableRemoval.js';

export const sourceModification = define({
  id: id.sourceModification, name: 'Source Review Modification', kind: 'state', searchFacet: false,
  parentId: id.sourceReviewWorkspace, appAreaIds: [id.bundleSourcing],
  definition: text`An included page whose captured content, sensitivity, or saved graph configuration changed in the proposal.`,
  mechanics: [text`${link(id.sourceContentChange, 'Source change')}, ${link(id.sourceSensitivityChange, 'Sensitivity changed')}, and ${link(id.sourceConfigurationChange, 'Config change')} are separately defined subtypes. A page and a scenario can exercise several. Tracking choices remain distinct from configuration changes.`],
  interplay: text`${link(id.sourceReviewFiltering, 'Source Review Filtering')} exposes these subtypes; the run overview nests their scenario filters under Modify.`,
});
export const sourceRemoval = define({
  id: id.sourceRemoval, name: 'Source Review Removal', kind: 'state', searchFacet: false,
  parentId: id.sourceReviewWorkspace, appAreaIds: [id.bundleSourcing],
  definition: text`An accepted page departs the proposed graph, with a specific explanation for its exclusion.`,
  mechanics: [text`${link(id.sourceMissingRemoval, 'Source missing')}, ${link(id.sourceDisconnectedRemoval, 'Disconnected')}, ${link(id.sourceBlacklistedRemoval, 'Blacklisted')}, and ${link(id.sourceUnreachableRemoval, 'Not reachable')} are separately defined removal subtypes. A page’s direct subtype is separate from the upstream route cause. Acceptance removes unreachable saved configuration while leaving source files untouched.`],
  interplay: text`${link(id.sourceReviewCleanup, 'Accepted Scope Cleanup')} applies removal. The run overview nests verified scenario subtypes under Remove.`,
});
export const sourceChangeTypeConcepts = [sourceModification, sourceRemoval,
  sourceContentChange,
  sourceSensitivityChange,
  sourceConfigurationChange,
  sourceMissingRemoval,
  sourceDisconnectedRemoval,
  sourceBlacklistedRemoval,
  sourceUnreachableRemoval,
] as const;
