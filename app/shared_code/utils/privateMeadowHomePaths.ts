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

const PRIVATE_DOCUMENT_NAMES = new Set([
  'pp_secrets.yaml',
  'secret_app_config.yaml',
]);

/** True when a Meadow Home path names a document whose contents must not enter support artifacts. */
export function isPrivateMeadowHomePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  if (
    normalized === '.meadow-migration-recovery'
    || normalized.startsWith('.meadow-migration-recovery/')
  ) return true;
  const name = normalized.split('/').filter(Boolean).at(-1);
  return name !== undefined && PRIVATE_DOCUMENT_NAMES.has(name);
}
