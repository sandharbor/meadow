/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it, vi } from 'vitest';
import { proposalEditorOperations } from '../../../../src/areas/bundle/sourcing/components/proposalClient.js';
import type { SourceProposalReview } from '../../../../../../contracts/types/areas/bundle/sourcing/sourcingProposal.js';
import type { ProposalConfiguration } from '../../../../../../contracts/types/shared/sourcing/sourcingProposal.js';
import type { FileBundleNodeConfig } from '../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import type { IBundleNode } from '../../../../../../contracts/types/shared/bundle-graph/IBundleNode.js';
import { Graph } from '../../../../../../contracts/types/shared/bundle-graph/graph.js';

describe('departing page configuration protection', () => {
  it.each(['blacklist', 'whitelist'] as const)('retains saved path and traversal while allowing an explicit %s choice', async listType => {
    const original: FileBundleNodeConfig = { bundleNodeId: '100000000007' as FileBundleNodeConfig['bundleNodeId'], bundleNodeName: 'Leaf', bundleNodeKind: 'file', fileType: 'md', sourceGraphSubdirectory: 'Old', listType: 'whitelist', outlinksDepth: 3 };
    const configuration = { nodes: [original], bundle: {}, globalFilters: [], bundleFilters: [], deletedDefaultFilterIds: [] } as ProposalConfiguration;
    const current = { configuration, proposal: { proposed: configuration } } as SourceProposalReview;
    const graph = new Graph();
    vi.spyOn(graph, 'getAllNodes').mockReturnValue([{ bundleNodeId: original.bundleNodeId, sourceReview: { kind: 'departing' } } as IBundleNode]);
    const configure = vi.fn(async (_configuration: ProposalConfiguration) => {});
    const operations = proposalEditorOperations({ bundleSlug: 'test', current: () => current, graph: () => graph, configure, mutate: vi.fn(), report: vi.fn() });
    await operations.request('bundle-config', { method: 'POST', body: JSON.stringify({ configs: [{ ...original, listType, sourceGraphSubdirectory: 'Accidental display path', outlinksDepth: 0 }] }) });
    expect(configure).toHaveBeenCalledExactlyOnceWith({ ...configuration, nodes: [{ ...original, listType }] });
    expect(original.listType).toBe('whitelist');
  });
});
