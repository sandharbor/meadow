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
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import {
  findOwnedDevAppProcessGroups,
  parseProcessTable,
} from "./devAppProcessManager.js";

test("parses process-group leaders from the process table", () => {
  assert.deepEqual(
    parseProcessTable("  101   101 npm run electron-dev   \n  102   101 node child.js\n"),
    [
      { pid: 101, processGroupId: 101, command: "npm run electron-dev" },
      { pid: 102, processGroupId: 101, command: "node child.js" },
    ],
  );
});

test("selects only electron-dev groups owned by this checkout", () => {
  const checkout = realpathSync(mkdtempSync(join(tmpdir(), "meadow-dev-owner-")));
  const otherCheckout = realpathSync(mkdtempSync(join(tmpdir(), "meadow-dev-other-")));
  const cwdByPid = new Map([
    [101, checkout],
    [201, otherCheckout],
    [301, checkout],
  ]);

  const groups = findOwnedDevAppProcessGroups(
    [
      { pid: 101, processGroupId: 101, command: "npm run electron-dev" },
      { pid: 102, processGroupId: 101, command: "node child.js" },
      { pid: 201, processGroupId: 201, command: "npm run electron-dev" },
      { pid: 301, processGroupId: 301, command: "npm run something-else" },
    ],
    checkout,
    pid => cwdByPid.get(pid) ?? null,
  );

  assert.deepEqual(groups, [101]);
});

test("electron-dev stops its build watcher when Electron exits", () => {
  const serverDirectory = fileURLToPath(new URL(".", import.meta.url));
  const desktopPackage = JSON.parse(readFileSync(
    join(serverDirectory, "../../../../hosts/desktop/package.json"),
    "utf8",
  )) as { scripts?: { "electron-dev"?: unknown } };

  assert.match(String(desktopPackage.scripts?.["electron-dev"]), /concurrently --kill-others /);
});
