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
 * Find a unique name by appending an incrementing suffix (-1, -2, etc.)
 * if the base name already exists.
 */
export function findUniqueName(baseName: string, exists: (name: string) => boolean): string {
  if (!exists(baseName)) return baseName;
  let counter = 1;
  while (exists(`${baseName}-${counter}`)) {
    counter++;
  }
  return `${baseName}-${counter}`;
}
