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

export type TrackBundleOptions =
  | { slug: string; mode: "all-safe" }
  | { slug: string; mode: "targeted"; nodeKeys: string[] };

export function parseTrackBundleOptions(args: string[]): TrackBundleOptions {
  const slug = args[0];
  if (!slug || slug.startsWith("--")) {
    throw new Error("Usage: meadow bundle track <bundle-slug> <--all-safe|--node-key <key>>");
  }
  let allSafe = false;
  const nodeKeys: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--all-safe") {
      if (allSafe) throw new Error("--all-safe may only be provided once");
      allSafe = true;
      continue;
    }
    if (option === "--node-key") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--node-key requires a bundleNodeKey value");
      nodeKeys.push(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${option}. Run 'meadow bundle track --help'.`);
  }
  if (allSafe && nodeKeys.length > 0) throw new Error("Choose either --all-safe or --node-key, not both");
  if (!allSafe && nodeKeys.length === 0) throw new Error("Provide --all-safe or at least one --node-key");
  return allSafe ? { slug, mode: "all-safe" } : { slug, mode: "targeted", nodeKeys };
}
