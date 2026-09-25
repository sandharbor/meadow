/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  acquireLocalServices,
  localServiceHolders,
  releaseLocalServices,
  setContainerStopperForTests,
} from "../src/owner.js";
import { captureCheckpoint, checkpointCompatibility, listCheckpoints, restoreCheckpoint } from "../src/checkpoints.js";
import { partitionResourceName, type LocalServiceContainer, type LocalServicePart } from "../src/parts.js";
import { hostedServiceReferences } from "../src/providerSeeding.js";

/** A part whose "container" is a directory with one folder per partition. */
function directoryPart(root: string): LocalServicePart & { starts: number } {
  let starts = 0;
  return {
    id: "files",
    displayName: "Files",
    get starts() { return starts; },
    async startContainer() {
      starts += 1;
      const endpoint = path.join(root, `container-${starts}`);
      fs.mkdirSync(endpoint, { recursive: true });
      return { containerName: `files-${starts}`, endpoint };
    },
    async isHealthy(container) { return fs.existsSync(container.endpoint); },
    async preparePartition(container, partition) {
      const directory = path.join(container.endpoint, partition);
      fs.rmSync(directory, { recursive: true, force: true });
      fs.mkdirSync(directory, { recursive: true });
    },
    async dropPartition(container, partition) {
      fs.rmSync(path.join(container.endpoint, partition), { recursive: true, force: true });
    },
    async capture(container, partition, directory) {
      const source = path.join(container.endpoint, partition);
      fs.cpSync(source, path.join(directory, "data"), { recursive: true });
      return fs.readdirSync(source).length > 0;
    },
    async restore(container, partition, directory) {
      await this.preparePartition(container, partition);
      const data = path.join(directory, "data");
      if (fs.existsSync(data)) fs.cpSync(data, path.join(container.endpoint, partition), { recursive: true });
    },
  } as LocalServicePart & { starts: number };
}

function temporaryDirectory(t: { after: (fn: () => void) => void }, prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("partition names are bucket-safe, readable, and unique when shortened", () => {
  assert.equal(partitionResourceName("meadow-e2e-2026-09-24_13-40-00-w3"), "meadow-e2e-2026-09-24-13-40-00-w3");
  const long = partitionResourceName(`meadow-fork-${"x".repeat(80)}-a`);
  const other = partitionResourceName(`meadow-fork-${"x".repeat(80)}-b`);
  assert.ok(long.length <= 63);
  assert.notEqual(long, other);
});

test("containers are shared by holders and stop only after the last live holder leaves", async t => {
  const root = temporaryDirectory(t, "meadow-local-services-owner-");
  process.env.MEADOW_LOCAL_SERVICES_DIRECTORY = path.join(root, "state");
  const stopped: LocalServiceContainer[] = [];
  setContainerStopperForTests(container => { stopped.push(container); fs.rmSync(container.endpoint, { recursive: true, force: true }); });
  const part = directoryPart(root);

  const run = await acquireLocalServices("e2e-run", { parts: [part] });
  const fork = await acquireLocalServices("dev-tools", { parts: [part] });
  assert.equal(part.starts, 1, "a healthy container is reused");
  assert.deepEqual(run.containers, fork.containers);

  await releaseLocalServices("e2e-run");
  assert.deepEqual(stopped, [], "an open fork keeps the container running");
  assert.deepEqual(localServiceHolders(), ["dev-tools"]);

  // A holder whose process died no longer keeps services alive.
  const child = spawn(process.execPath, ["-e", ""]);
  await new Promise(resolve => child.once("exit", resolve));
  await acquireLocalServices("crashed", { parts: [part], pid: child.pid! });
  await releaseLocalServices("dev-tools");
  assert.equal(stopped.length, 1);
  assert.deepEqual(localServiceHolders(), []);

  await acquireLocalServices("next", { parts: [part] });
  assert.equal(part.starts, 2, "a stopped container is started again");
  await releaseLocalServices("next");
});

test("a checkpoint restores the whole home, its repository, and each part partition", async t => {
  const root = temporaryDirectory(t, "meadow-checkpoint-");
  const part = directoryPart(root);
  const container = await part.startContainer();
  await part.preparePartition(container, "e2e-w0");
  fs.writeFileSync(path.join(container.endpoint, "e2e-w0", "published.html"), "<h1>published</h1>");

  const home = path.join(root, "home");
  fs.mkdirSync(path.join(home, "bundles/demo/raw"), { recursive: true });
  fs.mkdirSync(path.join(home, "logs"), { recursive: true });
  fs.writeFileSync(path.join(home, "meadow_home.yaml"), "formatVersion: 1\nlastWrittenByAppVersion: 0.5.41\n");
  fs.writeFileSync(path.join(home, ".gitignore"), "logs/\napp/resources.local.yaml\n");
  fs.writeFileSync(path.join(home, "bundles/demo/raw/generated.json"), "{}\n");
  fs.writeFileSync(path.join(home, "logs/meadow.log"), "noise\n");
  execFileSync("git", ["init", "--quiet"], { cwd: home });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "."], { cwd: home });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "initial Meadow Home commit"], { cwd: home });
  fs.mkdirSync(path.join(home, "app"), { recursive: true });
  fs.writeFileSync(path.join(home, "app/resources.local.yaml"), "logDirectory: /tmp/logs\n");
  fs.mkdirSync(path.join(home, "bundles/demo/config"), { recursive: true });
  fs.writeFileSync(path.join(home, "bundles/demo/config/bundle_config.yaml"), `sources:\n  - name: notes\n    directory: ${home}/source_graphs/notes\n  - name: elsewhere\n    directory: /Users/someone/notes\n`);

  const repo = path.join(root, "checkpoint-state-repo");
  const common = {
    repo, homeDirectory: home, parts: [part], containers: { files: container }, partition: "e2e-w0",
    codeRevision: "abc123", uncommittedCode: true, ports: { webServer: 4321 }, fixtureHome: "home_fixture_minimal", scenario: "demo",
    sharedObjectsDirectory: path.join(root, "checkpoint-objects"),
  };
  await captureCheckpoint({ ...common, message: "the setup is established" });
  fs.writeFileSync(path.join(home, "bundles/demo/raw/generated.json"), "{\"changed\":true}\n");
  const second = await captureCheckpoint({ ...common, message: "the change is reviewed" });

  assert.ok(fs.readdirSync(path.join(root, "checkpoint-objects")).length > 0, "objects land in the run's shared store");
  assert.deepEqual(listCheckpoints(repo).map(checkpoint => checkpoint.metadata.message), ["the setup is established", "the change is reviewed"]);
  assert.deepEqual(second.metadata.parts, [{ id: "files", displayName: "Files", hasState: true }]);
  assert.equal(second.metadata.home.formatVersion, 1);

  const restoredHome = path.join(root, "fork-home");
  await restoreCheckpoint({ repo, index: 1, homeDirectory: restoredHome, parts: [part], containers: { files: container }, partition: "fork-1" });
  assert.equal(fs.readFileSync(path.join(restoredHome, "bundles/demo/raw/generated.json"), "utf8"), "{}\n");
  assert.equal(fs.readFileSync(path.join(restoredHome, "app/resources.local.yaml"), "utf8"), "logDirectory: /tmp/logs\n", "ignored files are restored");
  assert.equal(fs.existsSync(path.join(restoredHome, "logs")), false, "logs are not state");
  assert.match(fs.readFileSync(path.join(restoredHome, "bundles/demo/config/bundle_config.yaml"), "utf8"), new RegExp(`directory: ${restoredHome}/source_graphs/notes\n[\\s\\S]*directory: /Users/someone/notes`), "isolated sources follow the home; others stay put");
  assert.equal(execFileSync("git", ["log", "--format=%s"], { cwd: restoredHome, encoding: "utf8" }).trim(), "initial Meadow Home commit");
  assert.equal(fs.readFileSync(path.join(container.endpoint, "fork-1", "published.html"), "utf8"), "<h1>published</h1>");
  await assert.rejects(
    restoreCheckpoint({ repo, index: 1, homeDirectory: restoredHome, parts: [part], containers: { files: container }, partition: "fork-2" }),
    /already exists/,
  );
});

test("checkpoints refuse homes wired to hosted services and report format compatibility", async t => {
  const root = temporaryDirectory(t, "meadow-checkpoint-guard-");
  const provider = path.join(root, "home/app/publishing_providers/MeadowPublishingProvider");
  fs.mkdirSync(provider, { recursive: true });
  fs.writeFileSync(path.join(provider, "pp_resources.local.yaml"), "meadowAuthDNSName: https://auth.example.com\nmeadowWebBaseUrl: http://localhost:3000\n");
  assert.deepEqual(hostedServiceReferences(path.join(root, "home")), ["MeadowPublishingProvider.meadowAuthDNSName = https://auth.example.com"]);
  await assert.rejects(captureCheckpoint({
    repo: path.join(root, "repo"), homeDirectory: path.join(root, "home"), parts: [], containers: {}, partition: "p",
    message: "m", codeRevision: "r", uncommittedCode: false, ports: {}, fixtureHome: "f", scenario: "s",
  }), /hosted settings/);

  const metadata = (formatVersion: number | null) => ({
    version: 1 as const, index: 1, message: "m", capturedAt: "", partition: "p", homeDirectory: "/h", parts: [],
    home: { formatVersion, lastWrittenByAppVersion: null }, codeRevision: "r", uncommittedCode: false, ports: {}, fixtureHome: "f", scenario: "s",
  });
  assert.deepEqual(checkpointCompatibility(metadata(1)), { openable: true });
  assert.deepEqual(checkpointCompatibility(metadata(0)), { openable: true, upgradeFromFormat: 0 });
  assert.equal(checkpointCompatibility(metadata(99)).openable, false);
});
