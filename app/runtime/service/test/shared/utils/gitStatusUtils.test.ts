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

import { describe, expect, it } from 'vitest';
import { isRetryableFastGitOpsContention } from '../../../src/shared/utils/configDirectory/gitUtils/gitStatusUtils.js';

describe('fast Git operation contention', () => {
  it('retries transient index-lock and branch-reference races', () => {
    expect(isRetryableFastGitOpsContention('AcquireLock(PermanentlyLocked)')).toBe(true);
    expect(isRetryableFastGitOpsContention(
      'ReferenceEdit(FileTransactionPrepare(ReferenceOutOfDate { full_name: "refs/heads/main" }))',
    )).toBe(true);
  });

  it('does not retry unrelated native Git failures', () => {
    expect(isRetryableFastGitOpsContention('path is outside the repository')).toBe(false);
  });
});
