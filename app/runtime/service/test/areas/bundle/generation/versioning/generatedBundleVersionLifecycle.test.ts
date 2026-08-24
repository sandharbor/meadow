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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedBundleVersionId } from '../../../../../../../shared_code/types/generatedBundleVersioning.js';
import {
  SimulatedVersionOperationCrash,
  cancelCurrentGeneratedBundleVersion,
  createNewGeneratedBundleVersion,
  deleteLocalGeneratedBundleVersionFiles,
  generateCurrentBundleVersion,
  recoverGeneratedBundleVersionOperations,
  restoreFrozenGeneratedBundleVersion,
  updateGeneratedBundleVersionNotes,
} from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import {
  generatedBundleVersionManifestPath,
  generatedBundleVersionsRoot,
  loadGeneratedBundleVersionManifest,
  saveGeneratedBundleVersionManifest,
} from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { inspectGeneratedVersionGitState } from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionGitService.js';

const CREATED_1 = new Date('2026-08-16T12:00:00.000Z');
const CREATED_2 = new Date('2026-08-18T09:30:00.000Z');
const FIRST_RANDOM_BYTES = Buffer.from([0, 1, 2, 3, 4, 5]);
const SECOND_RANDOM_BYTES = Buffer.from([6, 7, 8, 9, 10, 11]);

describe('generated bundle version lifecycle', () => {
  let homeDirectory: string;
  let bundleDirectory: string;

  const git = (...args: string[]): string => execFileSync('git', args, {
    cwd: homeDirectory,
    encoding: 'utf8',
  }).trim();

  const commitAll = (message: string): void => {
    git('add', '-A');
    git('commit', '-m', message);
  };

  const generate = (content: string) => async (directory: string): Promise<void> => {
    fs.mkdirSync(path.join(directory, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), `${content}\n`);
    fs.writeFileSync(path.join(directory, 'nested', 'page.html'), `<p>${content}</p>\n`);
  };

  const firstGeneration = async () => generateCurrentBundleVersion(bundleDirectory, {
    generate: generate('<h1>First</h1>'),
    now: () => CREATED_1,
    operationId: () => 'first-operation',
    randomBytes: () => FIRST_RANDOM_BYTES,
  });

  const firstSavedGeneration = async () => {
    const result = await firstGeneration();
    commitAll('save first generated version');
    return result;
  };

  beforeEach(() => {
    homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-version-lifecycle-'));
    git('init', '-b', 'main');
    git('config', 'user.name', 'Meadow Test');
    git('config', 'user.email', 'meadow-test@example.invalid');
    bundleDirectory = path.join(homeDirectory, 'bundles', 'example');
    fs.mkdirSync(path.join(bundleDirectory, 'config'), { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), 'bundleGuid: abc1234\n');
    commitAll('create bundle');
  });

  afterEach(() => {
    fs.rmSync(homeDirectory, { recursive: true, force: true });
  });

  it('V03 L01 first successful generation creates exactly one unsaved version with its stable operation ID and no unversioned artifact', async () => {
    const result = await firstGeneration();
    expect(result.operationId).toBe('first-operation');
    expect(result.created).toBe(true);
    expect(result.versionId).toMatch(/^v[A-Za-z0-9]{6}$/);
    expect(result.manifest.versions).toHaveLength(1);
    expect(result.manifest.versions[0]).toMatchObject({
      versionId: result.versionId,
      createdAt: CREATED_1.toISOString(),
      predecessorVersionId: null,
      readerConnectionToPredecessor: 'disconnected',
      localFilesState: 'present',
    });
    expect(fs.readFileSync(path.join(result.directory, 'index.html'), 'utf8')).toBe('<h1>First</h1>\n');
    expect(fs.existsSync(path.join(bundleDirectory, 'html', 'generated'))).toBe(false);
    expect(inspectGeneratedVersionGitState(bundleDirectory, result.versionId).savedGenerationId).toBeNull();
  });

  it('V04 failed first generation leaves no manifest and no real version directory', async () => {
    await expect(generateCurrentBundleVersion(bundleDirectory, {
      generate: async (directory) => {
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, 'partial.html'), 'partial');
        throw new Error('injected generation failure');
      },
      operationId: () => 'failed-first',
      randomBytes: () => FIRST_RANDOM_BYTES,
    })).rejects.toThrow('injected generation failure');
    expect(fs.existsSync(generatedBundleVersionManifestPath(bundleDirectory))).toBe(false);
    expect(fs.readdirSync(generatedBundleVersionsRoot(bundleDirectory))).toEqual([]);
  });

  it('regenerates the same current version without appending another card', async () => {
    const first = await firstSavedGeneration();
    const regenerated = await generateCurrentBundleVersion(bundleDirectory, {
      generate: generate('<h1>Regenerated</h1>'),
      operationId: () => 'regenerate',
    });
    expect(regenerated.versionId).toBe(first.versionId);
    expect(regenerated.created).toBe(false);
    expect(regenerated.manifest.versions).toHaveLength(1);
    expect(fs.readFileSync(path.join(regenerated.directory, 'index.html'), 'utf8')).toBe('<h1>Regenerated</h1>\n');
    expect(inspectGeneratedVersionGitState(bundleDirectory, regenerated.versionId).isSaved).toBe(false);
  });

  it('V06 L01 freezes the saved predecessor and installs pending source state under one stable operation ID', async () => {
    const first = await firstSavedGeneration();
    fs.writeFileSync(path.join(first.directory, 'index.html'), '<h1>Unsaved working output</h1>\n');

    const second = await createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('<h1>Second from current source</h1>'),
      notes: 'Before restructuring',
      now: () => CREATED_2,
      operationId: () => 'create-second',
      randomBytes: () => SECOND_RANDOM_BYTES,
    });

    expect(second.operationId).toBe('create-second');
    expect(second.manifest.versions).toHaveLength(2);
    expect(second.manifest.versions[1]).toMatchObject({
      versionId: second.versionId,
      predecessorVersionId: first.versionId,
      readerConnectionToPredecessor: 'connected',
      notes: 'Before restructuring',
    });
    expect(fs.readFileSync(path.join(first.directory, 'index.html'), 'utf8')).toBe('<h1>First</h1>\n');
    expect(inspectGeneratedVersionGitState(bundleDirectory, first.versionId).isSaved).toBe(true);
    const secondState = inspectGeneratedVersionGitState(bundleDirectory, second.versionId);
    expect(secondState.savedGenerationId).toBeNull();
    expect(secondState.changes.every((change) => change.status === '??')).toBe(true);
  });

  it('V07 requires explicit confirmation for a no-change version creation', async () => {
    await firstSavedGeneration();
    await expect(createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('<h1>Second</h1>'),
      randomBytes: () => SECOND_RANDOM_BYTES,
    })).rejects.toThrow(/requires confirmation/);
    const confirmed = await createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('<h1>Second</h1>'),
      confirmedNoGeneratedChanges: true,
      randomBytes: () => SECOND_RANDOM_BYTES,
    });
    expect(confirmed.manifest.versions).toHaveLength(2);
  });

  it('V08 cancels a never-saved current version and leaves its predecessor byte-stable', async () => {
    const first = await firstSavedGeneration();
    const second = await createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('<h1>Second</h1>'),
      confirmedNoGeneratedChanges: true,
      randomBytes: () => SECOND_RANDOM_BYTES,
    });
    const canceled = cancelCurrentGeneratedBundleVersion(bundleDirectory);
    expect(canceled.versions.map((entry) => entry.versionId)).toEqual([first.versionId]);
    expect(fs.existsSync(second.directory)).toBe(false);
    expect(fs.readFileSync(path.join(first.directory, 'index.html'), 'utf8')).toBe('<h1>First</h1>\n');
  });

  it('V09 edits local notes without changing generated saved state', async () => {
    const first = await firstSavedGeneration();
    const savedGenerationId = inspectGeneratedVersionGitState(bundleDirectory, first.versionId).savedGenerationId;
    const updated = updateGeneratedBundleVersionNotes(bundleDirectory, first.versionId, 'Local editorial note');
    expect(updated.versions[0].notes).toBe('Local editorial note');
    expect(inspectGeneratedVersionGitState(bundleDirectory, first.versionId).savedGenerationId).toBe(savedGenerationId);
    expect(inspectGeneratedVersionGitState(bundleDirectory, first.versionId).changes).toEqual([]);
  });

  it('V10 restores frozen integrity and tombstones frozen local files without pruning history', async () => {
    const first = await firstSavedGeneration();
    await createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('<h1>Second</h1>'),
      confirmedNoGeneratedChanges: true,
      randomBytes: () => SECOND_RANDOM_BYTES,
    });
    fs.writeFileSync(path.join(first.directory, 'index.html'), '<h1>Illegitimate frozen edit</h1>\n');
    restoreFrozenGeneratedBundleVersion(bundleDirectory, first.versionId);
    expect(fs.readFileSync(path.join(first.directory, 'index.html'), 'utf8')).toBe('<h1>First</h1>\n');

    const deleted = await deleteLocalGeneratedBundleVersionFiles(bundleDirectory, first.versionId, {
      now: () => CREATED_2,
      operationId: () => 'delete-first',
    });
    expect(deleted.versions).toHaveLength(2);
    expect(deleted.versions[0]).toMatchObject({
      versionId: first.versionId,
      localFilesState: 'deleted',
      localFilesDeletedAt: CREATED_2.toISOString(),
      lastSavedGenerationId: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
    expect(fs.existsSync(first.directory)).toBe(false);
  });

  it('restores the exact manifest and working predecessor after every synchronous create-version boundary failure', async () => {
    const first = await firstSavedGeneration();
    const phases = ['staging', 'predecessor-backed-up', 'version-installed', 'manifest-committed'] as const;
    for (const phase of phases) {
      fs.writeFileSync(path.join(first.directory, 'index.html'), `<h1>Draft before ${phase}</h1>\n`);
      const manifestBefore = fs.readFileSync(generatedBundleVersionManifestPath(bundleDirectory), 'utf8');
      await expect(createNewGeneratedBundleVersion(bundleDirectory, {
        generate: generate(`<h1>Second ${phase}</h1>`),
        operationId: () => `failure-${phase}`,
        randomBytes: () => SECOND_RANDOM_BYTES,
        onPhase: (currentPhase) => {
          if (currentPhase === phase) throw new Error(`fail at ${phase}`);
        },
      })).rejects.toThrow(`fail at ${phase}`);
      expect(fs.readFileSync(generatedBundleVersionManifestPath(bundleDirectory), 'utf8')).toBe(manifestBefore);
      expect(fs.readFileSync(path.join(first.directory, 'index.html'), 'utf8')).toBe(`<h1>Draft before ${phase}</h1>\n`);
      expect(fs.readdirSync(generatedBundleVersionsRoot(bundleDirectory)).filter((name) => /^v/.test(name)))
        .toEqual([first.versionId]);
    }
  });

  it('recovers an interrupted uncommitted creation by restoring its rollback copy', async () => {
    const first = await firstSavedGeneration();
    fs.writeFileSync(path.join(first.directory, 'index.html'), '<h1>Draft before crash</h1>\n');
    await expect(createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('<h1>Interrupted second</h1>'),
      operationId: () => 'crash-before-commit',
      randomBytes: () => SECOND_RANDOM_BYTES,
      onPhase: (phase) => {
        if (phase === 'version-installed') throw new SimulatedVersionOperationCrash('simulated crash');
      },
    })).rejects.toThrow('simulated crash');

    const recovery = recoverGeneratedBundleVersionOperations(bundleDirectory);
    expect(recovery.recoveredOperation).toBe(true);
    expect(recovery.problems).toEqual([]);
    expect(loadGeneratedBundleVersionManifest(bundleDirectory).versions.map((entry) => entry.versionId))
      .toEqual([first.versionId]);
    expect(fs.readFileSync(path.join(first.directory, 'index.html'), 'utf8')).toBe('<h1>Draft before crash</h1>\n');
  });

  it('retains a manifest-committed version and cleans its journal after restart', async () => {
    await firstSavedGeneration();
    let secondId: GeneratedBundleVersionId | undefined;
    await expect(createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('<h1>Committed second</h1>'),
      confirmedNoGeneratedChanges: true,
      operationId: () => 'crash-after-commit',
      randomBytes: () => SECOND_RANDOM_BYTES,
      onPhase: (phase) => {
        if (phase === 'manifest-committed') {
          secondId = loadGeneratedBundleVersionManifest(bundleDirectory).versions.at(-1)?.versionId;
          throw new SimulatedVersionOperationCrash('crash after commit');
        }
      },
    })).rejects.toThrow('crash after commit');
    const recovery = recoverGeneratedBundleVersionOperations(bundleDirectory);
    expect(recovery.recoveredOperation).toBe(true);
    expect(recovery.problems).toEqual([]);
    expect(loadGeneratedBundleVersionManifest(bundleDirectory).versions.at(-1)?.versionId).toBe(secondId);
    expect(fs.existsSync(path.join(generatedBundleVersionsRoot(bundleDirectory), '.version-operation.json'))).toBe(false);
  });

  it('quarantines an ambiguous real directory that has no manifest entry', () => {
    const ambiguousId = 'vZz9999' as GeneratedBundleVersionId;
    const ambiguousDirectory = path.join(generatedBundleVersionsRoot(bundleDirectory), ambiguousId);
    fs.mkdirSync(ambiguousDirectory, { recursive: true });
    fs.writeFileSync(path.join(ambiguousDirectory, 'index.html'), 'ambiguous\n');
    const recovery = recoverGeneratedBundleVersionOperations(bundleDirectory);
    expect(recovery.problems).toHaveLength(1);
    expect(recovery.problems[0]).toMatchObject({ kind: 'quarantined-unreferenced-version', versionId: ambiguousId });
    expect(fs.existsSync(ambiguousDirectory)).toBe(false);
    expect(fs.readFileSync(path.join(recovery.problems[0].path, 'index.html'), 'utf8')).toBe('ambiguous\n');
  });

  it('reports a present manifest entry whose real directory is missing without deleting metadata', async () => {
    const first = await firstGeneration();
    fs.rmSync(first.directory, { recursive: true, force: true });
    const recovery = recoverGeneratedBundleVersionOperations(bundleDirectory);
    expect(recovery.problems).toEqual([{
      kind: 'missing-present-version-directory',
      versionId: first.versionId,
      path: first.directory,
    }]);
    expect(loadGeneratedBundleVersionManifest(bundleDirectory).versions).toHaveLength(1);
  });

  it('rejects a concurrent versioning operation without disturbing the active journal', async () => {
    let releaseGeneration!: () => void;
    const waitForRelease = new Promise<void>((resolve) => { releaseGeneration = resolve; });
    let generationStarted!: () => void;
    const started = new Promise<void>((resolve) => { generationStarted = resolve; });
    const active = generateCurrentBundleVersion(bundleDirectory, {
      generate: async (directory) => {
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, 'index.html'), 'active\n');
        generationStarted();
        await waitForRelease;
      },
      operationId: () => 'active-operation',
      randomBytes: () => FIRST_RANDOM_BYTES,
    });
    await started;
    await expect(generateCurrentBundleVersion(bundleDirectory, {
      generate: generate('competing'),
      randomBytes: () => SECOND_RANDOM_BYTES,
    })).rejects.toThrow(/conflicting bundle versioning operation/);
    releaseGeneration();
    await expect(active).resolves.toMatchObject({ created: true });
  });

  it('blocks a connected successor for migrated awareness-incomplete current output', async () => {
    const first = await firstSavedGeneration();
    const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
    manifest.versions[0] = { ...manifest.versions[0], readerAwarenessState: 'legacy-incomplete' };
    saveGeneratedBundleVersionManifest(bundleDirectory, manifest);
    await expect(createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('connected'),
      confirmedNoGeneratedChanges: true,
      readerConnectionToPredecessor: 'connected',
      randomBytes: () => SECOND_RANDOM_BYTES,
    })).rejects.toThrow(/Regenerate and save/);
    const disconnected = await createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generate('disconnected'),
      confirmedNoGeneratedChanges: true,
      readerConnectionToPredecessor: 'disconnected',
      randomBytes: () => SECOND_RANDOM_BYTES,
    });
    expect(disconnected.manifest.versions[1].readerConnectionToPredecessor).toBe('disconnected');
    expect(disconnected.manifest.versions[0].versionId).toBe(first.versionId);
  });
});
