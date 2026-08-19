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

import type { BundleConfig } from '../../../../../../shared_code/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import type { LinkResolvedInfo } from '../../../../../../shared_code/types/IBundleNode.js';
import type { BundleRouteTable } from './bundleRoutePlanner.js';
import { resolveTrackedLinkHref } from './linkModificationService.js';

const URL_ATTRIBUTE_PATTERN = /\b(href|src)(\s*=\s*)(["'])(.*?)\3/gi;
const RENDERED_PAGE_FILE_TYPES = new Set(['md', 'html', 'excalidraw']);

function resolvedFileType(resolved: LinkResolvedInfo): string | null {
  const targetPath = resolved.link_resolved_target_path;
  if (!targetPath) return null;
  const filename = targetPath.split('/').pop() ?? '';
  const extensionIndex = filename.lastIndexOf('.');
  return extensionIndex > 0 ? filename.slice(extensionIndex + 1).toLowerCase() : null;
}

function isExternalOrDocumentLocalUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized === ''
    || normalized.startsWith('#')
    || normalized.startsWith('//')
    || normalized.startsWith('http://')
    || normalized.startsWith('https://')
    || normalized.startsWith('mailto:')
    || normalized.startsWith('tel:')
    || normalized.startsWith('data:')
    || normalized.startsWith('javascript:');
}

/**
 * Rewrites native HTML or SVG URL attributes with the working graph's
 * resolved targets. Page links use generated routes while CSS, JavaScript,
 * images, and other assets retain their source filenames.
 */
export function rewriteNativeHtmlUrls(args: {
  content: string;
  currentOutputDirectory: string;
  linkResolutionMap?: Record<string, LinkResolvedInfo>;
  bundleNodeConfigs: BundleNodeConfig[];
  bundleConfig: BundleConfig;
  bundleSlug?: string;
  routeTable: BundleRouteTable;
}): string {
  const {
    content,
    currentOutputDirectory,
    linkResolutionMap,
    bundleNodeConfigs,
    bundleConfig,
    bundleSlug,
    routeTable,
  } = args;

  return content.replace(
    URL_ATTRIBUTE_PATTERN,
    (match: string, attribute: string, assignment: string, quote: string, rawUrl: string) => {
      if (isExternalOrDocumentLocalUrl(rawUrl)) return match;
      const resolved = linkResolutionMap?.[rawUrl];
      if (!resolved) return match;

      const fileType = resolvedFileType(resolved);
      const href = resolveTrackedLinkHref({
        resolved,
        hostPageDirectory: currentOutputDirectory,
        hostOutputDirectory: currentOutputDirectory,
        bundleNodeConfigs,
        bundleConfig,
        bundleSlug,
        routeTable,
        targetUrlMode: fileType && RENDERED_PAGE_FILE_TYPES.has(fileType)
          ? 'rendered-page'
          : 'source-file',
      });
      if (href === null) {
        return `${attribute}${assignment}${quote}#${quote} data-meadow-link-not-tracked="true"`;
      }
      return `${attribute}${assignment}${quote}${href}${quote}`;
    }
  );
}
