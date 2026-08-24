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

import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AgentProfile,
  AgentTurnResult,
  AgentUsage,
  ManagerAssessment,
  ManagerDecision,
  ManagingAgent,
  OracleResult,
  TrialEvent,
} from "../types.js";
import { CodexProcess } from "./codexProcess.js";

export const MANAGER_PROMPT_VERSION = 1;

interface ManagerEnvelope {
  kind: "initial" | "question-response" | "diagnosis";
  message: string;
  assistance: "none" | "clarified" | "coached" | "rescued";
  justification: string;
  summary: string;
  evidence: Array<{ eventId: string; interpretation: string }>;
  smallestMissingClue: string | null;
}

const MANAGER_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "message",
    "assistance",
    "justification",
    "summary",
    "evidence",
    "smallestMissingClue",
  ],
  properties: {
    kind: { type: "string", enum: ["initial", "question-response", "diagnosis"] },
    message: { type: "string" },
    assistance: { type: "string", enum: ["none", "clarified", "coached", "rescued"] },
    justification: { type: "string" },
    summary: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["eventId", "interpretation"],
        properties: {
          eventId: { type: "string" },
          interpretation: { type: "string" },
        },
      },
    },
    smallestMissingClue: { type: ["string", "null"] },
  },
};

export class CodexManagingAgent implements ManagingAgent {
  readonly profile: AgentProfile;
  readonly version = "codex-manager-adapter-v1";
  private readonly runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "meadow-codex-manager-"));
  private readonly workingDirectory = path.join(this.runtimeRoot, "workdir");
  private readonly process: CodexProcess<ManagerEnvelope>;
  private initialPrompt = "";

  constructor(profile: AgentProfile, limits: { timeoutMs: number; idleMs: number }) {
    this.profile = profile;
    mkdirSync(this.workingDirectory, { recursive: true, mode: 0o700 });
    this.process = new CodexProcess<ManagerEnvelope>({
      runtimeRoot: this.runtimeRoot,
      workingDirectory: this.workingDirectory,
      model: profile.model,
      reasoningEffort: profile.reasoningEffort,
      outputSchema: MANAGER_OUTPUT_SCHEMA,
      permissionProfileName: "meadow_manager",
      filesystemPermissions: { [this.workingDirectory]: "read" },
      shellEnvironment: {
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        HOME: this.workingDirectory,
        TMPDIR: this.workingDirectory,
        LANG: "en_US.UTF-8",
      },
      timeoutMs: limits.timeoutMs,
      idleMs: limits.idleMs,
    });
  }

  async initialRequest(exactRequest: string): Promise<string> {
    this.initialPrompt = [
      `You are the fixed managing agent for a command-line usability trial. Manager prompt version ${MANAGER_PROMPT_VERSION}.`,
      "Deliver the exact request below verbatim to the operator. Do not add a preface, procedural advice, command names, or a reformulation.",
      "Return kind=initial, message equal to the exact request byte-for-byte, assistance=none, a short justification, an empty summary, empty evidence, and null smallestMissingClue.",
      "",
      "<exact-request>",
      exactRequest,
      "</exact-request>",
    ].join("\n");
    const output = await this.process.start(this.initialPrompt);
    return output.value.message;
  }

  async answerQuestion(input: {
    question: string;
    answerSheet: string;
    priorEvents: TrialEvent[];
  }): Promise<ManagerDecision> {
    const prompt = [
      "The operator asked a question during the scored autonomous phase.",
      "Answer only with ordinary-user facts present in the answer sheet. You may restate intent or direct the operator to the CLI's own help without naming a subcommand.",
      "Do not translate intent into Meadow terminology, name a command or flags, suggest an ordered procedure, or reveal oracle facts.",
      "Classify your answer: clarified for only user facts/restated intent; coached if it adds a discovery strategy or semantic operation; rescued if it names commands, flags, or a recipe; none if no response is needed.",
      "Return kind=question-response, the answer in message, the classification in assistance, and a concrete justification. Keep diagnostic fields empty.",
      "",
      `<question>${input.question}</question>`,
      `<answer-sheet>\n${input.answerSheet}\n</answer-sheet>`,
      `<prior-events>\n${JSON.stringify(input.priorEvents)}\n</prior-events>`,
    ].join("\n");
    const output = await this.process.resume(prompt);
    return {
      message: output.value.message,
      assistance: output.value.assistance,
      justification: output.value.justification,
    };
  }

  async diagnose(input: {
    events: TrialEvent[];
    oracle: OracleResult[];
    retrospective: AgentTurnResult | null;
  }): Promise<ManagerAssessment> {
    const prompt = [
      "The scored phase is frozen and its result cannot change. Produce an evidence-linked qualitative diagnosis.",
      "Separate what the transcript directly establishes from your interpretation. Use only event IDs that exist below. Identify the smallest missing clue when the trial failed or needed assistance.",
      "Return kind=diagnosis, a concise summary, evidence entries, and smallestMissingClue (null if none). Set message to the same summary, assistance=none, and give a short justification.",
      "",
      `<events>\n${JSON.stringify(input.events)}\n</events>`,
      `<oracle>\n${JSON.stringify(input.oracle)}\n</oracle>`,
      `<retrospective>\n${JSON.stringify(input.retrospective)}\n</retrospective>`,
    ].join("\n");
    const output = await this.process.resume(prompt);
    return {
      summary: output.value.summary || output.value.message,
      evidence: output.value.evidence,
      ...(output.value.smallestMissingClue
        ? { smallestMissingClue: output.value.smallestMissingClue }
        : {}),
    };
  }

  async stop(): Promise<void> {
    this.process.stop();
  }

  initialManagerPrompt(): string {
    return this.initialPrompt;
  }

  terminalTranscript(): string {
    return this.process.transcript();
  }

  usageSummary(): AgentUsage {
    return this.process.usageSummary();
  }
}
