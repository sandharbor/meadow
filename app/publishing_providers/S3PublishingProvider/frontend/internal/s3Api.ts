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

import { API_BASE_URL } from '../../../../frontend/src/utils/apiConfig';

export const S3_API_PREFIX = 's3-api';

export function s3Api(path: string): string {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  return `${API_BASE_URL}/publishing-providers/S3PublishingProvider/${trimmed}`;
}
