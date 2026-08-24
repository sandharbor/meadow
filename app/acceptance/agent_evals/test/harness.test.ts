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

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AdapterFailure,
  ScriptedAgentAdapter,
  ScriptedManagingAgent,
} from "../src/agent-evals/adapters/scriptedAdapter.js";
import { runAgentTrial } from "../src/agent-evals/runAgentTrial.js";
import { CREATE_SAFE_BUNDLE_SCENARIO } from "../src/agent-evals/scenarios/createSafeBundle.js";
import { ScriptedTrialRuntime } from "../src/agent-evals/testing/scriptedRuntime.js";
import type { AssistanceClass, ManagerDecision, OracleResult } from "../src/agent-evals/types.js";

const PASSING_ORACLE: OracleResult[] = [{
  id: "bundle-created",
  passed: true,
  summary: "Expected bundle exists",
  safety: false,
}];

const completed = (message = "Created notable-mental-models; preview: http://example.test/preview") => ({
  status: "completed" as const,
  message,
});

const retrospective = completed("Tracking terminology was the hardest part; nested help was useful.");

async function run(options: {
  operator: ScriptedAgentAdapter;
  manager?: ScriptedManagingAgent;
  oracle?: OracleResult[];
}) {
  const runtime = new ScriptedTrialRuntime(options.oracle ?? PASSING_ORACLE);
  const result = await runAgentTrial({
    scenario: CREATE_SAFE_BUNDLE_SCENARIO,
    exactRequest: "fixed request",
    answerSheet: "ordinary user facts",
    publishing: false,
    manager: options.manager ?? new ScriptedManagingAgent(),
    operator: options.operator,
    runtime,
    runId: "scripted-trial",
  });
  assert.equal(runtime.started, true);
  assert.equal(runtime.frozen, true);
  assert.equal(runtime.stopped, true);
  return result;
}

describe("agent eval harness", () => {
  test("records an independent successful frozen outcome", async () => {
    const result = await run({ operator: new ScriptedAgentAdapter([completed(), retrospective]) });
    assert.equal(result.passed, true);
    assert.equal(result.assistanceClass, "independent");
    assert.equal(result.terminationReason, "completed");
    assert.equal(result.retrospective?.message, retrospective.message);
    assert.equal(result.events.find(event => event.kind === "freeze")?.scored, true);
    assert.equal(result.events.at(-1)?.phase, "diagnostic");
  });

  for (const intervention of ["clarified", "coached", "rescued"] as const) {
    test(`classifies a ${intervention} manager intervention`, async () => {
      const decision: ManagerDecision = {
        message: `${intervention} response`,
        assistance: intervention,
        justification: `${intervention} test`,
      };
      const operator = new ScriptedAgentAdapter([
        { status: "question", message: "Should I keep the normal defaults?" },
        completed(),
        retrospective,
      ]);
      const result = await run({
        operator,
        manager: new ScriptedManagingAgent([decision]),
      });
      assert.equal(result.assistanceClass, intervention as AssistanceClass);
      assert.equal(result.metrics.clarificationTurns, intervention === "clarified" ? 1 : 0);
      assert.equal(result.metrics.coachingTurns, intervention === "coached" ? 1 : 0);
      assert.equal(result.metrics.rescueTurns, intervention === "rescued" ? 1 : 0);
      assert.equal(result.passed, intervention === "clarified");
    });
  }

  test("freezes and reports an operator timeout", async () => {
    const result = await run({
      operator: new ScriptedAgentAdapter([new AdapterFailure("timeout", "bounded timeout")]),
    });
    assert.equal(result.terminationReason, "timeout");
    assert.equal(result.assistanceClass, "failed");
    assert.equal(result.passed, false);
  });

  test("freezes and reports an operator crash", async () => {
    const result = await run({
      operator: new ScriptedAgentAdapter([new AdapterFailure("crash", "process exited 9")]),
    });
    assert.equal(result.terminationReason, "crash");
    assert.equal(result.retrospective, null);
  });

  test("freezes and reports malformed adapter output", async () => {
    const result = await run({
      operator: new ScriptedAgentAdapter([
        new AdapterFailure("malformed-output", "final response did not match schema"),
      ]),
    });
    assert.equal(result.terminationReason, "malformed-output");
    assert.equal(result.passed, false);
  });

  test("a safety oracle failure overrides an otherwise successful result", async () => {
    const result = await run({
      operator: new ScriptedAgentAdapter([completed(), retrospective]),
      oracle: [{
        id: "home-direct-write",
        passed: false,
        summary: "Detected a mutation outside the command broker",
        safety: true,
      }],
    });
    assert.equal(result.terminationReason, "safety-violation");
    assert.equal(result.safetyViolation, true);
    assert.equal(result.passed, false);
  });
});
