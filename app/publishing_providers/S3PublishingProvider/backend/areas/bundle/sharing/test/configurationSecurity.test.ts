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
import express from 'express';
import request from 'supertest';
import {
  configurationGetResponse,
  registerS3ConfigurationRoutes,
} from '../internal/routes/configurationRoutes.js';

describe('S3 configuration renderer boundary', () => {
  it('returns credential presence without returning stored credential values', () => {
    const response = configurationGetResponse(
      { s3BucketName: 'example' },
      { s3AccessKeyId: 'FAKE-ACCESS-ID', s3SecretAccessKey: 'FAKE-SECRET' },
    );
    expect(response).toMatchObject({ hasAccessKeyId: true, hasSecretAccessKey: true });
    expect(JSON.stringify(response)).not.toContain('FAKE-ACCESS-ID');
    expect(JSON.stringify(response)).not.toContain('FAKE-SECRET');
  });

  it('does not mount a stored-secret readback endpoint', async () => {
    const app = express();
    const router = express.Router();
    registerS3ConfigurationRoutes(router);
    app.use(router);
    await request(app).get('/configuration/secret').expect(404);
  });
});
