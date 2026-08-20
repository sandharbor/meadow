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

import { mkdirSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

const ARTIFACTS_ROOT = path.join(
  os.homedir(),
  "meadow-agent-eval-artifacts",
  "current",
);

export interface AgentEvalFixture {
  runId: string;
  failedTrialId: string;
  passedTrialId: string;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTrial(
  runDir: string,
  trialId: string,
  options: { passed: boolean; elapsedMs: number },
): void {
  const trialDir = path.join(runDir, trialId);
  mkdirSync(path.join(trialDir, "frozen-state", "app"), { recursive: true });
  mkdirSync(path.join(trialDir, "commands"), { recursive: true });

  const events = [
    {
      id: "event-1",
      timestamp: "2026-08-20T10:00:00.000Z",
      phase: "autonomous",
      actor: "manager",
      kind: "message",
      text: "Create and save the requested bundle.",
      scored: true,
    },
    {
      id: "event-2",
      timestamp: "2026-08-20T10:00:03.000Z",
      phase: "frozen",
      actor: "harness",
      kind: "freeze",
      text: "Scored state captured.",
      scored: true,
    },
    {
      id: "event-3",
      timestamp: "2026-08-20T10:00:04.000Z",
      phase: "retrospective",
      actor: "operator",
      kind: "message",
      text: "The version argument was difficult to discover.",
      scored: false,
    },
  ];
  const commands = [
    {
      id: "command-1",
      startedAt: "2026-08-20T10:00:01.000Z",
      finishedAt: "2026-08-20T10:00:02.000Z",
      args: ["bundle", "generate", "fixture-bundle"],
      cwd: "/isolated/operator-workdir",
      stdout: options.passed ? "{\"versionId\":\"v1\"}\n" : "",
      stderr: options.passed ? "" : "generation failed\n",
      exitCode: options.passed ? 0 : 1,
      durationMs: 1000,
      phase: "autonomous",
    },
  ];
  const oracle = [
    {
      id: "saved-generation-exists",
      passed: options.passed,
      summary: options.passed
        ? "The generated version is saved."
        : "The generated version was not saved.",
      expected: { saved: true },
      actual: { saved: options.passed },
      safety: false,
    },
  ];
  const manifest = {
    schemaVersion: 1,
    kind: "agent-eval",
    runId: `${path.basename(runDir)}/${trialId}`,
    scenario: { id: "create-safe-bundle", version: 1 },
    revisions: { meadow: "fixture-revision" },
    fixture: { id: "viewer-fixture", sha256: "fixture-sha256" },
    profiles: {
      manager: { adapter: "codex", model: "manager-model", reasoningEffort: "high" },
      operator: { adapter: "codex", model: "operator-model", reasoningEffort: "medium" },
    },
    adapterVersions: { manager: "manager-v1", operator: "operator-v1" },
    startedAt: "2026-08-20T10:00:00.000Z",
    finishedAt: "2026-08-20T10:00:05.000Z",
    terminationReason: "completed",
    assistanceClass: options.passed ? "independent" : "failed",
    passed: options.passed,
    safetyViolation: false,
  };

  writeJson(path.join(trialDir, "manifest.json"), manifest);
  writeJson(path.join(trialDir, "trial.json"), {
    ...manifest,
    events,
    commands,
    oracle,
  });
  writeJson(path.join(trialDir, "oracle.json"), oracle);
  writeJson(path.join(trialDir, "metrics.json"), {
    commandsAttempted: 1,
    failedCommands: options.passed ? 0 : 1,
    helpInvocations: 0,
    retries: 0,
    coachingTurns: 0,
    rescueTurns: 0,
    elapsedMs: options.elapsedMs,
  });
  writeJson(path.join(trialDir, "assessment.json"), {
    summary: options.passed ? "The trial passed independently." : "The command failed before save.",
    evidence: [{ eventId: "event-2", interpretation: "The scored state was frozen." }],
  });
  writeFileSync(path.join(trialDir, "retrospective.md"), "Version discovery should be clearer.\n");
  writeFileSync(path.join(trialDir, "terminal-transcript.txt"), "operator terminal transcript\n");
  writeFileSync(path.join(trialDir, "manager-terminal-transcript.txt"), "manager terminal transcript\n");
  writeFileSync(path.join(trialDir, "frozen-state", "meadow_home.yaml"), "version: 1\nbundles: []\n");
  writeFileSync(path.join(trialDir, "frozen-state", "app", "global_custom_filters.json"), "[]\n");
  writeJson(path.join(trialDir, "commands", "command-1.json"), commands[0]);
}

export function ensureAgentEvalArtifact(): AgentEvalFixture {
  const runId = "rv-agent-fixture-v1";
  const failedTrialId = "create-safe-bundle-trial-01";
  const passedTrialId = "create-safe-bundle-trial-02";
  const runDir = path.join(ARTIFACTS_ROOT, runId);
  mkdirSync(runDir, { recursive: true });

  writeTrial(runDir, failedTrialId, { passed: false, elapsedMs: 5000 });
  writeTrial(runDir, passedTrialId, { passed: true, elapsedMs: 4200 });
  writeJson(path.join(runDir, "run-summary.json"), {
    schemaVersion: 1,
    kind: "agent-eval-run",
    runId,
    scenario: { id: "create-safe-bundle", version: 1 },
    trials: 2,
    passed: 1,
    required: 2,
    accepted: false,
    trialResults: [
      {
        runId: `${runId}/${failedTrialId}`,
        passed: false,
        assistanceClass: "failed",
        terminationReason: "completed",
        elapsedMs: 5000,
      },
      {
        runId: `${runId}/${passedTrialId}`,
        passed: true,
        assistanceClass: "independent",
        terminationReason: "completed",
        elapsedMs: 4200,
      },
    ],
  });

  return { runId, failedTrialId, passedTrialId };
}
