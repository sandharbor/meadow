/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedOutputOwnership } from '../../../../../contracts/types/generatedOutputIdentity.js';
import {
  SimulatedVersionOperationCrash,
  cancelCurrentGeneratedBundleVersion,
  createNewGeneratedBundleVersion,
  deleteLocalGeneratedBundleVersionFiles,
  generateCurrentBundleVersion,
  recoverGeneratedBundleVersionOperations,
  withGeneratedBundleVersionOperation,
} from '../../../src/shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import {
  generatedBundleVersionsRoot,
  loadGeneratedBundleVersionManifest,
} from '../../../src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { inspectGeneratedVersionGitState } from '../../../src/shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import { generationRecordPaths } from '../../../src/shared/generated-bundle-versioning/generationRecords.js';
import {
  compareCurrentGeneratedOutput,
  readComparedGeneratedFile,
  resolveWorkingEndpoint,
  StaleGeneratedComparisonError,
} from '../../../src/shared/generated-bundle-versioning/generatedOutputComparison.js';
import {
  saveGeneratedBundleVersion,
  SaveGeneratedBundleVersionError,
} from '../../../src/shared/generated-bundle-versioning/saveGeneratedBundleVersion.js';
import { ownedOutput, testGenerationMetadata } from '../support/generationRecordTestUtils.js';

describe('generated output identity across the version lifecycle', () => {
  let homeDirectory: string;
  let bundleDirectory: string;

  const git = (...args: string[]): string => execFileSync('git', args, { cwd: homeDirectory, encoding: 'utf8' }).trim();

  const generator = (files: Record<string, string>, owners: GeneratedOutputOwnership[], snapshot = 'snapshot-test') =>
    async (directory: string) => {
      for (const [relativePath, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(directory, relativePath)), { recursive: true });
        fs.writeFileSync(path.join(directory, relativePath), content);
      }
      return testGenerationMetadata(owners, snapshot);
    };

  const generateCurrent = (files: Record<string, string>, owners: GeneratedOutputOwnership[], snapshot?: string) =>
    generateCurrentBundleVersion(bundleDirectory, {
      generate: generator(files, owners, snapshot),
    });

  const createSuccessor = (files: Record<string, string>, owners: GeneratedOutputOwnership[]) =>
    createNewGeneratedBundleVersion(bundleDirectory, {
      generate: generator(files, owners),
      confirmedNoGeneratedChanges: true,
    });

  const save = async () => {
    const current = loadGeneratedBundleVersionManifest(bundleDirectory).versions.at(-1)!;
    return saveGeneratedBundleVersion({ bundleDirectory, configDirectory: homeDirectory, versionId: current.versionId });
  };

  const summarize = async () => {
    const comparison = (await compareCurrentGeneratedOutput(bundleDirectory))!;
    return {
      baseline: comparison.baseline,
      identityPairing: comparison.identityPairing,
      entries: comparison.entries.map(entry => [entry.kind, entry.before?.path ?? null, entry.after?.path ?? null, entry.moved, entry.modified]),
    };
  };

  const pageA = { 'index.html': '<p>index</p>', 'A.html': '<p>A</p>' };
  const ownersA = [ownedOutput('A.html', 'aaaaaaaaaaaa')];
  const pageB = { 'index.html': '<p>index</p>', 'B.html': '<p>A</p>' };
  const ownersB = [ownedOutput('B.html', 'aaaaaaaaaaaa')];

  beforeEach(() => {
    homeDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-output-identity-')));
    vi.stubEnv('MEADOW_HOME_DIRECTORY_OVERRIDE', homeDirectory);
    git('init', '-b', 'main');
    git('config', 'user.name', 'Meadow Test');
    git('config', 'user.email', 'meadow-test@example.invalid');
    bundleDirectory = path.join(homeDirectory, 'bundles', 'example');
    fs.mkdirSync(path.join(bundleDirectory, 'config'), { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), 'bundleGuid: abc1234\n');
    git('add', '-A');
    git('commit', '-m', 'create bundle');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(homeDirectory, { recursive: true, force: true });
  });

  it('compares the first generation with an empty site', async () => {
    await generateCurrent(pageA, ownersA);
    expect(await summarize()).toEqual({
      baseline: 'empty',
      identityPairing: true,
      entries: [['added', null, 'A.html', false, false], ['added', null, 'index.html', false, false]],
    });
  });

  it('reports an accepted rename as one move and the reused old path as an addition', async () => {
    await generateCurrent(pageA, ownersA);
    await save();
    await generateCurrent({ ...pageB, 'A.html': '<p>new A</p>' }, [...ownersB, ownedOutput('A.html', 'bbbbbbbbbbbb')]);
    expect(await summarize()).toEqual({
      baseline: 'saved-current',
      identityPairing: true,
      entries: [['added', null, 'A.html', false, false], ['changed', 'A.html', 'B.html', true, false]],
    });
  });

  it('freezes the predecessor with its saved output and saved records after an unsaved preview', async () => {
    const first = await generateCurrent(pageA, ownersA);
    await save();
    const savedRecord = fs.readFileSync(generationRecordPaths(bundleDirectory, first.versionId).output, 'utf8');
    await generateCurrent(pageB, ownersB, 'later-snapshot');
    expect(fs.readFileSync(generationRecordPaths(bundleDirectory, first.versionId).output, 'utf8')).not.toBe(savedRecord);

    const second = await createSuccessor(pageB, ownersB);
    expect(fs.readFileSync(path.join(first.directory, 'A.html'), 'utf8')).toBe('<p>A</p>');
    expect(fs.readFileSync(generationRecordPaths(bundleDirectory, first.versionId).output, 'utf8')).toBe(savedRecord);
    expect(inspectGeneratedVersionGitState(bundleDirectory, first.versionId).isSaved).toBe(true);
    expect((await resolveWorkingEndpoint(bundleDirectory, second.versionId)).endpoint.record).toEqual({ kind: 'valid' });

    expect(await summarize()).toEqual({
      baseline: 'saved-predecessor',
      identityPairing: true,
      entries: [['changed', 'A.html', 'B.html', true, false]],
    });
  });

  it('shows no site differences for a new version whose internal paths and bytes are unchanged, while it stays unsaved', async () => {
    await generateCurrent(pageA, ownersA);
    await save();
    const second = await createSuccessor(pageA, ownersA);
    expect(await summarize()).toEqual({ baseline: 'saved-predecessor', identityPairing: true, entries: [] });
    expect(inspectGeneratedVersionGitState(bundleDirectory, second.versionId).isSaved).toBe(false);
    await save();
    expect(inspectGeneratedVersionGitState(bundleDirectory, second.versionId).isSaved).toBe(true);
    expect((await summarize()).baseline).toBe('saved-current');
  });

  it('keeps a provenance-only regeneration free of site differences but unsaved until Save retains the new record', async () => {
    const first = await generateCurrent(pageA, ownersA);
    await save();
    await generateCurrent(pageA, ownersA, 'another-snapshot');
    expect((await summarize()).entries).toEqual([]);
    expect(inspectGeneratedVersionGitState(bundleDirectory, first.versionId).isSaved).toBe(false);
    await save();
    expect(inspectGeneratedVersionGitState(bundleDirectory, first.versionId).isSaved).toBe(true);
  });

  it('uses ordinary path comparison against a legacy saved result and never guesses moves', async () => {
    const first = await generateCurrent(pageA, ownersA);
    const paths = generationRecordPaths(bundleDirectory, first.versionId);
    fs.rmSync(paths.inputs);
    fs.rmSync(paths.output);
    git('add', '-A');
    git('commit', '-m', 'legacy save without generation records');
    await generateCurrent(pageB, ownersB);
    const comparison = (await compareCurrentGeneratedOutput(bundleDirectory))!;
    expect(comparison.left.record).toEqual({ kind: 'legacy' });
    expect(comparison.identityPairing).toBe(false);
    expect(comparison.entries.map(entry => entry.entryId)).toEqual(['deleted:A.html', 'added:B.html']);
  });

  it('shows ordinary differences for a corrupt current record and requires regeneration before Save', async () => {
    const first = await generateCurrent(pageA, ownersA);
    await save();
    await generateCurrent(pageB, ownersB);
    fs.rmSync(generationRecordPaths(bundleDirectory, first.versionId).output);

    const comparison = (await compareCurrentGeneratedOutput(bundleDirectory))!;
    expect(comparison.right.record).toMatchObject({ kind: 'corrupt' });
    expect(comparison.identityPairing).toBe(false);
    expect(comparison.entries.map(entry => entry.entryId)).toEqual(['deleted:A.html', 'added:B.html']);
    await expect(save()).rejects.toThrow(/Generate the bundle again before saving/);

    await generateCurrent(pageB, ownersB);
    await expect(save()).resolves.toMatchObject({ versionId: first.versionId, changed: true });
  });

  it('reports a Save that overlaps generation as a conflict and never commits operation artifacts', async () => {
    await generateCurrent(pageA, ownersA);
    await withGeneratedBundleVersionOperation(bundleDirectory, async () => {
      await expect(save()).rejects.toThrow(SaveGeneratedBundleVersionError);
    });
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const generationStarted = new Promise<void>(resolve => { started = resolve; });
    const regenerating = generateCurrentBundleVersion(bundleDirectory, {
      generate: async directory => {
        const metadata = await generator(pageB, ownersB)(directory);
        started();
        await blocked;
        return metadata;
      },
    });
    await generationStarted;
    await expect(save()).rejects.toThrow(/Wait for the running generation/);
    release();
    await regenerating;
    await save();
    const tracked = git('ls-files');
    expect(tracked).not.toMatch(/generated_bundle_version_operations|version-operation|\.staging-|\.backup-/);
    expect(tracked).toMatch(/raw\/generation_inputs\/v[A-Za-z0-9]{6}\.output\.json/);
  });

  it('removes a cancelled version with its records', async () => {
    await generateCurrent(pageA, ownersA);
    await save();
    const second = await createSuccessor(pageB, ownersB);
    await cancelCurrentGeneratedBundleVersion(bundleDirectory);
    const paths = generationRecordPaths(bundleDirectory, second.versionId);
    expect(fs.existsSync(paths.inputs)).toBe(false);
    expect(fs.existsSync(paths.output)).toBe(false);
  });

  it('restores the prior records after a failed or interrupted regeneration', async () => {
    const first = await generateCurrent(pageA, ownersA);
    const paths = generationRecordPaths(bundleDirectory, first.versionId);
    const before = fs.readFileSync(paths.output, 'utf8');
    for (const phase of ['staging', 'predecessor-backed-up', 'version-installed', 'manifest-committed'] as const) {
      await expect(generateCurrentBundleVersion(bundleDirectory, {
        generate: generator(pageB, ownersB),
        onPhase: current => { if (current === phase) throw new Error(`fail at ${phase}`); },
      })).rejects.toThrow(`fail at ${phase}`);
      expect(fs.readFileSync(paths.output, 'utf8')).toBe(before);
      expect(fs.readFileSync(path.join(first.directory, 'A.html'), 'utf8')).toBe('<p>A</p>');
    }

    await expect(generateCurrentBundleVersion(bundleDirectory, {
      generate: generator(pageB, ownersB),
      onPhase: current => { if (current === 'version-installed') throw new SimulatedVersionOperationCrash('crash'); },
    })).rejects.toThrow('crash');
    expect(fs.existsSync(path.join(first.directory, 'B.html'))).toBe(true);
    recoverGeneratedBundleVersionOperations(bundleDirectory);
    expect(fs.readFileSync(paths.output, 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(first.directory, 'A.html'))).toBe(true);
    expect((await resolveWorkingEndpoint(bundleDirectory, first.versionId)).endpoint.record).toEqual({ kind: 'valid' });
  });

  it('keeps the current version when a regeneration is interrupted before anything was installed', async () => {
    const first = await generateCurrent(pageA, ownersA);
    await expect(generateCurrentBundleVersion(bundleDirectory, {
      generate: generator(pageB, ownersB),
      onPhase: current => { if (current === 'staging') throw new SimulatedVersionOperationCrash('crash while staging'); },
    })).rejects.toThrow('crash while staging');
    const recovery = recoverGeneratedBundleVersionOperations(bundleDirectory);
    expect(recovery.problems).toEqual([]);
    expect(fs.readFileSync(path.join(first.directory, 'A.html'), 'utf8')).toBe('<p>A</p>');
  });

  it('keeps transient operation artifacts outside the committed versions root', async () => {
    let entries: string[] = [];
    await generateCurrentBundleVersion(bundleDirectory, {
      generate: async directory => {
        const metadata = await generator(pageA, ownersA)(directory);
        entries = fs.readdirSync(generatedBundleVersionsRoot(bundleDirectory));
        return metadata;
      },
    });
    expect(entries).toEqual([]);
  });

  it('compares a new version with the retained saved tree of a locally deleted predecessor', async () => {
    await generateCurrent(pageA, ownersA);
    await save();
    const second = await createSuccessor(pageB, ownersB);
    await save();
    await createSuccessor({ ...pageB, 'C.html': '<p>C</p>' }, [...ownersB, ownedOutput('C.html', 'cccccccccccc')]);
    await deleteLocalGeneratedBundleVersionFiles(bundleDirectory, second.versionId, {
      commit: async () => {
        git('add', '-A', '--', 'bundles/example/config', `bundles/example/html/generated_bundle_versions/${second.versionId}`);
        git('commit', '-m', 'delete local files');
      },
    });
    expect(await summarize()).toEqual({
      baseline: 'saved-predecessor',
      identityPairing: true,
      entries: [['added', null, 'C.html', false, false]],
    });
  });

  it('reads compared bytes exactly and detects a working file replaced after comparison', async () => {
    const first = await generateCurrent(pageA, ownersA);
    await save();
    await generateCurrent(pageB, ownersB);
    const entry = (await compareCurrentGeneratedOutput(bundleDirectory))!.entries[0];
    expect(readComparedGeneratedFile(bundleDirectory, { endpointKind: 'saved', versionId: first.versionId, ...entry.before! }).toString())
      .toBe('<p>A</p>');
    expect(readComparedGeneratedFile(bundleDirectory, { endpointKind: 'working', versionId: first.versionId, ...entry.after! }).toString())
      .toBe('<p>A</p>');
    fs.writeFileSync(path.join(first.directory, 'B.html'), '<p>replaced</p>');
    expect(() => readComparedGeneratedFile(bundleDirectory, { endpointKind: 'working', versionId: first.versionId, ...entry.after! }))
      .toThrow(StaleGeneratedComparisonError);
  });
});
