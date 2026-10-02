/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type {
  ProposalConfiguration, ProposalConfigurationConflict, ProposalConflictResolution, ProposalValue,
} from '../../contracts/types/sourcingProposal.js';

/** Compare data rather than JSON property insertion order. Missing is distinct from null. */
export function sameProposalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameProposalValue(value, right[index]));
  if (!isObject(left) || !isObject(right)) return false;
  const keys = Object.keys(left).filter(key => left[key] !== undefined);
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length
    && keys.every(key => sameProposalValue(left[key], right[key]));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Merge a saved configuration at review time and again at the acceptance boundary. */
export function mergeProposalConfiguration(
  original: ProposalConfiguration, saved: ProposalConfiguration, proposed: ProposalConfiguration,
  resolutions: readonly ProposalConflictResolution[] = [],
): { configuration: ProposalConfiguration; conflicts: ProposalConfigurationConflict[] } {
  const conflicts: ProposalConfigurationConflict[] = [];
  function conflict(path: string[], before: unknown, current: unknown, draft: unknown): unknown {
    const alternatives: ProposalConfigurationConflict = {
      path,
      ...(before !== undefined && { original: before as ProposalValue }),
      ...(current !== undefined && { saved: current as ProposalValue }),
      ...(draft !== undefined && { proposed: draft as ProposalValue }),
    };
    const resolution = resolutions.find(item => sameProposalValue(item.path, path)
      && sameProposalValue(item.original, before) && sameProposalValue(item.saved, current)
      && sameProposalValue(item.proposed, draft));
    if (resolution) return resolution.choice === 'saved' ? current : draft;
    conflicts.push(alternatives);
    // Preview the draft while displaying the conflict; callers must block acceptance.
    return draft;
  }
  function merge(path: string[], before: unknown, current: unknown, draft: unknown): unknown {
    if (sameProposalValue(before, draft) || sameProposalValue(current, draft)) return current;
    if (sameProposalValue(before, current)) return draft;
    if (path.at(-1) === 'updatedAt' && typeof current === 'string' && typeof draft === 'string') return current > draft ? current : draft;
    if (Array.isArray(before) && Array.isArray(current) && Array.isArray(draft)) {
      const field = path.at(-1);
      const identity = field === 'nodes' ? 'bundleNodeId'
        : ['filters', 'sources'].includes(field ?? '') ? 'id' : undefined;
      if (identity) {
        const index = (items: unknown[]) => new Map(items.map(item => {
          if (!isObject(item) || typeof item[identity] !== 'string') throw new Error(`Invalid ${field} identity`);
          return [item[identity] as string, item] as const;
        }));
        const a = index(before), b = index(current), c = index(draft);
        if (a.size !== before.length || b.size !== current.length || c.size !== draft.length) throw new Error(`Duplicate ${field} identity`);
        return [...new Set([...b.keys(), ...c.keys(), ...a.keys()])]
          .map(id => merge([...path, id], a.get(id), b.get(id), c.get(id))).filter(value => value !== undefined);
      }
      if (['disabledGlobalFilters', 'deletedDefaultFilterIds', 'ignoredSourceNames'].includes(field ?? '')
        && [...before, ...current, ...draft].every(value => typeof value === 'string')) {
        return [...new Set([...current, ...draft])].filter(value => merge([...path, String(value)],
          before.includes(value), current.includes(value), draft.includes(value)));
      }
    }
    if (isObject(before) && isObject(current) && isObject(draft)) {
      // Excluding a node competes with changing how that same node is included.
      // This includes blacklist versus traversal edits even though their fields differ.
      if (path[0] === 'nodes' && path.length === 2
        && current.listType !== draft.listType
        && (before.listType !== current.listType || before.listType !== draft.listType)) {
        return conflict(path, before, current, draft);
      }
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(current), ...Object.keys(draft)])) {
        const value = merge([...path, key], before[key], current[key], draft[key]);
        if (value !== undefined) Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
      }
      return result;
    }
    return conflict(path, before, current, draft);
  }
  // One identity spans both filter documents, so moving scope cannot leave a second
  // definition behind or disguise a concurrent deletion as an independent addition.
  const normalize = ({ bundleFilters, globalFilters, ...configuration }: ProposalConfiguration) => ({
    ...configuration, filters: [...bundleFilters, ...globalFilters],
  });
  const { filters, ...configuration } = merge([], normalize(original), normalize(saved), normalize(proposed)) as ReturnType<typeof normalize>;
  return { configuration: globalThis.structuredClone({ ...configuration,
    bundleFilters: filters.filter(filter => filter.scope === 'bundle'),
    globalFilters: filters.filter(filter => filter.scope === 'global'),
  }), conflicts };
}

import type { ParticipatesIn, sourceReviewConfigurationMerge } from '../../concepts/index.js';
export type ProposalConfigurationMergeMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewConfigurationMerge, 'merge-configuration', typeof mergeProposalConfiguration>,
];
