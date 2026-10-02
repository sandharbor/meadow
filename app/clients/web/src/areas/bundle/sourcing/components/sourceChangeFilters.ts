/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourcingTypeGraphFilter } from '../../shared-sourcing-curation/exported.js';
import type { IBundleNode } from '../../../../../../../contracts/types/IBundleNode.js';

export function sourceChangeFilters(): SourcingTypeGraphFilter[] {
  const definitions: Array<{ id: string; name: string; select: (node: IBundleNode) => boolean; color?: string; fade?: boolean; description: string; parent?: string }> = [
    { id: 'added', name: 'Added', color: '#16a34a', select: node => node.sourceReview?.kind === 'added', description: 'Newly admitted material, whether tracked or untracked.' },
    { id: 'moved', name: 'Renamed', color: '#9333ea', select: node => node.sourceReview?.kind === 'moved', description: 'A renamed or moved page with explicitly confirmed correspondence between its old and new identity.' },
    { id: 'modified', name: 'Modified', color: '#2563eb', select: node => node.sourceReview?.kind === 'modified', description: 'Captured content differs from accepted material.' },
    { id: 'departing', name: 'Removed', color: '#dc2626', select: node => node.sourceReview?.kind === 'departing', description: 'Material no longer included in the proposed capture because its source is missing, it is not reachable, or its source was disconnected. Unreachable saved page configuration is removed at acceptance.' },
    { id: 'missing', parent: 'departing', name: 'Source missing', select: node => node.sourceReview?.removalReason === 'source-missing', description: 'Missing on disk when the proposed capture was made.' },
    { id: 'unreachable', parent: 'departing', name: 'Not reachable', select: node => node.sourceReview?.removalReason === 'unreachable', description: 'Excluded by the proposed traversal, links, or blacklist boundaries.' },
    { id: 'disconnected', parent: 'departing', name: 'Disconnected', select: node => node.sourceReview?.removalReason === 'source-disconnected', description: 'Its source was removed from the proposed registry.' },
    { id: 'unchanged', name: 'Unchanged', fade: true, select: node => node.sourceReview?.kind === 'unchanged', description: 'Captured material is unchanged. Fade remains configured when Solo temporarily brings matching context forward.' },
  ];
  return definitions.map(item => ({ id: `source-${item.id}`, name: item.name, description: item.description, group: 'source-changes', ...(item.parent && { parentFilterId: `source-${item.parent}` }),
    bundleNodeSelectors: [{ id: `source-${item.id}`, name: item.name, type: 'normal', select: graph => new Set(graph.getAllNodes().filter(item.select).map(node => node.bundleNodeKey)) }],
    selectorApplicationCriteria: 'union', enabled: true, isSolo: false, isHidden: false,
    actions: item.fade ? [{ type: 'fade' }] : item.color ? [{ type: 'highlight', color: item.color, isDashed: item.id === 'departing' }] : [],
  }));
}

import type { ParticipatesIn, sourceReviewFiltering } from '../../../../../../../concepts/index.js';
export type SourceChangeFiltersMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewFiltering, 'define-change-filters', typeof sourceChangeFilters>,
];
