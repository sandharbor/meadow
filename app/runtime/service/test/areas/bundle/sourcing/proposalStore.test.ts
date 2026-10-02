/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { beginSourceProposal, editSourceProposal, loadPendingSourceProposal, loadProposalConfiguration, proposalPath,
  sourceProposalConfigurationReview } from '../../../../src/areas/bundle/sourcing/services/proposalStore.js';
import { revalidateProposalTracking } from '../../../../../../shared_code/utils/proposalTracking.js';
import { saveGlobalCustomFilters } from '../../../../../../shared_code/utils/globalCustomFiltersUtils.js';

let home: string, directory: string, previousHome: string | undefined;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-proposal-'));
  previousHome = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
  directory = path.join(home, 'bundles/proposal-test');
  const id = 'a'.repeat(32);
  fs.mkdirSync(path.join(directory, 'config'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'raw/sourcing/snapshots', id), { recursive: true });
  fs.writeFileSync(path.join(directory, 'config/bundle_config.yaml'), YAML.stringify({ sourceDirectory: path.join(home, 'sources'),
    entryBundleNodeId: 'start0000001', defaultTraversalBundleNodeId: 'start0000001', defaultOutlinksDepth: 2 }));
  fs.writeFileSync(path.join(directory, 'config/bundle_node_config.yaml'), YAML.stringify({ nodes: [{ bundleNodeId: 'start0000001',
    bundleNodeName: 'Start', bundleNodeKind: 'file', fileType: 'md', listType: 'whitelist' }] }));
  fs.writeFileSync(path.join(directory, 'raw/sourcing/state.json'), JSON.stringify({ version: 1, storage: 'git', acceptedId: id, history: [] }));
  fs.writeFileSync(path.join(directory, 'raw/sourcing/snapshots', id, 'snapshot.json'), JSON.stringify({ id, capturedAt: '2026-10-01', files: {}, directories: [], fileCount: 0, digest: '' }));
});
afterEach(() => {
  if (previousHome === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = previousHome;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('durable source proposals', () => {
  it('restores node, bundle, filter, identity, and tracking drafts without editing saved policy', async () => {
    const saved = loadProposalConfiguration(directory);
    const first = await beginSourceProposal(directory);
    const edited = await editSourceProposal(directory, first.revision, proposal => {
      proposal.proposed.bundle.defaultOutlinksDepth = 4;
      proposal.proposed.nodes[0].outlinksDepth = 3;
      proposal.identities.start0000001 = 'Renamed.md';
      proposal.tracking['New.md'] = { track: true, origin: 'explicit' };
      proposal.proposed.globalFilters = [{ id: 'private', name: 'Private', scope: 'global', enabled: true,
        selectors: [{ field: 'title', matchType: 'substring', value: 'Private' }], selectorApplicationCriteria: 'union',
        actions: [{ type: 'mark_sensitive' }], createdAt: '2026-10-01', updatedAt: '2026-10-01' }];
      return proposal;
    });
    expect(loadPendingSourceProposal(directory)).toEqual(edited);
    expect(await beginSourceProposal(directory)).toEqual(edited);
    expect(loadProposalConfiguration(directory)).toEqual(saved);
    // An accepted edit after Later is incorporated without rewriting the draft's base.
    saveGlobalCustomFilters(home, { filters: [{ ...edited.proposed.globalFilters[0], id: 'unrelated' }], version: '1.0.0' });
    const review = sourceProposalConfigurationReview(directory);
    expect(review.conflicts).toEqual([]);
    expect(review.configuration.globalFilters.map(filter => filter.id)).toEqual(['unrelated', 'private']);
    expect(loadPendingSourceProposal(directory)?.original).toEqual(saved);
  });

  it('rejects stale edits and leaves the most recent draft recoverable', async () => {
    const first = await beginSourceProposal(directory);
    const edited = await editSourceProposal(directory, first.revision, proposal => {
      proposal.proposed.bundle.defaultOutlinksDepth = 5;
      return proposal;
    });
    await expect(editSourceProposal(directory, first.revision, proposal => proposal)).rejects.toThrow('changed');
    expect(loadPendingSourceProposal(directory)).toEqual(edited);
  });

  it('does not replace a valid draft when validation or an edit fails', async () => {
    const first = await beginSourceProposal(directory);
    await expect(editSourceProposal(directory, first.revision, proposal => {
      proposal.proposed.nodes[0].outlinksDepth = -1;
      return proposal;
    })).rejects.toThrow('non-negative');
    await expect(editSourceProposal(directory, first.revision, () => { throw new Error('Capture failed'); })).rejects.toThrow('Capture failed');
    expect(loadPendingSourceProposal(directory)).toEqual(first);
  });

  it('fails closed on unsupported proposal schemas without rewriting them', async () => {
    await beginSourceProposal(directory);
    const filename = proposalPath(directory);
    const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
    value.version = 99;
    const contents = JSON.stringify(value);
    fs.writeFileSync(filename, contents);
    await expect(beginSourceProposal(directory)).rejects.toThrow('Invalid pending source proposal');
    expect(fs.readFileSync(filename, 'utf8')).toBe(contents);
  });
});

describe('tracking revalidation', () => {
  it('removes sensitive automatic choices but requires renewed consent for explicit ones', () => {
    const automatic = { track: true, origin: 'automatic' as const };
    const explicit = { track: true, origin: 'explicit' as const };
    const result = revalidateProposalTracking({ auto: automatic, explicit, confirmed: { ...explicit, confirmedSensitivity: 'source:a' } }, {
      auto: { sensitivity: 'source:a' }, explicit: { sensitivity: 'source:a' }, confirmed: { sensitivity: 'source:a' },
    });
    expect(result.auto).toEqual({ ...automatic, track: false });
    expect(result.explicit).toEqual({ ...explicit, needsConfirmation: true });
    expect(result.confirmed.needsConfirmation).toBeUndefined();
    expect(automatic.track).toBe(true);
    expect(revalidateProposalTracking(result, { ...{ auto: {}, explicit: {} }, confirmed: { sensitivity: 'filter:b' } }).confirmed.needsConfirmation).toBe(true);
  });

  it('surfaces missing targets, preserves opt-outs, and clears obsolete confirmations', () => {
    const result = revalidateProposalTracking({ missing: { track: true, origin: 'explicit' },
      optedOut: { track: false, origin: 'explicit' }, safe: { track: true, origin: 'explicit', needsConfirmation: true } }, {
      optedOut: { sensitivity: 'source:a' }, safe: {},
    });
    expect(result.missing.invalidated).toContain('no longer included');
    expect(result.optedOut).toEqual({ track: false, origin: 'explicit' });
    expect(result.safe).toEqual({ track: true, origin: 'explicit' });
  });
});
