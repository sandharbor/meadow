/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourcingTypeGraphFilter } from '../../shared-sourcing-curation/exported.js';
import { sourceReviewAppearance, sourceRemovalReasons, sourceModificationKinds } from '../../../../shared/utils/sourceReviewAppearance.js';
import type { IBundleNode } from '../../../../../../../contracts/types/IBundleNode.js';

export function sourceChangeFilters(): SourcingTypeGraphFilter[] {
  const definitions: Array<{ id: string; name: string; select: (node: IBundleNode) => boolean; color?: string; fade?: boolean; description: string; parent?: string }> = [
    { id: 'added', name: sourceReviewAppearance.added.label, color: sourceReviewAppearance.added.color, select: node => node.sourceReview?.kind === 'added', description: 'Accepting admits new material, whether tracked or untracked.' },
    { id: 'moved', name: sourceReviewAppearance.moved.label, color: sourceReviewAppearance.moved.color, select: node => node.sourceReview?.kind === 'moved', description: 'Accepting renames or moves a page whose correspondence between its old and new identity was explicitly confirmed.' },
    { id: 'modified', name: sourceReviewAppearance.modified.label, color: sourceReviewAppearance.modified.color, select: node => node.sourceReview?.kind === 'modified', description: 'Accepting updates a page whose captured content or saved settings differ from what was accepted.' },
    { id: 'modified-source', parent: 'modified', name: sourceModificationKinds.source.label, select: node => node.sourceReview?.kind === 'modified' && Boolean(node.sourceReview.modification?.source), description: sourceModificationKinds.source.description },
    { id: 'modified-config', parent: 'modified', name: sourceModificationKinds.config.label, select: node => node.sourceReview?.kind === 'modified' && Boolean(node.sourceReview.modification?.settings.length), description: sourceModificationKinds.config.description },
    { id: 'departing', name: sourceReviewAppearance.departing.label, color: sourceReviewAppearance.departing.color, select: node => node.sourceReview?.kind === 'departing', description: 'Accepting removes material that is no longer included in the proposed capture because its source is missing or disconnected, it is blacklisted, or an upstream change makes it unreachable. Unreachable saved page configuration is removed at acceptance.' },
    { id: 'missing', parent: 'departing', name: sourceRemovalReasons['source-missing'].label, select: node => node.sourceReview?.removalReason === 'source-missing', description: sourceRemovalReasons['source-missing'].description },
    { id: 'disconnected', parent: 'departing', name: sourceRemovalReasons['source-disconnected'].label, select: node => node.sourceReview?.removalReason === 'source-disconnected', description: sourceRemovalReasons['source-disconnected'].description },
    { id: 'blacklisted', parent: 'departing', name: sourceRemovalReasons['blacklisted'].label, select: node => node.sourceReview?.removalReason === 'blacklisted', description: sourceRemovalReasons['blacklisted'].description },
    { id: 'unreachable', parent: 'departing', name: sourceRemovalReasons['unreachable'].label, select: node => node.sourceReview?.removalReason === 'unreachable', description: sourceRemovalReasons['unreachable'].description },
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
