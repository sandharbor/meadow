#!/usr/bin/env node
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

import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const PAYLOAD_SCHEMA_VERSION = 1;
const RUNTIME_PROTOCOL = "meadow-local-v1";
const MARKER = ".meadow-runtime-payload";
const MANIFEST = "manifest.json";
export const GENERATION_ASSET_DIRECTORIES = [
  "templates",
  "shared",
  "presets",
  "published_bundle_utils/srs",
];
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const meadowRoot = path.resolve(scriptDirectory, "../../../..");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function relativeUnix(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

export function collectPayloadFiles(payloadRoot) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeUnix(payloadRoot, absolutePath);
      if (relativePath === MANIFEST) continue;
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (entry.isSymbolicLink()) {
        const linkTarget = Buffer.from(`symlink:${readlinkSync(absolutePath)}`, "utf8");
        files.push({ path: relativePath, bytes: linkTarget.byteLength, sha256: sha256(linkTarget) });
        continue;
      }
      if (entry.isFile()) {
        const contents = readFileSync(absolutePath);
        files.push({ path: relativePath, bytes: contents.byteLength, sha256: sha256(contents) });
      }
    }
  }
  visit(payloadRoot);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function createPayloadManifest(payloadRoot, { appVersion, perspective }) {
  const files = collectPayloadFiles(payloadRoot);
  const identityInput = {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    protocol: RUNTIME_PROTOCOL,
    appVersion,
    perspective,
    files,
  };
  return {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    protocol: RUNTIME_PROTOCOL,
    identity: `sha256:${sha256(Buffer.from(JSON.stringify(identityInput), "utf8"))}`,
    appVersion,
    perspective,
    files,
  };
}

export function verifyPayloadManifest(payloadRoot, manifest) {
  const expected = createPayloadManifest(payloadRoot, {
    appVersion: manifest.appVersion,
    perspective: manifest.perspective,
  });
  return JSON.stringify(expected) === JSON.stringify(manifest);
}

function requireCommand(command, args, cwd, environment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Runtime Payload build command failed: ${command} ${args.join(" ")}`);
  }
}

function commandOutput(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Runtime Payload inventory command failed: ${command}`);
  }
  return result.stdout;
}

function copy(source, destination) {
  if (!existsSync(source)) throw new Error(`Runtime Payload input is missing: ${source}`);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true, preserveTimestamps: true });
}

function copyProductionDependencies(serviceRoot, destination) {
  const packageDirectories = commandOutput(
    "npm",
    ["ls", "--all", "--omit=dev", "--parseable"],
    serviceRoot,
  ).trim().split("\n").filter(candidate => candidate.includes(`${path.sep}node_modules${path.sep}`));
  for (const packageDirectory of packageDirectories) {
    const relativePath = path.relative(serviceRoot, packageDirectory);
    copy(packageDirectory, path.join(destination, relativePath));
  }
}

function copyGenerationAssets(serviceRoot, destinationServiceRoot) {
  const sourceHtmlRoot = path.join(serviceRoot, "src/areas/bundle/generation/html");
  const destinationHtmlRoot = path.join(
    destinationServiceRoot,
    "dist/runtime/service/src/areas/bundle/generation/html",
  );
  for (const directory of GENERATION_ASSET_DIRECTORIES) {
    copy(path.join(sourceHtmlRoot, directory), path.join(destinationHtmlRoot, directory));
  }
}

function validateComposition(perspective) {
  const extensionProvider = path.join(
    meadowRoot,
    "app/publishing_providers/MeadowPublishingProvider",
  );
  const extensionPresent = existsSync(extensionProvider);
  if (perspective === "standalone" && extensionPresent) {
    throw new Error("A standalone Runtime Payload must be built from a standalone Meadow tree");
  }
  if (perspective === "composed" && !extensionPresent) {
    throw new Error("A composed Runtime Payload requires the Meadow extension provider");
  }
}

function validateOutput(outputRoot) {
  const resolved = path.resolve(outputRoot);
  if (
    resolved === path.parse(resolved).root
    || resolved === meadowRoot
    || meadowRoot.startsWith(`${resolved}${path.sep}`)
  ) {
    throw new Error(`Unsafe Runtime Payload output path: ${resolved}`);
  }
  if (existsSync(resolved) && !existsSync(path.join(resolved, MARKER))) {
    throw new Error(`Refusing to replace an unmarked directory: ${resolved}`);
  }
  return resolved;
}

function parseArguments(args) {
  if (args.includes("--help")) return { help: true };
  const value = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const perspective = value("--perspective");
  if (perspective !== "standalone" && perspective !== "composed") {
    throw new Error("--perspective must be standalone or composed");
  }
  const desktopPackage = JSON.parse(readFileSync(path.join(meadowRoot, "app/hosts/desktop/package.json"), "utf8"));
  return {
    help: false,
    perspective,
    appVersion: value("--app-version") ?? desktopPackage.version,
    outputRoot: value("--output") ?? path.resolve(
      meadowRoot,
      "../..",
      "meadow-runtime-distribution-artifacts",
      "goal-2",
      `runtime-payload-${perspective}`,
    ),
    nodeExecutable: path.resolve(value("--node-executable") ?? process.execPath),
    skipBuild: args.includes("--skip-build"),
  };
}

export function buildRuntimePayload(options) {
  validateComposition(options.perspective);
  const outputRoot = validateOutput(options.outputRoot);
  const stagingRoot = `${outputRoot}.staging-${process.pid}`;
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  writeFileSync(path.join(stagingRoot, MARKER), "Meadow Runtime Payload\n");

  const supervisorRoot = path.join(meadowRoot, "app/runtime/supervisor");
  const serviceRoot = path.join(meadowRoot, "app/runtime/service");
  const webRoot = path.join(meadowRoot, "app/clients/web");
  const buildEnvironment = { MEADOW_BUILD_PERSPECTIVE: options.perspective };
  if (!options.skipBuild) {
    requireCommand("npm", ["run", "build"], supervisorRoot, buildEnvironment);
    requireCommand("npm", ["run", "build"], serviceRoot, buildEnvironment);
    requireCommand("npm", ["run", "build"], webRoot, buildEnvironment);
    for (const nativeProject of [
      "source_page_search_by_title/source_page_search_by_title_code",
      "fast_git_ops/fast_git_ops_code",
      "working_graph/working_graph_code",
    ]) {
      requireCommand("cargo", ["build", "--release"], path.join(meadowRoot, "app/runtime/native", nativeProject));
    }
  }

  copy(
    path.join(supervisorRoot, "dist/meadow-runtime-supervisor.cjs"),
    path.join(stagingRoot, "supervisor/meadow-runtime-supervisor.cjs"),
  );
  copy(path.join(serviceRoot, "dist"), path.join(stagingRoot, "service/dist"));
  copyFileSync(path.join(serviceRoot, "package.json"), path.join(stagingRoot, "service/package.json"));
  copyProductionDependencies(serviceRoot, path.join(stagingRoot, "service"));
  copyGenerationAssets(serviceRoot, path.join(stagingRoot, "service"));

  copy(path.join(webRoot, "dist"), path.join(stagingRoot, "web"));
  copy(path.join(webRoot, "server.js"), path.join(stagingRoot, "web/server.js"));
  copy(path.join(webRoot, "package.json"), path.join(stagingRoot, "web/package.json"));

  const nativeInputs = [
    ["source_page_search_by_title/source_page_search_by_title_code/target/release/source_page_search_by_title_bin", "source_page_search_by_title_bin"],
    ["fast_git_ops/fast_git_ops_code/target/release/fast_git_ops_bin", "fast_git_ops_bin"],
    ["working_graph/working_graph_code/target/release/working_graph_bin", "working_graph_bin"],
  ];
  for (const [source, name] of nativeInputs) {
    copy(path.join(meadowRoot, "app/runtime/native", source), path.join(stagingRoot, "native", name));
    chmodSync(path.join(stagingRoot, "native", name), 0o755);
  }
  copy(options.nodeExecutable, path.join(stagingRoot, "bin/node"));
  chmodSync(path.join(stagingRoot, "bin/node"), 0o755);
  copy(
    path.join(meadowRoot, "app/shared_data/home_fixtures/home_fixture_example"),
    path.join(stagingRoot, "example/home_fixture"),
  );
  copy(
    path.join(meadowRoot, "app/shared_data/source_graphs/example-bundle-data"),
    path.join(stagingRoot, "example/source_graph"),
  );

  const manifest = createPayloadManifest(stagingRoot, options);
  writeFileSync(path.join(stagingRoot, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  if (!verifyPayloadManifest(stagingRoot, manifest)) {
    throw new Error("Runtime Payload manifest failed self-verification");
  }
  if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true, force: true });
  renameSync(stagingRoot, outputRoot);
  return { outputRoot, manifest };
}

function printHelp() {
  process.stdout.write(
    "Usage: node src/buildRuntimePayload.mjs --perspective <standalone|composed> [--app-version <version>] [--output <directory>] [--node-executable <path>] [--skip-build]\n",
  );
}

if (
  process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) printHelp();
    else {
      const result = buildRuntimePayload(options);
      process.stdout.write(`${JSON.stringify({
        output: result.outputRoot,
        identity: result.manifest.identity,
        files: result.manifest.files.length,
      })}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
