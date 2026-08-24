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
  FrozenOutcome,
  MeadowCommandRecord,
  OracleResult,
  TrialRuntime,
} from "../types.js";

export class ScriptedTrialRuntime implements TrialRuntime {
  started = false;
  frozen = false;
  stopped = false;

  constructor(
    private readonly oracle: OracleResult[],
    private readonly commands: MeadowCommandRecord[] = [],
  ) {}

  async start(): Promise<void> {
    this.started = true;
  }

  async freeze(operatorFinalResponse: string): Promise<FrozenOutcome> {
    this.frozen = true;
    return {
      capturedAt: new Date().toISOString(),
      operatorFinalResponse,
      commands: this.commands,
    };
  }

  async evaluate(_outcome: FrozenOutcome): Promise<OracleResult[]> {
    return this.oracle;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }
}
