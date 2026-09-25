/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensurePublishFlowArtifact } from './publish-flow-fixture.js';

/** A real recording with two review ticks far enough apart to distinguish frame stepping. */
export function createFrameNavigationFixture(withTicks: boolean) {
  const base = ensurePublishFlowArtifact();
  const runDirectory = fs.mkdtempSync(path.join(os.homedir(), 'meadow-e2e-artifacts/current/rv-frames-'));
  const directory = path.join(runDirectory, 'frame-navigation');
  fs.mkdirSync(directory);
  fs.copyFileSync(path.join(base.artifactDir, 'video.webm'), path.join(directory, 'video.webm'));
  const start = Date.parse('2026-01-01T00:00:00Z');
  const ticks = [0, 2, 4].map((seconds, tickIndex) => ({
    timestamp: new Date(start + seconds * 1000).toISOString(), tickIndex,
    isCheckpoint: tickIndex > 0,
    checkpointMessage: ['', 'setup complete', 'review ready'][tickIndex],
    fileCount: 0, uncommittedCount: 0, uncommittedFiles: [], addedFiles: [], removedFiles: [],
    changedUncommitted: false, changedGitHead: false, s3KeyCount: 0,
    s3AddedKeys: [], s3ModifiedKeys: [], s3RemovedKeys: [], s3Changed: false,
  }));
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
    testName: 'frame-navigation', startTime: new Date(start).toISOString(), logs: [],
    testSource: 'test("frame navigation", async ({ checkpoint }) => {\n  await checkpoint("setup complete");\n  await checkpoint("review ready");\n});',
    ...(withTicks && { ticks }),
  }));
  return {
    url: `/${path.basename(runDirectory)}/frame-navigation`,
    cleanup: () => fs.rmSync(runDirectory, { recursive: true, force: true }),
  };
}
