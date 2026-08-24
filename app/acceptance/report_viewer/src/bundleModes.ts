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

export const BUNDLE_MODE_OPTIONS = [
  { id: "single-file", label: "Single file" },
  { id: "single-folder", label: "Single folder" },
  { id: "multiple-folders", label: "Multiple folders" },
] as const;

export type BundleMode = (typeof BUNDLE_MODE_OPTIONS)[number]["id"];

export function isBundleMode(value: unknown): value is BundleMode {
  return BUNDLE_MODE_OPTIONS.some((option) => option.id === value);
}

export function bundleModeLabel(mode: BundleMode): string {
  return BUNDLE_MODE_OPTIONS.find((option) => option.id === mode)!.label;
}
