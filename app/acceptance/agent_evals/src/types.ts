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

export const AGENT_EVAL_SCHEMA_VERSION = 1 as const;

export type TrialPhase = "autonomous" | "frozen" | "retrospective" | "diagnostic";
export type AssistanceClass = "independent" | "clarified" | "coached" | "rescued" | "failed";
export type TerminationReason =
  | "completed"
  | "gave-up"
  | "timeout"
  | "crash"
  | "malformed-output"
  | "safety-violation";

export interface AgentProfile {
  adapter: "codex" | "scripted";
  model: string;
  reasoningEffort: string;
  profileVersion: number;
}

export interface AgentEvalScenario {
  schemaVersion: typeof AGENT_EVAL_SCHEMA_VERSION;
  id: string;
  version: number;
  title: string;
  baseRequestTemplate: string;
  publishingRequestAddition: string;
  entryPage: string;
  inferredSlug: string;
  defaults: { outlinksDepth: number; inlinksDepth: number };
  expected: {
    newlyTracked: string[];
    alreadyTracked: string[];
    sensitiveSkipped: string[];
    trackedButNotGenerated: string[];
    generatedPages: string[];
    generatedContentAssets: string[];
  };
  profiles: { manager: AgentProfile; operator: AgentProfile };
  limits: { operatorTurns: number; durationMs: number; idleMs: number };
}

export interface AgentTurnResult {
  status: "completed" | "question" | "gave-up";
  message: string;
  threadId?: string;
  usage?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number };
  rawEvents?: unknown[];
}

export interface AgentUsage {
  turns: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  maxIdleMs: number;
}

export interface OperatorTurn {
  prompt: string;
  phase: TrialPhase;
  startedAt: string;
  finishedAt: string;
  result?: AgentTurnResult;
  error?: { kind: "timeout" | "crash" | "malformed-output"; message: string };
}

export interface AgentAdapter {
  readonly profile: AgentProfile;
  readonly version: string;
  start(prompt: string, phase: TrialPhase): Promise<AgentTurnResult>;
  continue(prompt: string, phase: TrialPhase): Promise<AgentTurnResult>;
  stop(): Promise<void>;
  terminalTranscript(): string;
  usageSummary?(): AgentUsage;
}

export interface ManagerDecision {
  message: string;
  assistance: Exclude<AssistanceClass, "independent" | "failed"> | "none";
  justification: string;
}

export interface ManagerAssessment {
  summary: string;
  evidence: Array<{ eventId: string; interpretation: string }>;
  smallestMissingClue?: string;
}

export interface ManagingAgent {
  readonly profile: AgentProfile;
  readonly version: string;
  initialRequest(exactRequest: string): Promise<string>;
  answerQuestion(input: {
    question: string;
    answerSheet: string;
    priorEvents: TrialEvent[];
  }): Promise<ManagerDecision>;
  diagnose(input: {
    events: TrialEvent[];
    oracle: OracleResult[];
    retrospective: AgentTurnResult | null;
  }): Promise<ManagerAssessment>;
  stop(): Promise<void>;
  terminalTranscript?(): string;
  usageSummary?(): AgentUsage;
}

export interface TrialEvent {
  id: string;
  timestamp: string;
  phase: TrialPhase;
  actor: "manager" | "operator" | "harness";
  kind: "message" | "command" | "intervention" | "freeze" | "termination";
  text: string;
  scored: boolean;
}

export interface MeadowCommandRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  phase: TrialPhase;
}

export interface OracleResult {
  id: string;
  passed: boolean;
  summary: string;
  expected?: unknown;
  actual?: unknown;
  evidenceFiles?: string[];
  safety: boolean;
}

export interface FrozenOutcome {
  capturedAt: string;
  operatorFinalResponse: string;
  commands: MeadowCommandRecord[];
  stateSnapshotPath?: string;
  generatedEvidencePaths?: string[];
  publishedEvidencePaths?: string[];
}

export interface TrialRuntime {
  start(): Promise<void>;
  freeze(operatorFinalResponse: string): Promise<FrozenOutcome>;
  evaluate(outcome: FrozenOutcome): Promise<OracleResult[]>;
  stop(): Promise<void>;
}

export interface TrialRuntimeExtensionContext {
  artifactDirectory: string;
  homeDirectory: string;
  sourceDirectory: string;
  scenario: AgentEvalScenario;
}

/** Optional composed behavior layered onto the standalone trial lifecycle. */
export interface TrialRuntimeExtension {
  readonly id: string;
  readonly version: number;
  prepare(context: TrialRuntimeExtensionContext): Promise<{
    backendEnvironment?: Record<string, string>;
  }>;
  capture?(
    outcome: FrozenOutcome,
    context: TrialRuntimeExtensionContext,
  ): Promise<{ publishedEvidencePaths?: string[] }>;
  evaluate?(
    outcome: FrozenOutcome,
    context: TrialRuntimeExtensionContext,
  ): Promise<OracleResult[]>;
  stop(): Promise<void>;
}

export interface TrialRuntimeExtensionModule {
  createTrialRuntimeExtension(): TrialRuntimeExtension;
}

export interface AgentTrialResult {
  schemaVersion: typeof AGENT_EVAL_SCHEMA_VERSION;
  kind: "agent-eval";
  runId: string;
  scenario: { id: string; version: number; publishing: boolean };
  profiles: { manager: AgentProfile; operator: AgentProfile };
  startedAt: string;
  finishedAt: string;
  terminationReason: TerminationReason;
  assistanceClass: AssistanceClass;
  passed: boolean;
  safetyViolation: boolean;
  events: TrialEvent[];
  commands: MeadowCommandRecord[];
  oracle: OracleResult[];
  operatorFinalResponse: string;
  retrospective: AgentTurnResult | null;
  assessment: ManagerAssessment | null;
  metrics: {
    operatorTurns: number;
    clarificationTurns: number;
    coachingTurns: number;
    rescueTurns: number;
    commandsAttempted: number;
    failedCommands: number;
    helpInvocations: number;
    retries: number;
    elapsedMs: number;
    idleMs: number;
    tokens: {
      operator: Omit<AgentUsage, "maxIdleMs">;
      manager: Omit<AgentUsage, "maxIdleMs">;
    };
    monetaryCostUsd: number | null;
  };
}
