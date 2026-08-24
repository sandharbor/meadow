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

import { describe, expect, it } from "vitest";
import {
  DevRuntimeManager,
  type DevRuntimePaneLaunch,
} from "../../tooling/dev_tools/src/server/devRuntimeManager.js";
import { hasChildProcessExited } from "../../electron_app/src/childProcessState.js";
import type { LocalRuntimeSession } from "../../shared_code/utils/localRuntimeSession.js";

const runtimeSession: LocalRuntimeSession = {
  schemaVersion: 1,
  protocol: "meadow-local-v1",
  homeDirectory: "/tmp/Meadow Home",
  ownerPid: 0,
  backendPort: 41001,
  frontendPort: 41002,
  backendUrl: "http://127.0.0.1:41001/api",
  frontendUrl: "http://127.0.0.1:41002/",
  frontendOrigin: "http://127.0.0.1:41002",
  capability: "test-capability",
  createdAt: "2026-08-18T00:00:00.000Z",
};

function createManager(options: {
  frontendInitiallyReady: boolean;
  launches: DevRuntimePaneLaunch[];
}): DevRuntimeManager {
  let backendReady = false;
  let frontendReady = options.frontendInitiallyReady;

  return new DevRuntimeManager({
    tmuxSession: "meadow_dev_test",
    projectRoot: "/tmp/meadow",
    configDirectory: runtimeSession.homeDirectory,
    appVersion: "0.5.41",
    runtimeSessionPath: "/tmp/meadow-runtime/session.json",
    runtimeSession,
    respawnPane: launch => {
      options.launches.push(launch);
      if (launch.target.endsWith(":backend")) backendReady = true;
      if (launch.target.endsWith(":frontend")) frontendReady = true;
      return Promise.resolve();
    },
    healthCheck: url => {
      if (url === `${runtimeSession.backendUrl}/health`) return Promise.resolve(backendReady);
      if (url === runtimeSession.frontendUrl) return Promise.resolve(frontendReady);
      return Promise.resolve(false);
    },
    delay: () => Promise.resolve(),
  });
}

describe("development runtime startup", () => {
  it("starts both services lazily on the first kickoff", async () => {
    const launches: DevRuntimePaneLaunch[] = [];
    const manager = createManager({ frontendInitiallyReady: false, launches });

    await manager.prepareForLaunch();

    expect(launches.map(launch => launch.target)).toEqual([
      "meadow_dev_test:backend",
      "meadow_dev_test:frontend",
    ]);
    expect(launches[0].command).toContain("'MEADOW_HOME_DIRECTORY_OVERRIDE=/tmp/Meadow Home'");
    expect(launches[0].command).toContain(
      "'MEADOW_STARTUP_DIAGNOSTIC_PATH=/tmp/meadow-runtime/startup-failure.json'",
    );
    expect(launches[0].command).toContain("'tsx' 'src/shared/app-shell/index.ts'");
    expect(launches[1].command).toContain("'npx' 'vite'");
  });

  it("restarts the backend while retaining a healthy frontend", async () => {
    const launches: DevRuntimePaneLaunch[] = [];
    const manager = createManager({ frontendInitiallyReady: true, launches });

    await manager.prepareForLaunch();

    expect(launches.map(launch => launch.target)).toEqual([
      "meadow_dev_test:backend",
    ]);
  });

  it("lets Electron own the readiness wait after starting the services", async () => {
    const launches: DevRuntimePaneLaunch[] = [];
    const manager = new DevRuntimeManager({
      tmuxSession: "meadow_dev_test",
      projectRoot: "/tmp/meadow",
      configDirectory: runtimeSession.homeDirectory,
      appVersion: "0.5.41",
      runtimeSessionPath: "/tmp/meadow-runtime-system-test/session.json",
      runtimeSession,
      respawnPane: launch => {
        launches.push(launch);
        return Promise.resolve();
      },
      healthCheck: () => Promise.resolve(false),
      delay: () => Promise.reject(new Error("readiness wait should be skipped")),
    });

    await manager.prepareForLaunch({ waitForReady: false });

    expect(launches.map(launch => launch.target)).toEqual([
      "meadow_dev_test:backend",
      "meadow_dev_test:frontend",
    ]);
  });

  it("does not mistake an externally managed backend for an exited child", () => {
    expect(hasChildProcessExited(null)).toBe(false);
    expect(hasChildProcessExited({ exitCode: null })).toBe(false);
    expect(hasChildProcessExited({ exitCode: 0 })).toBe(true);
  });
});
