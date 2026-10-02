/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';
import type { BundleNodeId } from '../../../../../../contracts/types/bundleNodeConfig.js';
import type { ProposalConfiguration } from '../../../../../../contracts/types/sourcingProposal.js';
import type { CustomFilterConfig } from '../../../../../../contracts/types/customFilters.js';
import { mergeProposalConfiguration } from '../../../../../../shared_code/utils/proposalConfigurationMerge.js';

const nodeId = 'aaaaaaaaaaaa' as BundleNodeId;
function filter(id = 'filter'): CustomFilterConfig {
  return { id, name: 'Private', scope: 'global', selectors: [{ field: 'title', matchType: 'substring', value: 'Private' }],
    selectorApplicationCriteria: 'union', actions: [{ type: 'mark_sensitive' }], enabled: true, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
}
function configuration(): ProposalConfiguration {
  return { bundle: { defaultOutlinksDepth: 2, disabledGlobalFilters: [] },
    nodes: [{ bundleNodeId: nodeId, bundleNodeName: 'Page', bundleNodeKind: 'file', fileType: 'md', listType: 'whitelist', outlinksDepth: 2 }],
    bundleFilters: [], globalFilters: [filter()], deletedDefaultFilterIds: [] };
}

describe('proposal configuration merge', () => {
  it('preserves independent fields of the same node, bundle, and shared filter', () => {
    const original = configuration(), saved = configuration(), proposed = configuration();
    saved.bundle.bundleNotes = 'Later curation';
    saved.nodes[0].bundleNodeName = 'Renamed';
    saved.globalFilters[0].name = 'Restricted';
    saved.globalFilters[0].updatedAt = '2026-10-03';
    proposed.bundle.defaultOutlinksDepth = 4;
    proposed.nodes[0].inlinksDepth = 1;
    proposed.globalFilters[0].enabled = false;
    proposed.globalFilters[0].updatedAt = '2026-10-02';
    const result = mergeProposalConfiguration(original, saved, proposed);
    expect(result.conflicts).toEqual([]);
    expect(result.configuration.bundle).toMatchObject({ defaultOutlinksDepth: 4, bundleNotes: 'Later curation' });
    expect(result.configuration.nodes[0]).toMatchObject({ bundleNodeName: 'Renamed', inlinksDepth: 1 });
    expect(result.configuration.globalFilters[0]).toMatchObject({ name: 'Restricted', enabled: false, updatedAt: '2026-10-03' });
    expect(original).toEqual(configuration());
  });

  it('treats equal results as compatible and rebases unedited configuration', () => {
    const original = configuration(), saved = configuration(), proposed = configuration();
    saved.bundle.defaultOutlinksDepth = proposed.bundle.defaultOutlinksDepth = 4;
    saved.nodes = [];
    expect(mergeProposalConfiguration(original, saved, proposed)).toEqual({
      conflicts: [], configuration: { ...saved },
    });
  });

  it('requires a new choice when saved state changes after conflict resolution', () => {
    const original = configuration(), saved = configuration(), proposed = configuration();
    saved.bundle.defaultOutlinksDepth = 3;
    proposed.bundle.defaultOutlinksDepth = 4;
    const first = mergeProposalConfiguration(original, saved, proposed);
    expect(first.conflicts).toEqual([{ path: ['bundle', 'defaultOutlinksDepth'], original: 2, saved: 3, proposed: 4 }]);
    const choices = first.conflicts.map(conflict => ({ ...conflict, choice: 'proposed' as const }));
    expect(mergeProposalConfiguration(original, saved, proposed, choices).conflicts).toEqual([]);
    saved.bundle.defaultOutlinksDepth = 5;
    expect(mergeProposalConfiguration(original, saved, proposed, choices).conflicts).toHaveLength(1);
  });

  it('detects untracking versus blacklisting and preserves unrelated accepted tracking', () => {
    const original = configuration(), saved = configuration(), proposed = configuration();
    proposed.nodes = [];
    saved.nodes[0].listType = 'blacklist';
    saved.nodes.push({ ...configuration().nodes[0], bundleNodeId: 'bbbbbbbbbbbb' as BundleNodeId, bundleNodeName: 'Unrelated' });
    const first = mergeProposalConfiguration(original, saved, proposed);
    expect(first.conflicts).toHaveLength(1);
    expect(first.conflicts[0].path).toEqual(['nodes', nodeId]);
    const result = mergeProposalConfiguration(original, saved, proposed, [{ ...first.conflicts[0], choice: 'saved' }]);
    expect(result.conflicts).toEqual([]);
    expect(result.configuration.nodes).toEqual(saved.nodes);
  });

  it('detects semantic blacklist versus traversal conflicts on different fields', () => {
    const original = configuration(), saved = configuration(), proposed = configuration();
    saved.nodes[0].listType = 'blacklist';
    proposed.nodes[0].outlinksDepth = 5;
    expect(mergeProposalConfiguration(original, saved, proposed).conflicts[0].path).toEqual(['nodes', nodeId]);
  });

  it('merges independent shared filters and filter enablement without replacing the document', () => {
    const original = configuration(), saved = configuration(), proposed = configuration();
    saved.globalFilters.push(filter('unrelated'));
    proposed.globalFilters[0].enabled = false;
    saved.bundle.disabledGlobalFilters = ['one'];
    proposed.bundle.disabledGlobalFilters = ['two'];
    const result = mergeProposalConfiguration(original, saved, proposed);
    expect(result.conflicts).toEqual([]);
    expect(result.configuration.globalFilters).toEqual([{ ...filter(), enabled: false }, filter('unrelated')]);
    expect(result.configuration.bundle.disabledGlobalFilters).toEqual(['one', 'two']);
  });

  it('keeps scope moves and concurrent edits under one filter identity', () => {
    const original = configuration(), saved = configuration(), proposed = configuration();
    saved.globalFilters[0].name = 'Later name';
    proposed.globalFilters = [];
    proposed.bundleFilters = [{ ...filter(), scope: 'bundle' }];
    const result = mergeProposalConfiguration(original, saved, proposed);
    expect(result.conflicts).toEqual([]);
    expect(result.configuration.globalFilters).toEqual([]);
    expect(result.configuration.bundleFilters).toEqual([{ ...filter(), scope: 'bundle', name: 'Later name' }]);
    saved.globalFilters = [];
    expect(mergeProposalConfiguration(original, saved, proposed).conflicts[0].path).toEqual(['filters', 'filter']);
  });

  it('does not mutate original, saved, or proposed documents through its result', () => {
    const original = configuration(), saved = configuration(), proposed = configuration();
    const result = mergeProposalConfiguration(original, saved, proposed);
    result.configuration.nodes[0].bundleNodeName = 'Edited preview';
    result.configuration.globalFilters[0].enabled = false;
    for (const input of [original, saved, proposed]) expect(input).toEqual(configuration());
  });
});
