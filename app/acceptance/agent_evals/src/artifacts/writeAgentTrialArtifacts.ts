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

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AgentTrialResult } from "../types.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function revision(directory: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

export function hashFixture(directory: string): string {
  const hash = createHash("sha256");
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = path.join(current, entry.name);
      const relativePath = path.relative(directory, entryPath).split(path.sep).join("/");
      if (entry.isDirectory()) visit(entryPath);
      else if (statSync(entryPath).isFile()) {
        hash.update(relativePath);
        hash.update("\0");
        hash.update(readFileSync(entryPath));
        hash.update("\0");
      }
    }
  };
  visit(directory);
  return hash.digest("hex");
}

export function writeAgentTrialArtifacts(input: {
  artifactDirectory: string;
  result: AgentTrialResult;
  exactRequest: string;
  initialManagerPrompt: string;
  operatorTerminalTranscript: string;
  managerTerminalTranscript?: string;
  fixtureSha256: string;
  adapterVersions: {
    manager: string;
    operator: string;
    codexCli?: string;
    managerPromptVersion: number;
    scenarioPromptVersion: number;
    runtimeExtension?: string;
  };
}): void {
  mkdirSync(input.artifactDirectory, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    kind: "agent-eval",
    runId: input.result.runId,
    scenario: input.result.scenario,
    revisions: { meadow: revision(REPO_ROOT) },
    fixture: {
      id: "example-bundle-data-without-pagespecs",
      sha256: input.fixtureSha256,
    },
    profiles: input.result.profiles,
    adapterVersions: input.adapterVersions,
    startedAt: input.result.startedAt,
    finishedAt: input.result.finishedAt,
    terminationReason: input.result.terminationReason,
    assistanceClass: input.result.assistanceClass,
    passed: input.result.passed,
    safetyViolation: input.result.safetyViolation,
  };
  writeJson(path.join(input.artifactDirectory, "manifest.json"), manifest);
  writeJson(path.join(input.artifactDirectory, "trial.json"), input.result);
  writeFileSync(path.join(input.artifactDirectory, "initial-manager-prompt.md"), `${input.initialManagerPrompt}\n`, "utf8");
  writeFileSync(path.join(input.artifactDirectory, "operator-request.md"), `${input.exactRequest}\n`, "utf8");
  writeFileSync(path.join(input.artifactDirectory, "terminal-transcript.txt"), input.operatorTerminalTranscript, "utf8");
  if (input.managerTerminalTranscript !== undefined) {
    writeFileSync(
      path.join(input.artifactDirectory, "manager-terminal-transcript.txt"),
      input.managerTerminalTranscript,
      "utf8",
    );
  }
  writeFileSync(
    path.join(input.artifactDirectory, "conversation.jsonl"),
    input.result.events.map(event => JSON.stringify(event)).join("\n") + "\n",
    "utf8",
  );
  writeJson(path.join(input.artifactDirectory, "oracle.json"), input.result.oracle);
  writeJson(path.join(input.artifactDirectory, "metrics.json"), input.result.metrics);
  writeJson(path.join(input.artifactDirectory, "assessment.json"), input.result.assessment);
  writeFileSync(
    path.join(input.artifactDirectory, "retrospective.md"),
    `${input.result.retrospective?.message ?? "Retrospective unavailable."}\n`,
    "utf8",
  );
  const commandDirectory = path.join(input.artifactDirectory, "commands");
  mkdirSync(commandDirectory, { recursive: true });
  for (const command of input.result.commands) {
    writeJson(path.join(commandDirectory, `${command.id}.json`), {
      ...command,
      stdout: undefined,
      stderr: undefined,
    });
    writeFileSync(path.join(commandDirectory, `${command.id}.stdout.txt`), command.stdout, "utf8");
    writeFileSync(path.join(commandDirectory, `${command.id}.stderr.txt`), command.stderr, "utf8");
  }
}
