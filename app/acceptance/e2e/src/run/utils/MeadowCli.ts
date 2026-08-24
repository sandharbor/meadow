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

import { execFile, type ExecFileException } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { MEADOW_RUNTIME_SESSION_ENV } from "../../../../../contracts/types/runtime.js";
import { readRuntimeSessionDescriptor } from "../../../../../runtime/supervisor/src/sessionDescriptor.js";

const CLI_EXECUTABLE = path.resolve(
  import.meta.dirname,
  "../../../../../clients/cli/bin/meadow",
);
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const MAX_OUTPUT_BYTES = 1024 * 1024;

export interface MeadowCliArtifactOptions {
  artifactName: string;
}

interface MeadowCliCommandArtifact {
  command: "meadow";
  args: string[];
  exitCode: number | null;
  signal: string | null;
  startedAt: string;
  completedAt: string;
}

interface MeadowCliExecution {
  stdout: string;
  stderr: string;
  error: ExecFileException | null;
}

export interface MeadowCliFailure {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
}

export class MeadowCli {
  private readonly usedArtifactNames = new Set<string>();

  constructor(
    private readonly runtimeSessionPath: string,
    private readonly artifactDir: string,
  ) {}

  async run(args: string[], options: MeadowCliArtifactOptions): Promise<string> {
    return this.execute(args, options, "stdout.txt");
  }

  async runJson<T>(args: string[], options: MeadowCliArtifactOptions): Promise<T> {
    const stdout = await this.execute(args, options, "json");
    try {
      return JSON.parse(stdout) as T;
    } catch (error) {
      throw new Error(
        `The Meadow CLI did not return valid JSON for artifact ${options.artifactName}.`,
        { cause: error },
      );
    }
  }

  async runFailure(
    args: string[],
    options: MeadowCliArtifactOptions,
  ): Promise<MeadowCliFailure> {
    const result = await this.executeAndRecord(args, options, "stdout.txt");
    if (result.execution.error === null) {
      throw new Error(`Meadow CLI command unexpectedly succeeded: meadow ${args.join(" ")}`);
    }
    return {
      stdout: result.execution.stdout,
      stderr: result.execution.stderr,
      exitCode: result.exitCode,
      signal: result.execution.error.signal ?? null,
    };
  }

  private async execute(
    args: string[],
    options: MeadowCliArtifactOptions,
    stdoutExtension: "json" | "stdout.txt",
  ): Promise<string> {
    const result = await this.executeAndRecord(args, options, stdoutExtension);
    if (result.execution.error !== null) {
      const detail = result.execution.stderr.trim() || result.execution.error.message;
      throw new Error(`Meadow CLI command failed: meadow ${args.join(" ")}\n${detail}`);
    }
    return result.execution.stdout;
  }

  private async executeAndRecord(
    args: string[],
    options: MeadowCliArtifactOptions,
    stdoutExtension: "json" | "stdout.txt",
  ): Promise<{ execution: MeadowCliExecution; exitCode: number | null }> {
    this.reserveArtifactName(options.artifactName);
    const startedAt = new Date().toISOString();
    const execution = await this.exec(args);
    const completedAt = new Date().toISOString();
    const exitCode = typeof execution.error?.code === "number"
      ? execution.error.code
      : execution.error === null
        ? 0
        : null;

    writeFileSync(
      path.join(this.artifactDir, `${options.artifactName}.${stdoutExtension}`),
      execution.stdout,
      "utf8",
    );
    writeFileSync(
      path.join(this.artifactDir, `${options.artifactName}.stderr.txt`),
      execution.stderr,
      "utf8",
    );
    const commandArtifact: MeadowCliCommandArtifact = {
      command: "meadow",
      args,
      exitCode,
      signal: execution.error?.signal ?? null,
      startedAt,
      completedAt,
    };
    writeFileSync(
      path.join(this.artifactDir, `${options.artifactName}.command.json`),
      JSON.stringify(commandArtifact, null, 2),
      "utf8",
    );

    return { execution, exitCode };
  }

  private reserveArtifactName(artifactName: string): void {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artifactName)) {
      throw new Error(
        `Invalid Meadow CLI artifact name: ${artifactName}. Use lowercase words separated by hyphens.`,
      );
    }
    if (this.usedArtifactNames.has(artifactName)) {
      throw new Error(`Duplicate Meadow CLI artifact name: ${artifactName}`);
    }
    this.usedArtifactNames.add(artifactName);
  }

  private exec(args: string[]): Promise<MeadowCliExecution> {
    const descriptor = readRuntimeSessionDescriptor(this.runtimeSessionPath);
    return new Promise((resolve) => {
      execFile(
        CLI_EXECUTABLE,
        args,
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            [MEADOW_RUNTIME_SESSION_ENV]: this.runtimeSessionPath,
            MEADOW_HOME_DIRECTORY_OVERRIDE: descriptor.homeDirectory,
            MEADOW_APP_VERSION: descriptor.payload.appVersion,
            MEADOW_BUILD_PERSPECTIVE: descriptor.payload.perspective,
            MEADOW_RUNTIME_PAYLOAD_IDENTITY: descriptor.payload.identity,
          },
          maxBuffer: MAX_OUTPUT_BYTES,
        },
        (error, stdout, stderr) => {
          resolve({ error, stdout, stderr });
        },
      );
    });
  }
}
