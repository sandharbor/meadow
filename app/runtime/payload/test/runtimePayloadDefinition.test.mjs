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
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RUNTIME_NATIVE_COMPONENTS,
  RUNTIME_NODE_PAYLOAD_PATH,
  RUNTIME_PAYLOAD_CRITICAL_FILES,
  RUNTIME_PAYLOAD_EXECUTABLE_PATHS,
} from "../src/runtimePayloadDefinition.mjs";

const desktopPackage = JSON.parse(readFileSync(
  new URL("../../../hosts/desktop/package.json", import.meta.url),
  "utf8",
));

test("Runtime Payload executable inventory has one canonical mapping", () => {
  const nativePayloadPaths = RUNTIME_NATIVE_COMPONENTS.map(component => component.payloadPath);
  assert.deepEqual(
    RUNTIME_PAYLOAD_EXECUTABLE_PATHS,
    [RUNTIME_NODE_PAYLOAD_PATH, ...nativePayloadPaths],
  );
  assert.equal(
    new Set(RUNTIME_PAYLOAD_EXECUTABLE_PATHS).size,
    RUNTIME_PAYLOAD_EXECUTABLE_PATHS.length,
  );
  assert.equal(
    RUNTIME_PAYLOAD_EXECUTABLE_PATHS.every(file => RUNTIME_PAYLOAD_CRITICAL_FILES.includes(file)),
    true,
  );
  assert.equal(
    RUNTIME_NATIVE_COMPONENTS.every(component => (
      component.payloadPath.endsWith(`/${component.executableName}`)
    )),
    true,
  );
});

test("Desktop signing defers exactly the Runtime Payload executable inventory", () => {
  const signIgnore = desktopPackage.build.mac.signIgnore.map(pattern => new RegExp(pattern));
  const packagedPath = relativePath => (
    `/tmp/Meadow.app/Contents/Resources/runtime-payload/${relativePath}`
  );
  const deferredCriticalFiles = RUNTIME_PAYLOAD_CRITICAL_FILES.filter(relativePath => (
    signIgnore.some(pattern => pattern.test(packagedPath(relativePath)))
  ));

  assert.deepEqual(deferredCriticalFiles, RUNTIME_PAYLOAD_EXECUTABLE_PATHS);
});
