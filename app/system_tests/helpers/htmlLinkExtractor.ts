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

import { parse as parseHtml } from 'node-html-parser';

/**
 * Extracts link paths from the main content section of an HTML page.
 * Returns both <a> href and <img> src attributes, skipping block anchors.
 * Paths are URL-decoded for comparison.
 */
export function extractMainSectionLinkPaths(htmlContent: string): string[] {
  const root = parseHtml(htmlContent);
  const mainElement = root.querySelector('main');

  if (!mainElement) {
    return [];
  }

  const links: string[] = [];

  // Extract <a> href attributes (but not block anchors)
  const anchorElements = mainElement.querySelectorAll('a');
  for (const anchor of anchorElements) {
    if (anchor.classList.contains('block-anchor')) {
      continue;
    }
    const href = anchor.getAttribute('href');
    if (href) {
      links.push(decodeURIComponent(href));
    }
  }

  // Extract <img> src attributes
  const imgElements = mainElement.querySelectorAll('img');
  for (const img of imgElements) {
    const src = img.getAttribute('src');
    if (src) {
      links.push(decodeURIComponent(src));
    }
  }

  return links;
}

/**
 * Extracts backlink paths from the footer section of an HTML page.
 * Returns the first <a> href from each <li class="backlink"> in <footer>.
 * Paths are URL-decoded for comparison.
 */
export function extractFooterBacklinkPaths(htmlContent: string): string[] {
  const root = parseHtml(htmlContent);
  const footerElement = root.querySelector('footer');

  if (!footerElement) {
    return [];
  }

  const links: string[] = [];

  const backlinkItems = footerElement.querySelectorAll('li.backlink');
  for (const li of backlinkItems) {
    const anchor = li.querySelector('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href) {
        links.push(decodeURIComponent(href));
      }
    }
  }

  return links;
}

export interface ExtractedBacklinkContextEmbeddedLink {
  linkName: string;
  linkRelativePath: string;
}

export interface ExtractedBacklinkContext {
  seeInContextLinkRelativePath: string;
  embeddedLinks: ExtractedBacklinkContextEmbeddedLink[];
}

export interface ExtractedBacklinkDetails {
  relativeLinkPath: string;
  contexts: ExtractedBacklinkContext[];
}

/**
 * Extracts full backlink context details from the footer section of an HTML page.
 * For each backlink <li>, returns the direct link path and all context entries
 * including see-in-context paths and embedded links within each context.
 */
export function extractBacklinkDetails(htmlContent: string): ExtractedBacklinkDetails[] {
  const root = parseHtml(htmlContent);
  const footerElement = root.querySelector('footer');

  if (!footerElement) {
    return [];
  }

  const results: ExtractedBacklinkDetails[] = [];

  const backlinkItems = footerElement.querySelectorAll('li.backlink');
  for (const li of backlinkItems) {
    const directAnchor = li.querySelector('a');
    if (!directAnchor) continue;

    const directHref = directAnchor.getAttribute('href');
    if (!directHref) continue;

    const relativeLinkPath = decodeURIComponent(directHref);
    const contexts: ExtractedBacklinkContext[] = [];

    const contextContainers = li.querySelectorAll('.backlink-context-container');
    for (const container of contextContainers) {
      const seeInContextAnchor = container.querySelector('a.backlink-see-in-context');
      let seeInContextLinkRelativePath = '';
      if (seeInContextAnchor) {
        const href = seeInContextAnchor.getAttribute('href');
        if (href) {
          seeInContextLinkRelativePath = decodeURIComponent(href.split('#')[0]);
        }
      }

      const embeddedLinks: ExtractedBacklinkContextEmbeddedLink[] = [];
      const contextDiv = container.querySelector('.backlink-context');
      if (contextDiv) {
        const allAnchors = contextDiv.querySelectorAll('a');
        for (const anchor of allAnchors) {
          // Skip the see-in-context link if it's nested inside context div
          if (anchor.classList.contains('backlink-see-in-context')) continue;
          const href = anchor.getAttribute('href');
          if (href) {
            embeddedLinks.push({
              linkName: anchor.textContent.trim(),
              linkRelativePath: decodeURIComponent(href),
            });
          }
        }
      }

      contexts.push({ seeInContextLinkRelativePath, embeddedLinks });
    }

    results.push({ relativeLinkPath, contexts });
  }

  return results;
}
