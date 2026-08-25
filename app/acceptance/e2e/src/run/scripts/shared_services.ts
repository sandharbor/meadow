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

import { execFileSync } from "child_process";
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";

type CommandOptions = {
  cwd: string;
  captureStdout: boolean;
};

export type ServiceCommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandOptions,
) => string;

type SharedServiceOptions = {
  e2eDir: string;
  runCommand?: ServiceCommandRunner;
};

type SetupSharedServiceOptions = SharedServiceOptions & {
  workerCount: number;
};

type ServiceResult = {
  port: number;
  endpoint: string;
  containerName: string;
};

function defaultRunCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions,
): string {
  const output = execFileSync(command, [...args], {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.captureStdout
      ? ["ignore", "pipe", "inherit"]
      : ["ignore", "inherit", "inherit"],
  });
  return output ?? "";
}

function pathsFor(e2eDir: string) {
  const extensionDir = path.join(e2eDir, "src/run/meadow-extension");
  return {
    minioContainer: path.join(e2eDir, ".minio-container"),
    minioEndpoint: path.join(e2eDir, ".minio-endpoint"),
    startMinio: path.join(e2eDir, "src/run/scripts/start_minio.ts"),
    extensionSetup: path.join(extensionDir, "scripts/global_setup.ts"),
    extensionTeardown: path.join(extensionDir, "scripts/global_teardown.ts"),
  };
}

function parseServiceResult(output: string, serviceName: string): ServiceResult {
  const parsed = JSON.parse(output.trim()) as Partial<ServiceResult>;
  if (
    !Number.isInteger(parsed.port) ||
    (parsed.port ?? 0) <= 0 ||
    typeof parsed.endpoint !== "string" ||
    parsed.endpoint.length === 0 ||
    typeof parsed.containerName !== "string" ||
    parsed.containerName.length === 0
  ) {
    throw new Error(`${serviceName} setup returned an invalid service result`);
  }
  return parsed as ServiceResult;
}

function stopContainer(
  containerName: string,
  e2eDir: string,
  runCommand: ServiceCommandRunner,
): void {
  if (!containerName) return;
  try {
    runCommand("docker", ["stop", containerName], {
      cwd: e2eDir,
      captureStdout: false,
    });
  } catch {
    // The container may already be stopped or removed.
  }
}

function stopRecordedContainer(
  markerPath: string,
  e2eDir: string,
  runCommand: ServiceCommandRunner,
): void {
  if (!existsSync(markerPath)) return;
  const containerName = readFileSync(markerPath, "utf8").trim();
  stopContainer(containerName, e2eDir, runCommand);
  rmSync(markerPath, { force: true });
}

export function cleanupSharedServices({
  e2eDir,
  runCommand = defaultRunCommand,
}: SharedServiceOptions): void {
  const paths = pathsFor(e2eDir);

  stopRecordedContainer(paths.minioContainer, e2eDir, runCommand);
  rmSync(paths.minioEndpoint, { force: true });

  if (existsSync(paths.extensionTeardown)) {
    try {
      runCommand("npx", ["tsx", paths.extensionTeardown], {
        cwd: e2eDir,
        captureStdout: false,
      });
    } catch {
      // Cleanup remains best-effort so stale state cannot block the next run.
    }
  }
}

export function setupSharedServices({
  e2eDir,
  workerCount,
  runCommand = defaultRunCommand,
}: SetupSharedServiceOptions): void {
  const paths = pathsFor(e2eDir);
  cleanupSharedServices({ e2eDir, runCommand });

  let minio: ServiceResult | undefined;
  try {
    minio = parseServiceResult(
      runCommand("npx", ["tsx", paths.startMinio, String(workerCount)], {
        cwd: e2eDir,
        captureStdout: true,
      }),
      "MinIO",
    );

    if (existsSync(paths.extensionSetup)) {
      runCommand("npx", ["tsx", paths.extensionSetup, String(workerCount)], {
        cwd: e2eDir,
        captureStdout: false,
      });
    }

    // These markers are the readiness boundary. Do not publish them until
    // every mounted service has completed setup successfully.
    writeFileSync(paths.minioEndpoint, minio.endpoint, "utf8");
    writeFileSync(paths.minioContainer, minio.containerName, "utf8");
  } catch (error) {
    if (minio) stopContainer(minio.containerName, e2eDir, runCommand);
    cleanupSharedServices({ e2eDir, runCommand });
    throw error;
  }
}
