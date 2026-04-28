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
 * Runtime link checking for pagespecs.
 * Validates that pagespec link specifications match actual working graph links.
 */

import type { PagespecLinkSpec, PagespecLinks } from '../types/test/pagespec.js';
import { IMAGE_EXTENSIONS } from '../utils/fileTypeUtils.js';

/**
 * Result of a link check operation.
 */
export interface LinkCheckResult {
  isValid: boolean;
  errors: LinkCheckError[];
}

/**
 * Error from link checking.
 */
export interface LinkCheckError {
  type: 'missing_in_spec' | 'missing_in_actual' | 'wrong_is_in_graph';
  linkType: 'outlink' | 'inlink';
  linkPath: string;
  message: string;
  expectedIsInGraph?: boolean;
  actualIsInGraph?: boolean;
}

/**
 * Checks if a path ends with an image extension.
 *
 * @param path - The path to check
 * @returns The extension if it's an image, undefined otherwise
 */
function getImageExtension(path: string): string | undefined {
  const lowerPath = path.toLowerCase();
  return IMAGE_EXTENSIONS.find((ext) => lowerPath.endsWith(ext));
}

/**
 * Converts a pagespec link path to a page ID.
 * Link paths in pagespecs are like "/main page.md" or "/folder/page.md" for pages,
 * or "/folder/image.png" for images.
 * Page IDs in the working graph are typically just the path without extension for pages,
 * or the full path with extension for images.
 *
 * @param linkPath - The link path from the pagespec (e.g., "/main page.md" or "/folder/image.png")
 * @returns The page ID (e.g., "main page" for pages, "folder/image.png" for images)
 */
export function linkPathToPageId(linkPath: string): string {
  // Remove leading slash if present
  let path = linkPath.startsWith('/') ? linkPath.slice(1) : linkPath;

  // Check if it's an image - if so, keep the full path with extension
  const imageExt = getImageExtension(path);
  if (imageExt) {
    return path;
  }

  // Remove .md extension for pages
  if (path.endsWith('.md')) {
    path = path.slice(0, -3);
  }
  return path;
}

/**
 * Converts a page ID to a link path.
 * For pages, the pageId is without extension and .md is added.
 * For images, the pageId includes the extension and is returned as-is (with leading /).
 *
 * @param pageId - The page ID (e.g., "main page" for pages, "folder/image.png" for images)
 * @returns The link path (e.g., "/main page.md" or "/folder/image.png")
 */
export function pageIdToLinkPath(pageId: string): string {
  // Check if it's an image (pageId already has extension)
  const imageExt = getImageExtension(pageId);
  if (imageExt) {
    return `/${pageId}`;
  }
  // For pages, add .md extension
  return `/${pageId}.md`;
}

/**
 * Validates outlinks against actual working graph data.
 * Performs strict matching: all specified must exist, all actual must be specified.
 *
 * @param specifiedLinks - Links specified in the pagespec
 * @param actualLinkPageIds - Actual outlink page IDs from the working graph
 * @param workingGraphPageIds - Set of all page IDs in the working graph
 * @param context - Context for error messages (e.g., page title)
 * @returns Array of link check errors
 */
export function validateOutlinks(
  specifiedLinks: PagespecLinkSpec[],
  actualLinkPageIds: string[],
  workingGraphPageIds: Set<string>,
  context: string
): LinkCheckError[] {
  const errors: LinkCheckError[] = [];

  // Create sets for comparison
  const specifiedPaths = new Set(specifiedLinks.map((l) => l.linkPath));
  const actualPaths = new Set(actualLinkPageIds.map((id) => pageIdToLinkPath(id)));

  // Check that all specified links exist in actual
  for (const spec of specifiedLinks) {
    const pageId = linkPathToPageId(spec.linkPath);
    const actualPath = pageIdToLinkPath(pageId);

    if (!actualPaths.has(actualPath)) {
      errors.push({
        type: 'missing_in_actual',
        linkType: 'outlink',
        linkPath: spec.linkPath,
        message: `${context}: Outlink "${spec.linkPath}" specified in pagespec but not found in actual outlinks`,
      });
      continue;
    }

    // Check isInGraph is correct
    const actualIsInGraph = workingGraphPageIds.has(pageId);
    if (spec.isInGraph !== actualIsInGraph) {
      errors.push({
        type: 'wrong_is_in_graph',
        linkType: 'outlink',
        linkPath: spec.linkPath,
        expectedIsInGraph: spec.isInGraph,
        actualIsInGraph,
        message: `${context}: Outlink "${spec.linkPath}" has isInGraph=${spec.isInGraph} but target is ${actualIsInGraph ? '' : 'not '}in working graph`,
      });
    }
  }

  // Check that all actual links are specified
  for (const actualPageId of actualLinkPageIds) {
    const actualPath = pageIdToLinkPath(actualPageId);
    if (!specifiedPaths.has(actualPath)) {
      errors.push({
        type: 'missing_in_spec',
        linkType: 'outlink',
        linkPath: actualPath,
        message: `${context}: Actual outlink "${actualPath}" not specified in pagespec`,
      });
    }
  }

  return errors;
}

/**
 * Validates inlinks against actual working graph data.
 * Performs strict matching: all specified must exist, all actual must be specified.
 *
 * @param specifiedLinks - Links specified in the pagespec
 * @param actualLinkPageIds - Actual inlink page IDs from the working graph
 * @param workingGraphPageIds - Set of all page IDs in the working graph
 * @param context - Context for error messages (e.g., page title)
 * @returns Array of link check errors
 */
export function validateInlinks(
  specifiedLinks: PagespecLinkSpec[],
  actualLinkPageIds: string[],
  workingGraphPageIds: Set<string>,
  context: string
): LinkCheckError[] {
  const errors: LinkCheckError[] = [];

  // Create sets for comparison
  const specifiedPaths = new Set(specifiedLinks.map((l) => l.linkPath));
  const actualPaths = new Set(actualLinkPageIds.map((id) => pageIdToLinkPath(id)));

  // Check that all specified links exist in actual
  for (const spec of specifiedLinks) {
    const pageId = linkPathToPageId(spec.linkPath);
    const actualPath = pageIdToLinkPath(pageId);

    if (!actualPaths.has(actualPath)) {
      errors.push({
        type: 'missing_in_actual',
        linkType: 'inlink',
        linkPath: spec.linkPath,
        message: `${context}: Inlink "${spec.linkPath}" specified in pagespec but not found in actual inlinks`,
      });
      continue;
    }

    // Check isInGraph is correct
    const actualIsInGraph = workingGraphPageIds.has(pageId);
    if (spec.isInGraph !== actualIsInGraph) {
      errors.push({
        type: 'wrong_is_in_graph',
        linkType: 'inlink',
        linkPath: spec.linkPath,
        expectedIsInGraph: spec.isInGraph,
        actualIsInGraph,
        message: `${context}: Inlink "${spec.linkPath}" has isInGraph=${spec.isInGraph} but source is ${actualIsInGraph ? '' : 'not '}in working graph`,
      });
    }
  }

  // Check that all actual links are specified
  for (const actualPageId of actualLinkPageIds) {
    const actualPath = pageIdToLinkPath(actualPageId);
    if (!specifiedPaths.has(actualPath)) {
      errors.push({
        type: 'missing_in_spec',
        linkType: 'inlink',
        linkPath: actualPath,
        message: `${context}: Actual inlink "${actualPath}" not specified in pagespec`,
      });
    }
  }

  return errors;
}

/**
 * Working graph data needed for link checking.
 */
export interface WorkingGraphData {
  /** Set of all page IDs in the working graph */
  pageIds: Set<string>;
  /** Map from page ID to array of outlink page IDs */
  outlinks: Map<string, string[]>;
  /** Map from page ID to array of inlink page IDs */
  inlinks: Map<string, string[]>;
}

/**
 * Full validation of a pagespec's links against working graph data.
 *
 * @param links - The links section from the pagespec
 * @param pageId - The ID of the page being checked
 * @param workingGraph - Working graph data
 * @param pageTitle - Page title for error messages
 * @returns Link check result with validity and errors
 */
export function checkPagespecLinks(
  links: PagespecLinks,
  pageId: string,
  workingGraph: WorkingGraphData,
  pageTitle: string
): LinkCheckResult {
  const errors: LinkCheckError[] = [];

  // Get actual links from working graph
  const actualOutlinks = workingGraph.outlinks.get(pageId) || [];
  const actualInlinks = workingGraph.inlinks.get(pageId) || [];

  // Validate outlinks if specified
  if (links.outlinks !== undefined) {
    errors.push(
      ...validateOutlinks(links.outlinks, actualOutlinks, workingGraph.pageIds, pageTitle)
    );
  } else if (actualOutlinks.length > 0) {
    // No outlinks specified but there are actual outlinks
    for (const outlink of actualOutlinks) {
      errors.push({
        type: 'missing_in_spec',
        linkType: 'outlink',
        linkPath: pageIdToLinkPath(outlink),
        message: `${pageTitle}: Actual outlink "${pageIdToLinkPath(outlink)}" not specified in pagespec (outlinks section missing)`,
      });
    }
  }

  // Validate inlinks if specified
  if (links.inlinks !== undefined) {
    errors.push(
      ...validateInlinks(links.inlinks, actualInlinks, workingGraph.pageIds, pageTitle)
    );
  } else if (actualInlinks.length > 0) {
    // No inlinks specified but there are actual inlinks
    for (const inlink of actualInlinks) {
      errors.push({
        type: 'missing_in_spec',
        linkType: 'inlink',
        linkPath: pageIdToLinkPath(inlink),
        message: `${pageTitle}: Actual inlink "${pageIdToLinkPath(inlink)}" not specified in pagespec (inlinks section missing)`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
