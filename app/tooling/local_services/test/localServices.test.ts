/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sourceConfigFingerprint, sourceInventory } from "../../../shared_code/utils/sourceSnapshotFingerprint.js";
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

  const bundle = path.join(home, "bundles/demo");
  const sources = [{ id: "source000001", name: "notes", directory: `${home}/source_graphs/notes` }];
  const inventory = sourceInventory({ "_mw_sources/source000001/a.md": { digest: "file-digest", size: 4 } }, ["_mw_sources/source000001"], sources);
  const snapshots = path.join(bundle, "raw/sourcing/snapshots");
  for (const [id, fingerprint] of [["accepted", undefined], ["pending", sourceConfigFingerprint(bundle)], ["stale", "stale-fingerprint"]] as const) {
    fs.mkdirSync(path.join(snapshots, id), { recursive: true });
    fs.writeFileSync(path.join(snapshots, id, "snapshot.json"), JSON.stringify({ id, sources, ...inventory,
      ...(fingerprint && { sourceProposal: { sources, baseConfigFingerprint: fingerprint } }) }));
  }

  const proposalConfiguration = { bundle: { sources, sourceDirectory: `${home}/source_graphs/notes` }, nodes: [] };
  fs.writeFileSync(path.join(bundle, 'raw/sourcing/proposal.json'), JSON.stringify({
    original: proposalConfiguration, proposed: proposalConfiguration,
    resolutions: [{ path: ['bundle', 'sources', 'source000001'], original: sources[0], saved: { ...sources[0], directory: '/Users/someone/notes' }, proposed: sources[0] }],
  }));
  const editorView = { version: 1 as const,
    local: { 'meadow.editor-view.v1:demo:curation:activeView': '"list"', 'meadow.editor-view.v1:demo:sourcing:selection': '{"selected":["file:a.md"],"collapsed":true}' },
    session: { 'sourceProposalPendingEdit:demo': JSON.stringify(proposalConfiguration) },
  };
  const repo = path.join(root, "checkpoint-state-repo");
  const common = {
    repo, homeDirectory: home, parts: [part], containers: { files: container }, partition: "e2e-w0",
    codeRevision: "abc123", uncommittedCode: true, ports: { webServer: 4321 }, fixtureHome: "home_fixture_minimal", scenario: "demo",
    sharedObjectsDirectory: path.join(root, "checkpoint-objects"), editorView,
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
  const restoredBundle = path.join(restoredHome, "bundles/demo");
  const restoredView = JSON.parse(fs.readFileSync(path.join(restoredHome, 'cache/editor-view/checkpoint.json'), 'utf8'));
  assert.deepEqual(restoredView.view.local, editorView.local, 'the two modes retain their independent views');
  assert.equal(JSON.parse(restoredView.view.session['sourceProposalPendingEdit:demo']).bundle.sources[0].directory, `${restoredHome}/source_graphs/notes`);
  const proposal = JSON.parse(fs.readFileSync(path.join(restoredBundle, 'raw/sourcing/proposal.json'), 'utf8'));
  assert.equal(proposal.original.bundle.sourceDirectory, `${restoredHome}/source_graphs/notes`);
  assert.equal(proposal.proposed.bundle.sources[0].directory, `${restoredHome}/source_graphs/notes`);
  assert.equal(proposal.resolutions[0].original.directory, `${restoredHome}/source_graphs/notes`);
  assert.equal(proposal.resolutions[0].saved.directory, '/Users/someone/notes');
  assert.equal(editorView.session['sourceProposalPendingEdit:demo'], JSON.stringify(proposalConfiguration), 'restoration does not mutate the checkpoint metadata');
  for (const id of ["accepted", "pending", "stale"]) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(restoredBundle, "raw/sourcing/snapshots", id, "snapshot.json"), "utf8"));
    assert.equal(snapshot.sources[0].directory, `${restoredHome}/source_graphs/notes`);
    assert.equal(snapshot.digest, sourceInventory(snapshot.files, snapshot.directories, snapshot.sources).digest);
    assert.notEqual(snapshot.digest, inventory.digest);
    if (id !== "accepted") {
      assert.equal(snapshot.sourceProposal.sources[0].directory, `${restoredHome}/source_graphs/notes`);
      assert.equal(snapshot.sourceProposal.baseConfigFingerprint, id === "stale" ? "stale-fingerprint" : sourceConfigFingerprint(restoredBundle));
    }
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(snapshots, "accepted/snapshot.json"), "utf8")).digest, inventory.digest, "captured snapshots remain unchanged");

  assert.equal(fs.readFileSync(path.join(restoredHome, "app/resources.local.yaml"), "utf8"), "logDirectory: /tmp/logs\n", "ignored files are restored");
  assert.equal(fs.existsSync(path.join(restoredHome, "logs")), false, "logs are not state");
  assert.match(fs.readFileSync(path.join(restoredHome, "bundles/demo/config/bundle_config.yaml"), "utf8"), new RegExp(`directory: ${restoredHome}/source_graphs/notes\n[\\s\\S]*directory: /Users/someone/notes`), "isolated sources follow the home; others stay put");
  assert.equal(execFileSync("git", ["log", "--format=%s"], { cwd: restoredHome, encoding: "utf8" }).trim(), "initial Meadow Home commit");
  // Home objects are stored natively, not as copies of .git/objects files,
  // and a restored repository holds every captured object, reachable or not.
  assert.equal(second.metadata.version, 2);
  assert.equal(execFileSync("git", ["--git-dir", repo, "ls-tree", "--name-only", `${second.commit}:home.git`], { encoding: "utf8" }).split("\n").includes("objects"), false);
  const objectIds = (gitDir: string) => execFileSync("git", ["--git-dir", gitDir, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)"], { encoding: "utf8" });
  assert.equal(objectIds(path.join(restoredHome, ".git")), objectIds(path.join(home, ".git")));
  execFileSync("git", ["fsck", "--no-dangling"], { cwd: restoredHome, stdio: "pipe" });
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
