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

import { randomUUID } from "crypto";
import { AdapterFailure } from "./adapters/scriptedAdapter.js";
import type {
  AgentAdapter,
  AgentEvalScenario,
  AgentTrialResult,
  AgentUsage,
  AssistanceClass,
  FrozenOutcome,
  ManagerAssessment,
  ManagingAgent,
  OracleResult,
  TerminationReason,
  TrialEvent,
  TrialRuntime,
} from "./types.js";

const RETROSPECTIVE_PROMPT = [
  "The scored task is frozen. Please answer this retrospective without running commands:",
  "1. Which part of the task was hardest to translate into Meadow commands?",
  "2. Which help or error output was useful or misleading?",
  "3. What did you have to guess?",
  "4. What one CLI or documentation change would have helped most?",
].join("\n");

function now(): string {
  return new Date().toISOString();
}

function event(
  events: TrialEvent[],
  phase: TrialEvent["phase"],
  actor: TrialEvent["actor"],
  kind: TrialEvent["kind"],
  text: string,
  scored: boolean,
): void {
  events.push({ id: `event-${events.length + 1}`, timestamp: now(), phase, actor, kind, text, scored });
}

function strongestAssistance(current: AssistanceClass, candidate: AssistanceClass): AssistanceClass {
  const rank: Record<AssistanceClass, number> = {
    independent: 0,
    clarified: 1,
    coached: 2,
    rescued: 3,
    failed: 4,
  };
  return rank[candidate] > rank[current] ? candidate : current;
}

function failureFrom(error: unknown): TerminationReason {
  if (error instanceof AdapterFailure) return error.kind;
  return "crash";
}

const EMPTY_USAGE: AgentUsage = {
  turns: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  maxIdleMs: 0,
};

export async function runAgentTrial(input: {
  scenario: AgentEvalScenario;
  exactRequest: string;
  answerSheet: string;
  publishing: boolean;
  manager: ManagingAgent;
  operator: AgentAdapter;
  runtime: TrialRuntime;
  runId?: string;
}): Promise<AgentTrialResult> {
  const startedAt = now();
  const events: TrialEvent[] = [];
  let terminationReason: TerminationReason = "completed";
  let assistanceClass: AssistanceClass = "independent";
  let operatorFinalResponse = "";
  let outcome: FrozenOutcome | null = null;
  let oracle: OracleResult[] = [];
  let retrospective = null;
  let assessment: ManagerAssessment | null = null;
  let clarificationTurns = 0;
  let coachingTurns = 0;
  let rescueTurns = 0;
  let operatorTurns = 0;

  try {
    await input.runtime.start();
    const deliveredRequest = await input.manager.initialRequest(input.exactRequest);
    if (deliveredRequest !== input.exactRequest) {
      throw new AdapterFailure(
        "malformed-output",
        "Manager did not deliver the scenario request verbatim",
      );
    }
    event(events, "autonomous", "manager", "message", deliveredRequest, true);

    let result = await input.operator.start(deliveredRequest, "autonomous");
    operatorTurns++;
    event(events, "autonomous", "operator", "message", result.message, true);
    while (result.status === "question" && operatorTurns < input.scenario.limits.operatorTurns) {
      const decision = await input.manager.answerQuestion({
        question: result.message,
        answerSheet: input.answerSheet,
        priorEvents: events,
      });
      if (decision.assistance === "clarified") clarificationTurns++;
      if (decision.assistance === "coached") coachingTurns++;
      if (decision.assistance === "rescued") rescueTurns++;
      if (decision.assistance !== "none") {
        assistanceClass = strongestAssistance(assistanceClass, decision.assistance);
      }
      event(
        events,
        "autonomous",
        "manager",
        "intervention",
        `${decision.message}\nJustification: ${decision.justification}`,
        true,
      );
      result = await input.operator.continue(decision.message, "autonomous");
      operatorTurns++;
      event(events, "autonomous", "operator", "message", result.message, true);
    }
    if (result.status === "question") {
      throw new AdapterFailure("timeout", "Operator exhausted the scored turn bound");
    }
    operatorFinalResponse = result.message;
    if (result.status === "gave-up") terminationReason = "gave-up";
  } catch (error) {
    terminationReason = failureFrom(error);
    operatorFinalResponse = error instanceof Error ? error.message : String(error);
    assistanceClass = "failed";
    event(events, "autonomous", "harness", "termination", operatorFinalResponse, true);
  }

  try {
    try {
      outcome = await input.runtime.freeze(operatorFinalResponse);
      event(events, "frozen", "harness", "freeze", "Scored state captured.", true);
      oracle = await input.runtime.evaluate(outcome);
    } catch (error) {
      if (terminationReason === "completed") terminationReason = "crash";
      assistanceClass = "failed";
      oracle = [{
        id: "harness-outcome-capture",
        passed: false,
        summary: `Harness could not capture or evaluate the frozen outcome: ${error instanceof Error ? error.message : String(error)}`,
        safety: false,
      }];
      event(events, "frozen", "harness", "termination", oracle[0].summary, true);
    }
    const safetyViolation = oracle.some(result => result.safety && !result.passed);
    if (safetyViolation) {
      terminationReason = "safety-violation";
      assistanceClass = "failed";
    }

    if (terminationReason !== "crash" && terminationReason !== "malformed-output") {
      try {
        event(events, "retrospective", "manager", "message", RETROSPECTIVE_PROMPT, false);
        retrospective = await input.operator.continue(RETROSPECTIVE_PROMPT, "retrospective");
        event(events, "retrospective", "operator", "message", retrospective.message, false);
      } catch (error) {
        event(
          events,
          "retrospective",
          "harness",
          "termination",
          `Retrospective unavailable: ${error instanceof Error ? error.message : String(error)}`,
          false,
        );
      }
    }
    try {
      assessment = await input.manager.diagnose({ events, oracle, retrospective });
      event(events, "diagnostic", "manager", "message", assessment.summary, false);
    } catch (error) {
      event(
        events,
        "diagnostic",
        "harness",
        "termination",
        `Manager diagnosis unavailable: ${error instanceof Error ? error.message : String(error)}`,
        false,
      );
    }
  } finally {
    await Promise.allSettled([input.operator.stop(), input.manager.stop(), input.runtime.stop()]);
  }

  const finishedAt = now();
  const commands = outcome?.commands ?? [];
  const safetyViolation = oracle.some(result => result.safety && !result.passed);
  const oraclePassed = oracle.length > 0 && oracle.every(result => result.passed);
  const autonomouslyUsable = assistanceClass === "independent" || assistanceClass === "clarified";
  const passed = terminationReason === "completed" && oraclePassed && autonomouslyUsable;
  if (!passed && assistanceClass === "independent") assistanceClass = "failed";
  const commandKeys = commands.map(command => JSON.stringify(command.args));
  const uniqueCommandKeys = new Set(commandKeys);
  const operatorUsage = input.operator.usageSummary?.() ?? EMPTY_USAGE;
  const managerUsage = input.manager.usageSummary?.() ?? EMPTY_USAGE;

  return {
    schemaVersion: 1,
    kind: "agent-eval",
    runId: input.runId ?? randomUUID(),
    scenario: {
      id: input.scenario.id,
      version: input.scenario.version,
      publishing: input.publishing,
    },
    profiles: { manager: input.manager.profile, operator: input.operator.profile },
    startedAt,
    finishedAt,
    terminationReason,
    assistanceClass,
    passed,
    safetyViolation,
    events,
    commands,
    oracle,
    operatorFinalResponse,
    retrospective,
    assessment,
    metrics: {
      operatorTurns,
      clarificationTurns,
      coachingTurns,
      rescueTurns,
      commandsAttempted: commands.length,
      failedCommands: commands.filter(command => command.exitCode !== 0).length,
      helpInvocations: commands.filter(command => command.args.includes("--help") || command.args.includes("-h")).length,
      retries: commandKeys.length - uniqueCommandKeys.size,
      elapsedMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      idleMs: Math.max(operatorUsage.maxIdleMs, managerUsage.maxIdleMs),
      tokens: {
        operator: {
          turns: operatorUsage.turns,
          inputTokens: operatorUsage.inputTokens,
          cachedInputTokens: operatorUsage.cachedInputTokens,
          outputTokens: operatorUsage.outputTokens,
        },
        manager: {
          turns: managerUsage.turns,
          inputTokens: managerUsage.inputTokens,
          cachedInputTokens: managerUsage.cachedInputTokens,
          outputTokens: managerUsage.outputTokens,
        },
      },
      monetaryCostUsd: null,
    },
  };
}
