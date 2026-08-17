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

/**
 * Provider history is written only after this transaction resolves. Keeping
 * remote ordering here makes the two safety-critical commit points explicit:
 * version files precede the successor manifest on publish, and the successor
 * manifest precedes version-file removal on delete.
 */
export async function publishVersionFilesThenManifest<T>(operations: {
  uploadVersionFiles: () => Promise<T>;
  putSuccessorManifest: () => Promise<void>;
}): Promise<T> {
  const result = await operations.uploadVersionFiles();
  await operations.putSuccessorManifest();
  return result;
}

export async function deleteManifestThenVersionFiles<T>(operations: {
  putSuccessorManifest: () => Promise<void>;
  deleteVersionFiles: () => Promise<T>;
}): Promise<T> {
  await operations.putSuccessorManifest();
  return operations.deleteVersionFiles();
}
