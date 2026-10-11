/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedOutputOwnership } from '../../../../../../contracts/types/generatedOutputIdentity.js';
import reviewRoutes from '../../../../src/areas/bundle/review/routes/reviewRoutes.js';
import { generateCurrentBundleVersion } from '../../../../src/shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import { generationRecordPaths } from '../../../../src/shared/generated-bundle-versioning/generationRecords.js';
import { ownedOutput, testGenerationMetadata } from '../../../shared/support/generationRecordTestUtils.js';

interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  gitStatus?: string;
  children?: TreeNode[];
  comparison?: {
    entryId: string;
    moved: boolean;
    modified: boolean;
    before: { path: string; objectId: string; endpoint: string; versionId: string | null } | null;
    after: { path: string; objectId: string; endpoint: string; versionId: string | null } | null;
  };
}

const files = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap(node => node.type === 'file' ? [node] : files(node.children ?? []));

describe('generated changes review routes', () => {
  let home: string;
  let bundleDirectory: string;
  const app = express().use('/api', reviewRoutes);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: home, encoding: 'utf8' }).trim();
  const generate = (pages: Record<string, string>, owners: GeneratedOutputOwnership[]) => generateCurrentBundleVersion(bundleDirectory, {
    generate: async directory => {
      for (const [relativePath, content] of Object.entries(pages)) {
        fs.mkdirSync(path.dirname(path.join(directory, relativePath)), { recursive: true });
        fs.writeFileSync(path.join(directory, relativePath), content);
      }
      return testGenerationMetadata(owners);
    },
  });

  beforeEach(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-generated-changes-')));
    vi.stubEnv('MEADOW_HOME_DIRECTORY_OVERRIDE', home);
    git('init', '-b', 'main');
    git('config', 'user.name', 'Meadow Test');
    git('config', 'user.email', 'meadow-test@example.invalid');
    bundleDirectory = path.join(home, 'bundles', 'example');
    fs.mkdirSync(path.join(bundleDirectory, 'config'), { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), 'bundleGuid: abc1234\n');
    git('add', '-A');
    git('commit', '-m', 'create bundle');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('lists a moved page once with exact old and new bytes and unsaved state independent of the change count', async () => {
    await generate({ 'index.html': '<html><head></head><body><main>Index</main></body></html>', 'A.html': '<html><head></head><body><main>Old</main></body></html>' },
      [ownedOutput('A.html', 'aaaaaaaaaaaa')]);
    expect((await request(app).get('/api/bundles/example/review/save-changes')).status).toBe(200);
    await generate({ 'index.html': '<html><head></head><body><main>Index</main></body></html>', 'notes/B.html': '<html><head></head><body><main>New</main></body></html>' },
      [ownedOutput('notes/B.html', 'aaaaaaaaaaaa')]);

    const tree = await request(app).get('/api/bundles/example/review/preview-files/tree?changedOnly=true');
    expect(tree.status).toBe(200);
    expect(tree.body.comparison).toMatchObject({
      baseline: 'saved-current',
      identityPairing: true,
      counts: { total: 1, added: 0, deleted: 0, modified: 1, moved: 1 },
    });
    expect(tree.body.saveState).toMatchObject({ saved: false, hasSavedGeneration: true });
    const [moved] = files(tree.body.tree as TreeNode[]);
    expect(moved).toMatchObject({ name: 'B.html', gitStatus: 'modified', comparison: { entryId: 'owner:aaaaaaaaaaaa:page', moved: true, modified: true } });

    const read = (side: NonNullable<NonNullable<TreeNode['comparison']>['before']>) => request(app)
      .get('/api/bundles/example/review/generated-changes/file')
      .query({ endpoint: side.endpoint, path: side.path, objectId: side.objectId, versionId: side.versionId ?? '' });
    expect((await read(moved.comparison!.before!)).body).toMatchObject({ fileType: 'text', content: expect.stringContaining('Old') });
    expect((await read(moved.comparison!.after!)).body).toMatchObject({ fileType: 'text', content: expect.stringContaining('New') });

    const sections = await request(app).get('/api/bundles/example/review/preview-files/html-section-changes');
    expect(sections.body.files).toEqual([expect.objectContaining({
      entryId: 'owner:aaaaaaaaaaaa:page',
      sections: { head: false, aside: false, header: false, main: true, footer: false, other: false },
    })]);

    fs.writeFileSync(path.join(bundleDirectory, 'html', 'generated_bundle_versions', moved.comparison!.after!.versionId!, 'notes', 'B.html'), 'replaced');
    expect((await read(moved.comparison!.after!)).body).toEqual({ stale: true, path: 'notes/B.html' });
  });

  it('refuses to save a corrupt current record and explains the limited comparison', async () => {
    const first = await generate({ 'index.html': '<p>Index</p>' }, []);
    fs.writeFileSync(generationRecordPaths(bundleDirectory, first.versionId).output, '{ damaged');
    const tree = await request(app).get('/api/bundles/example/review/preview-files/tree?changedOnly=true');
    expect(tree.body.comparison.right.record.kind).toBe('corrupt');
    expect(tree.body.comparison.identityPairing).toBe(false);
    const save = await request(app).get('/api/bundles/example/review/save-changes');
    expect(save.status).toBe(409);
    expect(save.body.error).toMatch(/Generate the bundle again before saving/);
  });
});
