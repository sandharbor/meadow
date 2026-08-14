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

import type { SrsSettings } from './types';

export const DEFAULT_SRS_SETTINGS: SrsSettings = {
  singleLineSeparator: '::',
  bidirectionalSeparator: ':::',
  multilineSeparator: '?',
  multilineBidirectionalSeparator: '??',
  endDelimiter: '+++',
  clozePatterns: [
    '==answer==[^\\[hint\\]][\\[^123\\]]',
    '{{[123::]answer[::hint]}}',
    '**answer**',
  ],
  burySiblingCards: true,
  showContext: true,
  defaultReviewMode: 'due',
};

export function mergeSrsSettings(overrides: Partial<SrsSettings> | undefined): SrsSettings {
  return {
    ...DEFAULT_SRS_SETTINGS,
    ...overrides,
    clozePatterns: overrides?.clozePatterns && overrides.clozePatterns.length > 0
      ? overrides.clozePatterns
      : DEFAULT_SRS_SETTINGS.clozePatterns,
  };
}
