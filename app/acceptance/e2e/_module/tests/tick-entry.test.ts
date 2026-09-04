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
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { appendTickEntrySync } from "../../src/run/writeTickEntry.js";

function temporaryDirectory(t: TestContext): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "meadow-tick-entry-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("tick JSONL preserves metadata, full file contents, Unicode, and empty records", t => {
  const filename = path.join(temporaryDirectory(t), "ticks.jsonl");
  const entries: Parameters<typeof appendTickEntrySync>[1][] = [
    { timestamp: "first", files: ["quoted\".md"], s3Keys: [], omitted: undefined },
    {
      timestamp: "final", isSnapshot: true, extension: { nested: [null, true, 12] },
      uncommittedFileContents: { "quoted\".md": "\\\n\t雪🌻\u0000", "large.html": "<html>🌻</html>\n".repeat(100_000) },
      ignoredFileContents: { "old.html": "kept too" },
    },
    { uncommittedFileContents: {}, ignoredFileContents: { "only.md": "content" } },
    {},
  ];
  for (const entry of entries) appendTickEntrySync(filename, entry);
  const actual = readFileSync(filename, "utf8").trimEnd().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(actual, JSON.parse(JSON.stringify(entries)));
});

test("an append failure preserves earlier ticks and allows the next complete record", t => {
  const filename = path.join(temporaryDirectory(t), "ticks.jsonl");
  appendTickEntrySync(filename, { timestamp: "before" });
  const before = readFileSync(filename);
  assert.throws(() => appendTickEntrySync(filename, {
    uncommittedFileContents: { valid: "written first", invalid: 1n as unknown as string },
  }), /BigInt/);
  assert.deepEqual(readFileSync(filename), before);
  appendTickEntrySync(filename, { timestamp: "after" });
  assert.deepEqual(readFileSync(filename, "utf8").trimEnd().split("\n").map(line => JSON.parse(line)), [
    { timestamp: "before" }, { timestamp: "after" },
  ]);
});

test("final capture can write more JSON than the worker heap without a whole-record allocation", t => {
  const directory = temporaryDirectory(t);
  const script = path.join(directory, "write.mjs");
  const output = path.join(directory, "ticks.jsonl");
  writeFileSync(script, `
    import { appendTickEntrySync } from ${JSON.stringify(new URL("../../src/run/writeTickEntry.ts", import.meta.url).href)};
    const content = "x".repeat(100 * 1024);
    const files = Object.fromEntries(Array.from({ length: 900 }, (_, i) => [i + ".html", content]));
    appendTickEntrySync(process.argv[2], { timestamp: "final", uncommittedFileContents: files });
  `);
  execFileSync(process.execPath, ["--max-old-space-size=64", "--import", "tsx", script, output], {
    cwd: path.resolve(import.meta.dirname, "../.."), timeout: 30_000, stdio: "pipe",
  });
  assert.ok(statSync(output).size > 80 * 1024 * 1024);
});
