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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  setupSharedServices,
  type ServiceCommandRunner,
} from "../../src/run/scripts/shared_services.js";

test("partial extension setup rolls back all services and retries cleanly", () => {
  const e2eDir = mkdtempSync(path.join(tmpdir(), "meadow-shared-services-"));
  const scriptsDir = path.join(e2eDir, "src/run/scripts");
  const extensionScriptsDir = path.join(
    e2eDir,
    "src/run/meadow-extension/scripts",
  );
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(extensionScriptsDir, { recursive: true });

  const startMinio = path.join(scriptsDir, "start_minio.ts");
  const extensionSetup = path.join(extensionScriptsDir, "global_setup.ts");
  const extensionTeardown = path.join(extensionScriptsDir, "global_teardown.ts");
  for (const script of [startMinio, extensionSetup, extensionTeardown]) {
    writeFileSync(script, "// test fixture\n", "utf8");
  }

  const minioContainer = path.join(e2eDir, ".minio-container");
  const minioEndpoint = path.join(e2eDir, ".minio-endpoint");
  const extensionDir = path.dirname(extensionScriptsDir);
  const extensionContainer = path.join(extensionDir, ".test-service-container");
  const extensionEndpoint = path.join(extensionDir, ".test-service-endpoint");
  const stoppedContainers: string[] = [];
  let extensionShouldFail = true;
  let minioStartCount = 0;

  const runCommand: ServiceCommandRunner = (command, args) => {
    if (command === "docker" && args[0] === "stop") {
      stoppedContainers.push(args[1]);
      return "";
    }

    const script = args[1];
    if (script === startMinio) {
      minioStartCount += 1;
      return JSON.stringify({
        port: 49100 + minioStartCount,
        endpoint: `http://localhost:${49100 + minioStartCount}`,
        containerName: `test-minio-${minioStartCount}`,
      });
    }

    if (script === extensionSetup) {
      assert.equal(
        existsSync(minioContainer),
        false,
        "readiness marker must not exist while extension setup is incomplete",
      );
      writeFileSync(extensionContainer, "test-extension-service", "utf8");
      writeFileSync(extensionEndpoint, "http://localhost:49200", "utf8");
      if (extensionShouldFail) throw new Error("injected extension failure");
      return "";
    }

    if (script === extensionTeardown) {
      rmSync(extensionContainer, { force: true });
      rmSync(extensionEndpoint, { force: true });
      return "";
    }

    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };

  try {
    assert.throws(
      () => setupSharedServices({ e2eDir, workerCount: 8, runCommand }),
      /injected extension failure/,
    );
    assert.equal(existsSync(minioContainer), false);
    assert.equal(existsSync(minioEndpoint), false);
    assert.equal(existsSync(extensionContainer), false);
    assert.equal(existsSync(extensionEndpoint), false);
    assert.deepEqual(stoppedContainers, ["test-minio-1"]);

    extensionShouldFail = false;
    setupSharedServices({ e2eDir, workerCount: 8, runCommand });

    assert.equal(minioStartCount, 2, "retry must start fresh services");
    assert.equal(readFileSync(minioContainer, "utf8"), "test-minio-2");
    assert.equal(readFileSync(minioEndpoint, "utf8"), "http://localhost:49102");
    assert.equal(
      readFileSync(extensionContainer, "utf8"),
      "test-extension-service",
    );
    assert.equal(
      readFileSync(extensionEndpoint, "utf8"),
      "http://localhost:49200",
    );
  } finally {
    rmSync(e2eDir, { recursive: true, force: true });
  }
});
