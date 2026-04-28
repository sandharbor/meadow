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
 * Encodes a file path for use in URLs, encoding each path segment separately
 * while preserving "/" directory separators.
 * 
 * Example: "ai/considering evals.html" -> "ai/considering%20evals.html"
 * 
 * @param path - The file path to encode
 * @returns The URL-encoded path with preserved directory separators
 */
export function encodePathForUrl(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
