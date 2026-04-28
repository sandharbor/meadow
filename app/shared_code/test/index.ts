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
  extractPagespecsBlock,
  getPagespecForSite,
  getReferencedSites,
  extractContentWithoutPagespecs,
  hasPagespecsBlock,
} from './pagespecUtils.js';

export type { BuiltinFilterId, ValidationError, ValidationOptions } from './pagespecValidation.js';

export {
  BUILTIN_FILTER_IDS,
  isValidFilterId,
  isValidLinkPath,
  validateHtmlRenderedLinks,
  validateLinkSpec,
  validateLinksSection,
  validatePagespecEntry,
  validatePagespecsBlock,
  validatePagespecsBlockStructure,
} from './pagespecValidation.js';

export type {
  LinkCheckResult,
  LinkCheckError,
  WorkingGraphData,
} from './pagespecLinkChecker.js';

export {
  linkPathToPageId,
  pageIdToLinkPath,
  validateOutlinks,
  validateInlinks,
  checkPagespecLinks,
} from './pagespecLinkChecker.js';
