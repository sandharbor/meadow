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
 * Pattern to match a pagespecs YAML block at the end of a markdown file.
 * Matches ```yaml or ```pagespecs code blocks containing a pagespecs: key.
 */
export const PAGESPECS_BLOCK_PATTERN = /```(?:yaml|pagespecs)\s*\n([\s\S]*?pagespecs:[\s\S]*?)```\s*$/;

/**
 * Extracts the markdown content without the pagespecs block.
 * This is used when rendering HTML to exclude test metadata from output.
 */
export function extractContentWithoutPagespecs(content: string): string {
  return content.replace(PAGESPECS_BLOCK_PATTERN, '').trimEnd();
}

/**
 * Checks if content has a pagespecs block.
 */
export function hasPagespecsBlock(content: string): boolean {
  return PAGESPECS_BLOCK_PATTERN.test(content);
}
