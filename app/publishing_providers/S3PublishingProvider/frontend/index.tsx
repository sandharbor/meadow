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

import type { IPublishingProviderFrontend } from '../../../frontend/src/publishing/IPublishingProviderFrontend.js';
import type { PublishingProviderManifest } from '../../../shared_code/interfaces/IPublishingProvider.js';
import { PublishToS3Tab } from './internal/PublishToS3Tab';
import { s3Api } from './internal/s3Api';

const manifest: PublishingProviderManifest = {
  id: 'S3PublishingProvider',
  displayName: 'S3 Bucket',
  publishTabLabel: 'Publish to S3',
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // fall through
  }
  return fallback;
}

async function fetchPublishedUrl(siteSlug: string): Promise<string> {
  const res = await fetch(s3Api(`sites/${siteSlug}/published-url`));
  if (!res.ok) {
    throw new Error(await readError(res, `Failed to fetch published URL (${res.status})`));
  }
  const body = await res.json();
  if (!body?.url) throw new Error('Published URL not available');
  return body.url;
}

async function fetchPublishedFileCounts(
  siteSlug: string,
): Promise<{ htmlCount: number; otherCount: number }> {
  const res = await fetch(s3Api(`sites/${siteSlug}/published-file-counts`));
  if (!res.ok) {
    throw new Error(await readError(res, `Failed to fetch published file counts (${res.status})`));
  }
  const body = await res.json();
  return {
    htmlCount: Number(body?.htmlCount ?? 0),
    otherCount: Number(body?.otherCount ?? 0),
  };
}

const provider: IPublishingProviderFrontend = {
  manifest,
  PublishTabComponent: PublishToS3Tab,
  fetchPublishedUrl,
  fetchPublishedFileCounts,
};

export default provider;
