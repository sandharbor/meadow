/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import ArtifactReporter, { getTestArtifactDirectory } from '../../src/run/artifactReporter.js';
import { assembleScenarioVideo, findScenarioRecording, scenarioRecordingDirectory } from '../../src/artifacts/scenarioVideo.js';

test('partial reruns retain other scenarios recordings after temporary output is cleaned', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scenario-videos-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = path.join(root, 'run');
  const source = path.join(root, 'recording.webm');
  const spec = path.join(root, 'scenario.spec.ts');
  writeFileSync(spec, '// Captured source');
  const reporter = new ArtifactReporter({ outputDir: run });
  const begin = (title: string) => reporter.onTestBegin({ title, annotations: [], location: { file: spec, line: 1, column: 1 } } as unknown as TestCase,
    { startTime: new Date() } as TestResult);
  const directories = ['first', 'second'].map(title => getTestArtifactDirectory(title, run));
  for (const [index, title] of ['first', 'second'].entries()) {
    begin(title);
    writeFileSync(source, `original recording ${index}`);
    assembleScenarioVideo(directories[index], source);
  }
  // Playwright clears all of its raw output, but executes only the first test.
  rmSync(source);
  begin('first');
  assert.equal(existsSync(path.join(directories[0], 'video.webm')), false);
  writeFileSync(source, 'new recording');
  assembleScenarioVideo(directories[0], source);
  assembleScenarioVideo(directories[1], null);
  assert.equal(readFileSync(path.join(directories[1], 'video.webm'), 'utf8'), 'original recording 1');
  rmSync(source);
  for (const directory of directories) assembleScenarioVideo(directory, null);
  assert.equal(readFileSync(path.join(directories[0], 'video.webm'), 'utf8'), 'new recording');
});

test('a scenario that executes without recording cannot inherit its previous video', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scenario-no-video-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = getTestArtifactDirectory('no recording', root);
  mkdirSync(directory);
  writeFileSync(path.join(directory, 'video.webm'), 'old recording');
  const spec = path.join(root, 'scenario.spec.ts');
  writeFileSync(spec, '// Recording disabled');
  new ArtifactReporter({ outputDir: root }).onTestBegin({ title: 'no recording', annotations: [], location: { file: spec, line: 1, column: 1 } } as unknown as TestCase,
    { startTime: new Date() } as TestResult);
  assert.equal(assembleScenarioVideo(directory, null), undefined);
  assert.equal(existsSync(path.join(directory, 'video.webm')), false);
});

test('the same scenario in two runs cannot exchange recordings', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scenario-video-runs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = path.join(root, 'first-run', 'same-scenario');
  const second = path.join(root, 'second-run', 'same-scenario');
  mkdirSync(scenarioRecordingDirectory(first), { recursive: true });
  writeFileSync(path.join(scenarioRecordingDirectory(first), 'capture.webm'), 'first run video');
  assert.equal(findScenarioRecording(second), null, 'a new run has no access to earlier temporary recordings');
  mkdirSync(scenarioRecordingDirectory(second), { recursive: true });
  writeFileSync(path.join(scenarioRecordingDirectory(second), 'capture.webm'), 'second run video');
  assembleScenarioVideo(first, findScenarioRecording(first));
  assembleScenarioVideo(second, findScenarioRecording(second));
  assert.equal(readFileSync(path.join(first, 'video.webm'), 'utf8'), 'first run video');
  assert.equal(readFileSync(path.join(second, 'video.webm'), 'utf8'), 'second run video');
});
