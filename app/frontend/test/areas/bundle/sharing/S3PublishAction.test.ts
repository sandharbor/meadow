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
import { s3PublishAction } from '../../../../../publishing_providers/S3PublishingProvider/frontend/internal/PublishToS3Tab';

describe('P02 P07 minimal S3 historical publication actions', () => {
  it('uses explicit first, same-generation, changed-generation, and imported-freshness copy', () => {
    expect(s3PublishAction('not-published')).toEqual({ label: 'Publish', requiresConfirmation: false });
    expect(s3PublishAction('published-current')).toEqual({ label: 'Republish', requiresConfirmation: false });
    expect(s3PublishAction('update-available')).toEqual({ label: 'Update Published Version…', requiresConfirmation: true });
    expect(s3PublishAction('imported-unknown')).toEqual({ label: 'Update Published Version…', requiresConfirmation: true });
  });
});
