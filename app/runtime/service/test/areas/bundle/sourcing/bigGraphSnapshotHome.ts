/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { afterEach, beforeEach, expect } from 'vitest';
import { materializeSourceGraph, applySourceChange } from '../../../../../../shared_code/shared_dev/sourceChanges.js';
import { acceptSourceSnapshot, scanSourceChanges } from '../../../../src/areas/bundle/sourcing/services/sourceReview.js';

export const projectRoot = fileURLToPath(new URL('../../../../../../../', import.meta.url));
export const sourceGraph = 'meadow-test-bundles-data';
export const oldName = 't003 ---- page with section to link to.md';
export const newName = 't003 ---- renamed section page.md';

export interface BigGraphSnapshotHome { temporary: string; bundle: string; source: string }

/**
 * Give every test a fresh temporary home holding the big test bundle over its
 * own copy of the shared source graph. Each test file keeps its own variables,
 * which `assign` sets before every test.
 */
export function useBigGraphSnapshotHome(assign: (home: BigGraphSnapshotHome) => void): void {
  let temporary: string;
  let priorHome: string | undefined;
  beforeEach(() => {
    temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-sourcing-test-')));
    priorHome = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = temporary;
    const source = materializeSourceGraph({ projectRoot, sourceGraphsDir: path.join(temporary, 'source_graphs'), sourceGraph });
    const bundle = path.join(temporary, 'bundles/meadow-test-bundle-big');
    fs.cpSync(path.join(projectRoot, 'app/shared_data/home_fixtures/home_fixture_big_and_small/bundles/meadow-test-bundle-big'), bundle, { recursive: true });
    const filename = path.join(bundle, 'config/bundle_config.yaml');
    const config = YAML.parse(fs.readFileSync(filename, 'utf8'));
    config.sourceDirectory = source;
    fs.writeFileSync(filename, YAML.stringify(config));
    assign({ temporary, bundle, source });
  });
  afterEach(({ task }) => {
    if (priorHome === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
    else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = priorHome;
    // Preserve the actual Git objects when a snapshot fails; deleting the home
    // would make intermittent capture/materialization errors impossible to inspect.
    if (task.result?.state === 'fail') console.error(`Failed source-snapshot test home retained at ${temporary}`);
    else fs.rmSync(temporary, { recursive: true, force: true });
  });
}

/** Apply a named source change to the test's copy of the shared source graph. */
export function changeSource(source: string, changeId: string) { return applySourceChange({ projectRoot, sourceGraphsDir: path.dirname(source), sourceGraph, changeId }); }

/** Accept the current review, keeping every proposed move. */
export async function acceptAllMoves(bundle: string) {
  const review = await scanSourceChanges(bundle);
  expect(review.candidate).toBeDefined();
  return await acceptSourceSnapshot(bundle, { candidateId: review.candidate!.id, reviewToken: review.reviewToken,
    resolutions: Object.fromEntries(review.moves.map(move => [move.bundleNodeId, move.newPath])) });
}
