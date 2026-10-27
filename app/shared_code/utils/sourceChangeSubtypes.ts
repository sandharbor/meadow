/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { sourceContentChangeDefinition } from './source-change-types/sourceContentChange.js';
import { sourceSensitivityChangeDefinition } from './source-change-types/sourceSensitivityChange.js';
import { sourceConfigurationChangeDefinition } from './source-change-types/sourceConfigurationChange.js';
import { sourceMissingRemovalDefinition } from './source-change-types/sourceMissingRemoval.js';
import { sourceDisconnectedRemovalDefinition } from './source-change-types/sourceDisconnectedRemoval.js';
import { sourceBlacklistedRemovalDefinition } from './source-change-types/sourceBlacklistedRemoval.js';
import { sourceUnreachableRemovalDefinition } from './source-change-types/sourceUnreachableRemoval.js';

export { sourceContentChangeDefinition } from './source-change-types/sourceContentChange.js';
export { sourceSensitivityChangeDefinition } from './source-change-types/sourceSensitivityChange.js';
export { sourceConfigurationChangeDefinition } from './source-change-types/sourceConfigurationChange.js';
export { sourceMissingRemovalDefinition } from './source-change-types/sourceMissingRemoval.js';
export { sourceDisconnectedRemovalDefinition } from './source-change-types/sourceDisconnectedRemoval.js';
export { sourceBlacklistedRemovalDefinition } from './source-change-types/sourceBlacklistedRemoval.js';
export { sourceUnreachableRemovalDefinition } from './source-change-types/sourceUnreachableRemoval.js';

export const sourceChangeSubtypes = [
  sourceContentChangeDefinition,
  sourceSensitivityChangeDefinition,
  sourceConfigurationChangeDefinition,
  sourceMissingRemovalDefinition,
  sourceDisconnectedRemovalDefinition,
  sourceBlacklistedRemovalDefinition,
  sourceUnreachableRemovalDefinition,
] as const;

export type SourceChangeSubtypeId = typeof sourceChangeSubtypes[number]['id'];

export function isSourceChangeSubtypeId(value: string): value is SourceChangeSubtypeId {
  return sourceChangeSubtypes.some(subtype => subtype.id === value);
}
