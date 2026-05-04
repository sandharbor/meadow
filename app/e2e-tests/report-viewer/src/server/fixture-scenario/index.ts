/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { assembleTestArtifacts } from "../../../../test-runner/src/artifacts/assemble.js";
import { CanonicalScenarioBuilder } from "./CanonicalScenarioBuilder.js";
import { buildCanonicalScenario } from "./canonical-scenario.js";

// Public entrypoint: called by the report-viewer's express middleware on
// every refresh of the fixture scenario. Wipes the target directory,
// runs the factories, copies the placeholder video, then invokes the
// real assembler so the scenario looks identical on the wire to a
// scenario produced by a live test run.
//
// Synchronous from the caller's POV — but exposed as async so future
// versions can do parallel work without changing the signature.

export const FIXTURE_RUN_ID = "__fixture";
export const FIXTURE_TEST_SLUG = "canonical";

const ARTIFACTS_BASE = path.join(os.homedir(), "meadow-e2e-artifacts", "current");
const FIXTURE_DIR = path.join(ARTIFACTS_BASE, FIXTURE_RUN_ID, FIXTURE_TEST_SLUG);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_VIDEO_PATH = path.join(HERE, "assets", "mock-video.webm");
const SCENARIO_SOURCE_PATH = path.join(HERE, "canonical-scenario.ts");

// Fake-clock epoch: arbitrary fixed point so timestamps are stable across
// regenerations. The choice doesn't matter for the viewer — only relative
// ordering does.
const EPOCH_ISO = "2026-01-01T12:00:00.000Z";

export async function generateFixtureScenario(): Promise<string> {
  // Wipe and recreate so each refresh starts from a known-empty state.
  if (existsSync(FIXTURE_DIR)) {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const builder = new CanonicalScenarioBuilder(FIXTURE_DIR, EPOCH_ISO);

  // The factory script — modify this file and refresh to see changes.
  buildCanonicalScenario(builder);
  builder.finalize();
  builder.flushKeyFrames();

  // Required scalar files the assembler reads.
  writeFileSync(path.join(FIXTURE_DIR, "start-time.txt"), builder.ticker.startIso());
  writeFileSync(path.join(FIXTURE_DIR, "end-time.txt"), builder.ticker.endIso());
  writeFileSync(path.join(FIXTURE_DIR, "status.txt"), "passed");
  // Point test-file.txt at the scenario script so the viewer's source view
  // shows the very factories that produced this artifact — the most
  // self-documenting choice.
  writeFileSync(path.join(FIXTURE_DIR, "test-file.txt"), SCENARIO_SOURCE_PATH);
  // tick-config drives the timeline scrubber resolution. 100ms matches the
  // ticker's default advance step.
  writeFileSync(
    path.join(FIXTURE_DIR, "tick-config.json"),
    JSON.stringify({ intervalMs: 100 })
  );

  // Mock video so the player has something to render. We copy it into the
  // artifact dir under the conventional name; the existing /video.webm
  // endpoint serves it as-is.
  if (existsSync(MOCK_VIDEO_PATH)) {
    copyFileSync(MOCK_VIDEO_PATH, path.join(FIXTURE_DIR, "video.webm"));
  }

  // Run the real assembler against the populated input dir. This produces
  // manifest.json + report-meta.json identical in shape to a live run.
  assembleTestArtifacts(FIXTURE_DIR);

  return FIXTURE_DIR;
}
