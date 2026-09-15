/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

export {
  getNodespecForBundle,
  getReferencedBundles,
  isExcalidrawMarkdown,
  getSidecarNodespecPath,
  getNodespecBlock,
  parseNodespecSidecarContent,
  sourceFileForSidecarPath,
} from './nodespecUtils.js';

export type { BuiltinFilterId, ValidationError, ValidationOptions } from './nodespecValidation.js';

export {
  BUILTIN_FILTER_IDS,
  isValidFilterId,
  isValidLinkPath,
  validateHtmlRenderedLinks,
  validateLinkSpec,
  validateLinksSection,
  validateNodespecEntry,
  validateNodespecsBlock,
  validateNodespecsBlockStructure,
} from './nodespecValidation.js';

export type {
  LinkCheckResult,
  LinkCheckError,
  WorkingGraphData,
} from './nodespecLinkChecker.js';

export {
  linkPathToPageId,
  pageIdToLinkPath,
  validateOutlinks,
  validateInlinks,
  checkNodespecLinks,
} from './nodespecLinkChecker.js';

export type {
  BacklinkContextEmbeddedLink,
  BacklinkContextSpec,
  NodespecLinkSpec,
  NodespecLinks,
  HtmlRenderedLinkSpec,
  HtmlRenderedLinks,
  NodespecFiltersSelected,
  NodespecCuration,
  NodespecCurationInWorkingGraph,
  NodespecCurationNotInWorkingGraph,
  NodespecGeneration,
  NodespecInWorkingGraph,
  NodespecNotInWorkingGraph,
  NodespecEntry,
  NodespecsBlock,
} from './types.js';

export {
  isNodespecInWorkingGraph,
  isNodespecNotInWorkingGraph,
} from './types.js';
