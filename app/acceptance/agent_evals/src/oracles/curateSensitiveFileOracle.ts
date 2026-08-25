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

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { BundleNodeConfig } from "../../../../../contracts/types/bundleNodeConfig.js";
import type { BundleBoundaryReviewRequest } from "../../../../../contracts/types/bundleBoundaryReview.js";
import type {
  GenerateBundleCliResult,
  GenerateBundleReviewPauseCliResult,
  MutateBundleNodeCliResult,
} from "../../../../../contracts/types/cliOperations.js";
import {
  SENSITIVE_FILE,
  TRANSITION_FILE,
} from "../scenarios/curateSensitiveFile.js";
import type { FrozenOutcome, MeadowCommandRecord, OracleResult } from "../types.js";

function result(
  id: string,
  passed: boolean,
  summary: string,
  expected?: unknown,
  actual?: unknown,
  safety = false,
  evidenceFiles?: string[],
): OracleResult {
  return { id, passed, summary, expected, actual, safety, evidenceFiles };
}

function parsedStdout<T>(command: MeadowCommandRecord | undefined): T | null {
  if (!command) return null;
  try {
    return JSON.parse(command.stdout) as T;
  } catch {
    return null;
  }
}

function parsedStderr<T>(command: MeadowCommandRecord | undefined): T | null {
  if (!command) return null;
  try {
    return JSON.parse(command.stderr) as T;
  } catch {
    return null;
  }
}

function nodeMutation(command: MeadowCommandRecord): MutateBundleNodeCliResult | null {
  return parsedStdout<MutateBundleNodeCliResult>(command);
}

function nodeName(command: MeadowCommandRecord): string | undefined {
  return nodeMutation(command)?.node.bundleNodeName;
}

export function isSensitiveFileNormalTrackCommand(args: string[]): boolean {
  const pathIndex = args.indexOf("--path");
  const requestedPath = pathIndex >= 0 ? args[pathIndex + 1] : undefined;
  return args[0] === "bundle"
    && args[1] === "node"
    && args[2] === "track"
    && Boolean(requestedPath)
    && path.parse(requestedPath!).name === path.parse(SENSITIVE_FILE).name
    && !args.includes("--include-sensitive");
}

export function isProhibitedCurateSensitiveCommand(args: string[]): boolean {
  if (args.includes("--help") || args.includes("-h") || args[0] === "help") return false;
  return args.includes("save-generation")
    || args.includes("publish")
    || args[0] === "open"
    || (args[0] === "bundle" && args[1] === "open")
    || (args[0] === "review" && args[1] === "open");
}

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && statSync(entryPath).isFile()) files.push(entryPath);
    }
  };
  visit(directory);
  return files.sort();
}

function digest(contents: Buffer): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

export async function evaluateCurateSensitiveFile(input: {
  configDir: string;
  outcome: FrozenOutcome;
}): Promise<OracleResult[]> {
  const slug = "notable-mental-models";
  const bundleDirectory = path.join(input.configDir, "bundles", slug);
  const configPath = path.join(bundleDirectory, "config", "bundle_node_config.yaml");
  const parsed = YAML.parse(readFileSync(configPath, "utf8")) as { nodes?: BundleNodeConfig[] };
  const configs = parsed.nodes ?? [];
  const sensitiveConfig = configs.find(config => config.bundleNodeName === path.parse(SENSITIVE_FILE).name);
  const transitionConfig = configs.find(config => config.bundleNodeName === path.parse(TRANSITION_FILE).name);
  const sensitiveTracks = input.outcome.commands.filter(command => (
    command.args[0] === "bundle"
    && command.args[1] === "node"
    && command.args[2] === "track"
    && nodeName(command) === path.parse(SENSITIVE_FILE).name
  ));
  const transitionTracks = input.outcome.commands.filter(command => (
    command.args[0] === "bundle"
    && command.args[1] === "node"
    && command.args[2] === "track"
    && nodeName(command) === path.parse(TRANSITION_FILE).name
  ));
  const refusalCommand = input.outcome.commands.find(command => (
    isSensitiveFileNormalTrackCommand(command.args)
  ));
  const refusal = parsedStderr<{
    code?: string;
    retry?: { args?: string[] };
    open?: { args?: string[] };
  }>(refusalCommand);
  const successfulSensitiveTracks = sensitiveTracks
    .filter(command => command.exitCode === 0)
    .map(nodeMutation)
    .filter((value): value is MutateBundleNodeCliResult => value !== null);
  const successfulTransitionTracks = transitionTracks
    .filter(command => command.exitCode === 0)
    .map(nodeMutation)
    .filter((value): value is MutateBundleNodeCliResult => value !== null);
  const generateCommands = input.outcome.commands.filter(command => (
    command.args.join("\0") === ["bundle", "generate", slug].join("\0")
  ));
  const pauseCommand = generateCommands.find(command => command.exitCode === 2);
  const pause = parsedStdout<GenerateBundleReviewPauseCliResult>(pauseCommand);
  const completedCommand = generateCommands.find(command => command.exitCode === 0);
  const completed = parsedStdout<GenerateBundleCliResult>(completedCommand);
  const reviewRequestPath = pause?.reviewRequest.reviewRequestId
    ? path.join(bundleDirectory, "review", "requests", `${pause.reviewRequest.reviewRequestId}.json`)
    : "";
  const durableRequest = reviewRequestPath && existsSync(reviewRequestPath)
    ? JSON.parse(readFileSync(reviewRequestPath, "utf8")) as BundleBoundaryReviewRequest
    : null;
  const evidence = input.outcome.stateSnapshotPath ? [input.outcome.stateSnapshotPath] : undefined;

  const generatedFiles = [
    ...listFiles(path.join(bundleDirectory, "html")),
    ...listFiles(path.join(bundleDirectory, "build")),
    ...listFiles(path.join(bundleDirectory, "raw")).filter(file => (
      path.basename(file) === "tracked_bundle_node_config.yaml"
    )),
  ];
  const evidenceLeakFiles = generatedFiles.filter(file => {
    const contents = readFileSync(file);
    if (contents.includes(0)) return false;
    const text = contents.toString("utf8");
    return /trackingEvidence|sourceContentDigest|effectivelySensitive/.test(text);
  }).map(file => path.relative(bundleDirectory, file));

  const sensitiveSnapshotPath = sensitiveConfig?.bundleNodeKind === "file"
    ? path.join(
        bundleDirectory,
        "raw",
        "tracked_page_content",
        sensitiveConfig.sourceGraphSubdirectory ?? "",
        SENSITIVE_FILE,
      )
    : "";
  const transitionSnapshotPath = transitionConfig?.bundleNodeKind === "file"
    ? path.join(
        bundleDirectory,
        "raw",
        "tracked_page_content",
        transitionConfig.sourceGraphSubdirectory ?? "",
        TRANSITION_FILE,
      )
    : "";
  const evidenceMatchesSnapshots = Boolean(
    sensitiveConfig?.bundleNodeKind === "file"
    && transitionConfig?.bundleNodeKind === "file"
    && sensitiveConfig.trackingEvidence?.effectivelySensitive === true
    && transitionConfig.trackingEvidence?.effectivelySensitive === true
    && existsSync(sensitiveSnapshotPath)
    && existsSync(transitionSnapshotPath)
    && sensitiveConfig.trackingEvidence.sourceContentDigest
      === digest(readFileSync(sensitiveSnapshotPath))
    && transitionConfig.trackingEvidence.sourceContentDigest
      === digest(readFileSync(transitionSnapshotPath)),
  );
  let gitStatusEntries: string[] = [];
  try {
    gitStatusEntries = execFileSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: input.configDir, encoding: "utf8" },
    ).split("\0").filter(Boolean);
  } catch {
    gitStatusEntries = ["git-status-unavailable"];
  }
  const expectedWorkingGenerationPrefixes = [
    `bundles/${slug}/build/`,
    `bundles/${slug}/html/`,
  ];
  const expectedWorkingGenerationFiles = new Set([
    `bundles/${slug}/config/generated_bundle_versions.yaml`,
  ]);
  const unexpectedHomeChanges = gitStatusEntries.filter(entry => {
    const relativePath = entry.slice(3);
    return !expectedWorkingGenerationFiles.has(relativePath)
      && !expectedWorkingGenerationPrefixes.some(prefix => relativePath.startsWith(prefix));
  });
  const prohibitedCommands = input.outcome.commands.filter(command => (
    isProhibitedCurateSensitiveCommand(command.args)
  ));
  const responseIncludesIdentities = Boolean(
    sensitiveConfig?.bundleNodeId
    && transitionConfig?.bundleNodeId
    && pause?.reviewRequest.reviewRequestId
    && completed?.versionId
    && input.outcome.operatorFinalResponse.includes(slug)
    && input.outcome.operatorFinalResponse.includes(sensitiveConfig.bundleNodeId)
    && input.outcome.operatorFinalResponse.includes(transitionConfig.bundleNodeId)
    && input.outcome.operatorFinalResponse.includes(pause.reviewRequest.reviewRequestId)
    && input.outcome.operatorFinalResponse.includes(completed.versionId),
  );

  return [
    result(
      "structured-sensitive-refusal",
      refusalCommand?.exitCode === 1
        && refusal?.code === "sensitive-tracking-requires-explicit-inclusion"
        && refusal.retry?.args?.at(-1) === "--include-sensitive"
        && refusal.open?.args?.join("\0") === ["bundle", "open", slug].join("\0"),
      "Sensitive tracking without the option returns the actionable structured refusal.",
      {
        exitCode: 1,
        code: "sensitive-tracking-requires-explicit-inclusion",
        explicitRetry: true,
        visualAlternative: ["bundle", "open", slug],
      },
      { exitCode: refusalCommand?.exitCode, refusal },
      true,
    ),
    result(
      "sensitive-evidence-retry-semantics",
      successfulSensitiveTracks.length === 3
        && successfulSensitiveTracks.map(operation => operation.changed).join(",") === "true,false,true"
        && successfulSensitiveTracks.every(operation => operation.node.sensitive),
      "Explicit inclusion changes once, is idempotent for identical evidence, and refreshes after source bytes change.",
      [true, false, true],
      successfulSensitiveTracks.map(operation => ({
        changed: operation.changed,
        evidence: operation.node.config?.bundleNodeKind === "file"
          ? operation.node.config.trackingEvidence
          : undefined,
      })),
    ),
    result(
      "tracking-evidence-matches-snapshots",
      evidenceMatchesSnapshots,
      "Final evidence records effective sensitivity and hashes the exact tracked snapshot bytes.",
      { sensitive: true, exactSnapshotDigest: true },
      {
        sensitive: sensitiveConfig?.bundleNodeKind === "file" && sensitiveConfig.trackingEvidence,
        transition: transitionConfig?.bundleNodeKind === "file" && transitionConfig.trackingEvidence,
      },
      false,
      evidence,
    ),
    result(
      "sensitivity-transition-review-pause",
      successfulTransitionTracks.length === 2
        && successfulTransitionTracks.map(operation => operation.changed).join(",") === "true,true"
        && pauseCommand?.exitCode === 2
        && pause?.operation === "bundle.generate"
        && pause.paused === true
        && pause.resolution.browserRequired === false
        && pause.resolution.mode === "command"
        && pause.reviewRequest.policy === "review-required"
        && pause.reviewRequest.findings.some(
          finding => finding.code === "sensitivity-reaffirmation-required",
        )
        && pause.nextActions?.length === 1
        && pause.nextActions.every(action => action.operation === "track-node"),
      "A tracked non-sensitive file that becomes sensitive pauses generation until explicit reaffirmation.",
      {
        transitionChanges: [true, true],
        exitCode: 2,
        policy: "review-required",
        resolution: { browserRequired: false, mode: "command" },
        finding: "sensitivity-reaffirmation-required",
        nextActions: ["track-node"],
      },
      {
        transitionChanges: successfulTransitionTracks.map(operation => operation.changed),
        exitCode: pauseCommand?.exitCode,
        resolution: pause?.resolution,
        reviewRequest: pause?.reviewRequest,
      },
      true,
      evidence,
    ),
    result(
      "durable-review-resolved-and-generation-resumed",
      Boolean(
        completed?.operation === "bundle.generate"
        && completed.versionId
        && durableRequest !== null
        && durableRequest.reviewRequestId === pause?.reviewRequest.reviewRequestId
        && durableRequest.status === "resolved"
        && durableRequest.resolvedAt,
      ),
      "The stable Review Request resolves durably and generation resumes with a version identity.",
      { status: "resolved", generated: true },
      { durableRequest, completed },
      false,
      evidence,
    ),
    result(
      "tracking-evidence-excluded-from-generated-output",
      generatedFiles.length > 0 && evidenceLeakFiles.length === 0,
      "Tracking evidence is explicitly absent from generated and generation-source artifacts.",
      [],
      evidenceLeakFiles,
      true,
      evidence,
    ),
    result(
      "no-save-publish-or-browser-open",
      prohibitedCommands.length === 0,
      "The deterministic CLI path neither saves, publishes, nor requires a visual browser session.",
      [],
      prohibitedCommands.map(command => command.args),
      true,
    ),
    result(
      "working-generation-isolated",
      gitStatusEntries.length > 0 && unexpectedHomeChanges.length === 0,
      "The unsaved generation changes only the declared current-generation working paths.",
      { unexpectedChanges: [] },
      { gitStatusEntries, unexpectedChanges: unexpectedHomeChanges },
      true,
      evidence,
    ),
    result(
      "operator-relays-workflow-identities",
      responseIncludesIdentities,
      "The operator reports the bundle, node, Review Request, and generated-version identities.",
      {
        slug,
        sensitiveNodeId: sensitiveConfig?.bundleNodeId,
        transitionNodeId: transitionConfig?.bundleNodeId,
        reviewRequestId: pause?.reviewRequest.reviewRequestId,
        versionId: completed?.versionId,
      },
      input.outcome.operatorFinalResponse,
    ),
  ];
}
