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

const mutationTails = new Map<string, Promise<void>>();

export async function runSerializedBundleNodeMutation<T>(
  slug: string,
  mutation: () => Promise<T>,
): Promise<T> {
  const previous = mutationTails.get(slug) ?? Promise.resolve();
  const result = previous.then(mutation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  mutationTails.set(slug, tail);
  try {
    return await result;
  } finally {
    if (mutationTails.get(slug) === tail) mutationTails.delete(slug);
  }
}
