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

import type {
  AgentAdapter,
  AgentProfile,
  AgentTurnResult,
  ManagerAssessment,
  ManagerDecision,
  ManagingAgent,
  OracleResult,
  TrialEvent,
  TrialPhase,
} from "../types.js";

export type AdapterFailureKind = "timeout" | "crash" | "malformed-output" | "safety-violation";

export class AdapterFailure extends Error {
  constructor(
    readonly kind: AdapterFailureKind,
    message: string,
    readonly rawTranscript = "",
  ) {
    super(message);
  }
}

export type ScriptedStep = AgentTurnResult | AdapterFailure;

export class ScriptedAgentAdapter implements AgentAdapter {
  readonly profile: AgentProfile = {
    adapter: "scripted",
    model: "scripted-operator",
    reasoningEffort: "none",
    profileVersion: 1,
  };
  readonly version = "scripted-adapter-v1";
  private index = 0;
  private readonly transcriptLines: string[] = [];

  constructor(private readonly steps: ScriptedStep[]) {}

  start(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    return this.run(prompt, phase);
  }

  continue(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    return this.run(prompt, phase);
  }

  async stop(): Promise<void> {}

  terminalTranscript(): string {
    return this.transcriptLines.join("\n");
  }

  private async run(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    this.transcriptLines.push(`[${phase}] input: ${prompt}`);
    const step = this.steps[this.index++];
    if (!step) throw new AdapterFailure("crash", "Scripted adapter ran out of steps");
    if (step instanceof AdapterFailure) {
      this.transcriptLines.push(`[${phase}] error: ${step.kind}: ${step.message}`);
      throw step;
    }
    this.transcriptLines.push(`[${phase}] output: ${step.status}: ${step.message}`);
    return step;
  }
}

export class ScriptedManagingAgent implements ManagingAgent {
  readonly profile: AgentProfile = {
    adapter: "scripted",
    model: "scripted-manager",
    reasoningEffort: "none",
    profileVersion: 1,
  };
  readonly version = "scripted-manager-v1";

  constructor(
    private readonly decisions: ManagerDecision[] = [],
    private readonly assessment: ManagerAssessment = { summary: "Scripted assessment", evidence: [] },
  ) {}

  async initialRequest(exactRequest: string): Promise<string> {
    return exactRequest;
  }

  async answerQuestion(_input: {
    question: string;
    answerSheet: string;
    priorEvents: TrialEvent[];
  }): Promise<ManagerDecision> {
    return this.decisions.shift() ?? {
      message: "Please use the supplied source and keep the requested normal defaults.",
      assistance: "clarified",
      justification: "Restated an ordinary-user preference.",
    };
  }

  async diagnose(_input: {
    events: TrialEvent[];
    oracle: OracleResult[];
    retrospective: AgentTurnResult | null;
  }): Promise<ManagerAssessment> {
    return this.assessment;
  }

  async stop(): Promise<void> {}
}
