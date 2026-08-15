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
 * Validation functions for pagespecs blocks.
 */

import {
  PagespecEntry,
  PagespecsBlock,
  isPagespecNotInWorkingGraph,
  isPagespecInWorkingGraph,
} from './types.js';
import { IMAGE_EXTENSIONS } from '../../shared_code/utils/fileTypeUtils.js';

/**
 * Valid file extensions for link paths.
 * Includes traversable text nodes and image extensions.
 */
const VALID_LINK_EXTENSIONS = ['.md', '.html', '.css', '.js', ...IMAGE_EXTENSIONS] as const;

/**
 * Built-in filter IDs that are always valid.
 */
export const BUILTIN_FILTER_IDS = [
  'untracked-filter',
  'sensitive-filter',
] as const;

export type BuiltinFilterId = (typeof BUILTIN_FILTER_IDS)[number];

/**
 * Pattern for custom filter IDs.
 * Custom filters must match the pattern "custom-{id}" where id is alphanumeric with hyphens.
 */
const CUSTOM_FILTER_PATTERN = /^custom-[a-zA-Z0-9-]+$/;

/**
 * Checks if a link path is valid.
 * Valid link paths are paths to traversable text files or images that can be
 * absolute (starting with /) or relative, and must end with a valid extension.
 *
 * @param linkPath - The link path to check
 * @returns true if the link path is valid
 */
export function isValidLinkPath(linkPath: string): boolean {
  if (!linkPath || typeof linkPath !== 'string') {
    return false;
  }
  // Check basic structure: should end with a valid extension
  const lowerPath = linkPath.toLowerCase();
  const hasValidExtension = VALID_LINK_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
  if (!hasValidExtension) {
    return false;
  }
  // Should not have double slashes or empty segments
  if (linkPath.includes('//') || linkPath.includes('/./') || linkPath.includes('/../')) {
    return false;
  }
  // Should not be just the extension (e.g., ".md" or "/.md")
  for (const ext of VALID_LINK_EXTENSIONS) {
    if (linkPath === ext || linkPath === `/${ext}`) {
      return false;
    }
  }
  return true;
}

/**
 * Validates a single link spec entry.
 *
 * @param spec - The link spec to validate
 * @param context - Context string for error messages (e.g., "outlinks[0]")
 * @param pageTitle - Title of the page containing this spec
 * @param bundle - Bundle name
 * @returns Array of validation errors (empty if valid)
 */
export function validateLinkSpec(
  spec: unknown,
  context: string,
  pageTitle: string,
  bundle: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!spec || typeof spec !== 'object') {
    errors.push({
      message: `${context} must be an object`,
      pageTitle,
      bundle,
      field: 'links',
    });
    return errors;
  }

  const linkSpec = spec as Record<string, unknown>;

  // Check for unknown keys in link spec
  const allowedLinkSpecKeys = new Set(['linkPath', 'isInGraph']);
  for (const key of Object.keys(linkSpec)) {
    if (!allowedLinkSpecKeys.has(key)) {
      errors.push({
        message: `${context} has unknown key "${key}"`,
        pageTitle,
        bundle,
        field: 'links',
      });
    }
  }

  if (typeof linkSpec.linkPath !== 'string') {
    errors.push({
      message: `${context}.linkPath must be a string`,
      pageTitle,
      bundle,
      field: 'links',
    });
  } else if (!isValidLinkPath(linkSpec.linkPath)) {
    errors.push({
      message: `${context}.linkPath "${linkSpec.linkPath}" is not a valid link path (must end with a supported text or image extension)`,
      pageTitle,
      bundle,
      field: 'links',
    });
  }

  if (typeof linkSpec.isInGraph !== 'boolean') {
    errors.push({
      message: `${context}.isInGraph must be a boolean`,
      pageTitle,
      bundle,
      field: 'links',
    });
  }

  return errors;
}

/**
 * Validates a links section of a pagespec entry.
 *
 * @param links - The links object to validate
 * @param pageTitle - Title of the page containing this spec
 * @param bundle - Bundle name
 * @returns Array of validation errors (empty if valid)
 */
export function validateLinksSection(
  links: unknown,
  pageTitle: string,
  bundle: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!links || typeof links !== 'object') {
    errors.push({
      message: `links must be an object`,
      pageTitle,
      bundle,
      field: 'links',
    });
    return errors;
  }

  const linksObj = links as Record<string, unknown>;

  // Check for unknown keys in links section
  const allowedLinksKeys = new Set(['outlinks', 'inlinks']);
  for (const key of Object.keys(linksObj)) {
    if (!allowedLinksKeys.has(key)) {
      errors.push({
        message: `links has unknown key "${key}"`,
        pageTitle,
        bundle,
        field: 'links',
      });
    }
  }

  // Validate outlinks if present
  if (linksObj.outlinks !== undefined) {
    if (!Array.isArray(linksObj.outlinks)) {
      errors.push({
        message: `links.outlinks must be an array`,
        pageTitle,
        bundle,
        field: 'links',
      });
    } else {
      for (let i = 0; i < linksObj.outlinks.length; i++) {
        errors.push(
          ...validateLinkSpec(linksObj.outlinks[i], `links.outlinks[${i}]`, pageTitle, bundle)
        );
      }
    }
  }

  // Validate inlinks if present
  if (linksObj.inlinks !== undefined) {
    if (!Array.isArray(linksObj.inlinks)) {
      errors.push({
        message: `links.inlinks must be an array`,
        pageTitle,
        bundle,
        field: 'links',
      });
    } else {
      for (let i = 0; i < linksObj.inlinks.length; i++) {
        errors.push(
          ...validateLinkSpec(linksObj.inlinks[i], `links.inlinks[${i}]`, pageTitle, bundle)
        );
      }
    }
  }

  return errors;
}

/**
 * Validates an htmlRenderedLinks section of a pagespec entry.
 */
export function validateHtmlRenderedLinks(
  htmlRenderedLinks: unknown,
  pageTitle: string,
  bundle: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!htmlRenderedLinks || typeof htmlRenderedLinks !== 'object') {
    errors.push({
      message: `htmlRenderedLinks must be an object`,
      pageTitle,
      bundle,
      field: 'htmlRenderedLinks',
    });
    return errors;
  }

  const obj = htmlRenderedLinks as Record<string, unknown>;

  // Check for unknown keys in htmlRenderedLinks section
  const allowedHtmlRenderedLinksKeys = new Set(['mainSectionLinks', 'footerSectionBacklinks']);
  for (const key of Object.keys(obj)) {
    if (!allowedHtmlRenderedLinksKeys.has(key)) {
      errors.push({
        message: `htmlRenderedLinks has unknown key "${key}"`,
        pageTitle,
        bundle,
        field: 'htmlRenderedLinks',
      });
    }
  }

  if (!Array.isArray(obj.mainSectionLinks)) {
    errors.push({
      message: `htmlRenderedLinks.mainSectionLinks must be an array`,
      pageTitle,
      bundle,
      field: 'htmlRenderedLinks',
    });
  } else {
    for (let i = 0; i < obj.mainSectionLinks.length; i++) {
      const entry = obj.mainSectionLinks[i] as Record<string, unknown>;
      if (!entry || typeof entry !== 'object' || typeof entry.relativeLinkPath !== 'string') {
        errors.push({
          message: `htmlRenderedLinks.mainSectionLinks[${i}] must have a relativeLinkPath string`,
          pageTitle,
          bundle,
          field: 'htmlRenderedLinks',
        });
      } else {
        // Check for unknown keys in mainSectionLinks entry
        const allowedMainLinkKeys = new Set(['relativeLinkPath']);
        for (const key of Object.keys(entry)) {
          if (!allowedMainLinkKeys.has(key)) {
            errors.push({
              message: `htmlRenderedLinks.mainSectionLinks[${i}] has unknown key "${key}"`,
              pageTitle,
              bundle,
              field: 'htmlRenderedLinks',
            });
          }
        }
      }
    }
  }

  if (!Array.isArray(obj.footerSectionBacklinks)) {
    errors.push({
      message: `htmlRenderedLinks.footerSectionBacklinks must be an array`,
      pageTitle,
      bundle,
      field: 'htmlRenderedLinks',
    });
  } else {
    for (let i = 0; i < obj.footerSectionBacklinks.length; i++) {
      const entry = obj.footerSectionBacklinks[i] as Record<string, unknown>;
      if (!entry || typeof entry !== 'object' || typeof entry.relativeLinkPath !== 'string') {
        errors.push({
          message: `htmlRenderedLinks.footerSectionBacklinks[${i}] must have a relativeLinkPath string`,
          pageTitle,
          bundle,
          field: 'htmlRenderedLinks',
        });
        continue;
      }

      // Check for unknown keys in footerSectionBacklinks entry
      const allowedBacklinkKeys = new Set(['relativeLinkPath', 'backlinkContexts']);
      for (const key of Object.keys(entry)) {
        if (!allowedBacklinkKeys.has(key)) {
          errors.push({
            message: `htmlRenderedLinks.footerSectionBacklinks[${i}] has unknown key "${key}"`,
            pageTitle,
            bundle,
            field: 'htmlRenderedLinks',
          });
        }
      }

      // Validate backlinkContexts is present and well-formed
      if (!Array.isArray(entry.backlinkContexts)) {
        errors.push({
          message: `htmlRenderedLinks.footerSectionBacklinks[${i}] must have a backlinkContexts array`,
          pageTitle,
          bundle,
          field: 'htmlRenderedLinks',
        });
      } else {
        for (let j = 0; j < (entry.backlinkContexts as unknown[]).length; j++) {
          const ctx = (entry.backlinkContexts as Record<string, unknown>[])[j];
          const prefix = `htmlRenderedLinks.footerSectionBacklinks[${i}].backlinkContexts[${j}]`;

          if (!ctx || typeof ctx !== 'object') {
            errors.push({
              message: `${prefix} must be an object`,
              pageTitle,
              bundle,
              field: 'htmlRenderedLinks',
            });
            continue;
          }

          // Check for unknown keys in backlinkContexts entry
          const allowedCtxKeys = new Set(['seeInContextLinkRelativePath', 'embeddedLinks']);
          for (const key of Object.keys(ctx)) {
            if (!allowedCtxKeys.has(key)) {
              errors.push({
                message: `${prefix} has unknown key "${key}"`,
                pageTitle,
                bundle,
                field: 'htmlRenderedLinks',
              });
            }
          }

          if (typeof ctx.seeInContextLinkRelativePath !== 'string') {
            errors.push({
              message: `${prefix}.seeInContextLinkRelativePath must be a string`,
              pageTitle,
              bundle,
              field: 'htmlRenderedLinks',
            });
          }

          if (!Array.isArray(ctx.embeddedLinks)) {
            errors.push({
              message: `${prefix}.embeddedLinks must be an array`,
              pageTitle,
              bundle,
              field: 'htmlRenderedLinks',
            });
          } else {
            for (let k = 0; k < (ctx.embeddedLinks as unknown[]).length; k++) {
              const link = (ctx.embeddedLinks as Record<string, unknown>[])[k];
              const linkPrefix = `${prefix}.embeddedLinks[${k}]`;
              if (!link || typeof link !== 'object') {
                errors.push({
                  message: `${linkPrefix} must be an object`,
                  pageTitle,
                  bundle,
                  field: 'htmlRenderedLinks',
                });
              } else {
                // Check for unknown keys in embeddedLinks entry
                const allowedEmbeddedLinkKeys = new Set(['linkName', 'linkRelativePath']);
                for (const key of Object.keys(link)) {
                  if (!allowedEmbeddedLinkKeys.has(key)) {
                    errors.push({
                      message: `${linkPrefix} has unknown key "${key}"`,
                      pageTitle,
                      bundle,
                      field: 'htmlRenderedLinks',
                    });
                  }
                }
                if (typeof link.linkName !== 'string') {
                  errors.push({
                    message: `${linkPrefix}.linkName must be a string`,
                    pageTitle,
                    bundle,
                    field: 'htmlRenderedLinks',
                  });
                }
                if (typeof link.linkRelativePath !== 'string') {
                  errors.push({
                    message: `${linkPrefix}.linkRelativePath must be a string`,
                    pageTitle,
                    bundle,
                    field: 'htmlRenderedLinks',
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Options for pagespec validation.
 */
export interface ValidationOptions {
  /**
   * When true, requires a links section when isInWorkingGraph is true.
   * Default: true
   */
  requireLinksWhenInWorkingGraph?: boolean;
  /**
   * When true, requires htmlRenderedLinks on all entries.
   * Default: true
   */
  requireHtmlRenderedLinks?: boolean;
}

/**
 * Checks if a filter ID is valid.
 * Valid filter IDs are either built-in filter IDs or match the custom filter pattern.
 *
 * @param filterId - The filter ID to check
 * @returns true if the filter ID is valid
 */
export function isValidFilterId(filterId: string): boolean {
  if ((BUILTIN_FILTER_IDS as readonly string[]).includes(filterId)) {
    return true;
  }
  return CUSTOM_FILTER_PATTERN.test(filterId);
}

export interface ValidationError {
  message: string;
  pageTitle?: string;
  bundle?: string;
  field?: string;
}

/**
 * Validates a single pagespec entry.
 *
 * @param spec - The pagespec entry to validate
 * @param availableBundles - Set of valid bundle names
 * @param pageTitle - Title of the page containing this spec (for error messages)
 * @param options - Optional validation options
 * @returns Array of validation errors (empty if valid)
 */
export function validatePagespecEntry(
  spec: PagespecEntry,
  availableBundles: Set<string>,
  pageTitle: string,
  options: ValidationOptions = {}
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { requireLinksWhenInWorkingGraph = true, requireHtmlRenderedLinks = true } = options;
  const { generation } = spec;

  // Check that the bundle exists
  if (!availableBundles.has(spec.bundle)) {
    errors.push({
      message: `Bundle "${spec.bundle}" not found in available bundles`,
      pageTitle,
      bundle: spec.bundle,
      field: 'bundle',
    });
  }

  // If not in working graph, frontierDepthOrNullForOrphan must be present
  if (isPagespecNotInWorkingGraph(spec)) {
    if (spec.curation.frontierDepthOrNullForOrphan === undefined) {
      errors.push({
        message: `When isInWorkingGraph is false, frontierDepthOrNullForOrphan must be specified`,
        pageTitle,
        bundle: spec.bundle,
        field: 'frontierDepthOrNullForOrphan',
      });
    }
  } else {
    const { curation } = spec;

    // Page is in working graph - validate filter IDs if present
    if (curation.filtersSelected) {
      for (const filterId of Object.keys(curation.filtersSelected)) {
        if (!isValidFilterId(filterId)) {
          errors.push({
            message: `Invalid filter ID "${filterId}". Must be a built-in filter (${BUILTIN_FILTER_IDS.join(', ')}) or match pattern "custom-{id}"`,
            pageTitle,
            bundle: spec.bundle,
            field: 'filtersSelected',
          });
        }
      }
    }

    // Require links section when isInWorkingGraph is true (if option enabled)
    if (requireLinksWhenInWorkingGraph && isPagespecInWorkingGraph(spec)) {
      if (!curation.links) {
        errors.push({
          message: `When isInWorkingGraph is true, links section must be specified`,
          pageTitle,
          bundle: spec.bundle,
          field: 'links',
        });
      } else {
        // Validate the links section structure
        errors.push(...validateLinksSection(curation.links, pageTitle, spec.bundle));
      }
    }
  }

  // Validate htmlRenderedLinks on all entries (both in and not-in working graph)
  if (requireHtmlRenderedLinks) {
    if (generation.htmlRenderedLinks === undefined) {
      errors.push({
        message: `htmlRenderedLinks must be specified`,
        pageTitle,
        bundle: spec.bundle,
        field: 'htmlRenderedLinks',
      });
    } else {
      errors.push(...validateHtmlRenderedLinks(generation.htmlRenderedLinks, pageTitle, spec.bundle));
    }
  }

  return errors;
}

/**
 * Validates a complete pagespecs block.
 *
 * @param block - The pagespecs block to validate
 * @param requiredBundles - Bundles that must have a pagespec entry
 * @param availableBundles - Set of valid bundle names
 * @param pageTitle - Title of the page containing this block (for error messages)
 * @param options - Optional validation options
 * @returns Array of validation errors (empty if valid)
 */
export function validatePagespecsBlock(
  block: PagespecsBlock,
  requiredBundles: string[],
  availableBundles: Set<string>,
  pageTitle: string,
  options: ValidationOptions = {}
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate each entry
  for (const spec of block.pagespecs) {
    errors.push(...validatePagespecEntry(spec, availableBundles, pageTitle, options));
  }

  // Check for duplicate bundle entries
  const seenBundles = new Set<string>();
  for (const spec of block.pagespecs) {
    if (seenBundles.has(spec.bundle)) {
      errors.push({
        message: `Duplicate pagespec entry for bundle "${spec.bundle}"`,
        pageTitle,
        bundle: spec.bundle,
      });
    }
    seenBundles.add(spec.bundle);
  }

  // Check that all required bundles are covered
  const coveredBundles = new Set(block.pagespecs.map((s) => s.bundle));
  for (const requiredBundle of requiredBundles) {
    if (!coveredBundles.has(requiredBundle)) {
      errors.push({
        message: `Missing pagespec for required bundle "${requiredBundle}"`,
        pageTitle,
        bundle: requiredBundle,
      });
    }
  }

  return errors;
}

/**
 * Validates that a pagespecs block is well-formed (parseable and has required structure).
 *
 * @param block - The pagespecs block to validate
 * @param pageTitle - Title of the page containing this block (for error messages)
 * @returns Array of validation errors (empty if valid)
 */
export function validatePagespecsBlockStructure(
  block: unknown,
  pageTitle: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!block || typeof block !== 'object') {
    errors.push({
      message: 'Pagespecs block must be an object',
      pageTitle,
    });
    return errors;
  }

  const blockObj = block as Record<string, unknown>;

  if (!Array.isArray(blockObj.pagespecs)) {
    errors.push({
      message: 'Pagespecs block must have a "pagespecs" array',
      pageTitle,
    });
    return errors;
  }

  for (let i = 0; i < blockObj.pagespecs.length; i++) {
    const entry = blockObj.pagespecs[i] as Record<string, unknown>;

    if (!entry || typeof entry !== 'object') {
      errors.push({
        message: `Pagespec entry ${i} must be an object`,
        pageTitle,
      });
      continue;
    }

    if (typeof entry.bundle !== 'string') {
      errors.push({
        message: `Pagespec entry ${i} must have a "bundle" string`,
        pageTitle,
      });
    }

    if (!entry.curation || typeof entry.curation !== 'object') {
      errors.push({
        message: `Pagespec entry ${i} must have a "curation" object`,
        pageTitle,
      });
    }

    if (!entry.generation || typeof entry.generation !== 'object') {
      errors.push({
        message: `Pagespec entry ${i} must have a "generation" object`,
        pageTitle,
      });
    }

    // Validate that no unknown keys are present
    const allowedKeys = new Set(['bundle', 'curation', 'generation']);
    for (const key of Object.keys(entry)) {
      if (!allowedKeys.has(key)) {
        errors.push({
          message: `Pagespec entry ${i} has unknown key "${key}"`,
          pageTitle,
        });
      }
    }

    if (entry.curation && typeof entry.curation === 'object') {
      const curation = entry.curation as Record<string, unknown>;

      if (typeof curation.isTracked !== 'boolean') {
        errors.push({
          message: `Pagespec entry ${i}.curation must have an "isTracked" boolean`,
          pageTitle,
        });
      }

      if (typeof curation.isInWorkingGraph !== 'boolean') {
        errors.push({
          message: `Pagespec entry ${i}.curation must have an "isInWorkingGraph" boolean`,
          pageTitle,
        });
      }

      const allowedCurationKeys = new Set([
        'isTracked',
        'isInWorkingGraph',
        'filtersSelected',
        'links',
        'frontierDepthOrNullForOrphan',
      ]);
      for (const key of Object.keys(curation)) {
        if (!allowedCurationKeys.has(key)) {
          errors.push({
            message: `Pagespec entry ${i}.curation has unknown key "${key}"`,
            pageTitle,
          });
        }
      }
    }

    if (entry.generation && typeof entry.generation === 'object') {
      const generation = entry.generation as Record<string, unknown>;
      const allowedGenerationKeys = new Set(['htmlRenderedLinks']);
      for (const key of Object.keys(generation)) {
        if (!allowedGenerationKeys.has(key)) {
          errors.push({
            message: `Pagespec entry ${i}.generation has unknown key "${key}"`,
            pageTitle,
          });
        }
      }
    }
  }

  return errors;
}
