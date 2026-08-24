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

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildRuntimePayload } from "./buildRuntimePayload.mjs";
import {
  QA_DISTRIBUTION_MARKER,
  assembleCommandDistribution,
  createArtifactInventory,
  createPayloadParityReport,
  readVerifiedPayloadManifest,
} from "./qaDistributions.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const meadowRoot = path.resolve(scriptDirectory, "../../../..");
const desktopRoot = path.join(meadowRoot, "app/hosts/desktop");
const cliRoot = path.join(meadowRoot, "app/clients/cli");

function value(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function run(command, args, cwd, environment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}`);
}

function output(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Command failed: ${command} ${args.join(" ")}`);
  return result.stdout.trim();
}

function validateOutput(outputRoot) {
  const resolved = path.resolve(outputRoot);
  if (
    resolved === path.parse(resolved).root
    || resolved === meadowRoot
    || meadowRoot.startsWith(`${resolved}${path.sep}`)
  ) {
    throw new Error(`Unsafe QA distribution output path: ${resolved}`);
  }
  if (existsSync(resolved) && !existsSync(path.join(resolved, QA_DISTRIBUTION_MARKER))) {
    throw new Error(`Refusing to replace an unmarked QA distribution directory: ${resolved}`);
  }
  return resolved;
}

function findDirectory(root, name) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory() && entry.name === name) return candidate;
    if (entry.isDirectory()) {
      const nested = findDirectory(candidate, name);
      if (nested) return nested;
    }
  }
  return null;
}

function parseArguments(args) {
  if (args.includes("--help")) return { help: true };
  const perspective = value(args, "--perspective");
  if (perspective !== "standalone" && perspective !== "composed") {
    throw new Error("--perspective must be standalone or composed");
  }
  const desktopPackage = JSON.parse(readFileSync(path.join(desktopRoot, "package.json"), "utf8"));
  return {
    help: false,
    perspective,
    appVersion: value(args, "--app-version") ?? desktopPackage.version,
    outputRoot: validateOutput(value(args, "--output") ?? path.resolve(
      meadowRoot,
      "../..",
      "meadow-runtime-distribution-artifacts",
      "goal-3",
      perspective,
    )),
    nodeExecutable: path.resolve(value(args, "--node-executable") ?? path.join(desktopRoot, "vendor/node")),
    suppliedPayloadRoot: value(args, "--payload-root")
      ? path.resolve(value(args, "--payload-root"))
      : null,
    commandOnly: args.includes("--command-only"),
  };
}

function printHelp() {
  process.stdout.write(
    "Usage: node src/buildQaDistributions.mjs --perspective <standalone|composed> [--output <directory>] [--node-executable <path>] [--payload-root <path>] [--command-only]\n",
  );
}

export function buildQaDistributions(options) {
  if (!existsSync(options.nodeExecutable) || !statSync(options.nodeExecutable).isFile()) {
    throw new Error(`A self-contained Node executable is required: ${options.nodeExecutable}`);
  }
  const nodeVersion = output(options.nodeExecutable, ["--version"], meadowRoot);

  const stagingRoot = `${options.outputRoot}.staging-${process.pid}`;
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  writeFileSync(path.join(stagingRoot, QA_DISTRIBUTION_MARKER), "Meadow local QA distributions\n");

  try {
    let payloadRoot = options.suppliedPayloadRoot;
    if (payloadRoot) {
      const manifest = readVerifiedPayloadManifest(payloadRoot);
      if (manifest.perspective !== options.perspective || manifest.appVersion !== options.appVersion) {
        throw new Error("Supplied Runtime Payload does not match the requested build");
      }
    } else {
      payloadRoot = path.join(stagingRoot, "runtime-payload-build");
      buildRuntimePayload({
        appVersion: options.appVersion,
        perspective: options.perspective,
        outputRoot: payloadRoot,
        nodeExecutable: options.nodeExecutable,
        manifestOnly: false,
        skipBuild: false,
      });
    }

    run("npm", ["run", "build"], cliRoot, { MEADOW_BUILD_PERSPECTIVE: options.perspective });
    const commandRoot = path.join(stagingRoot, `Meadow-Command-${options.appVersion}-${options.perspective}`);
    assembleCommandDistribution({
      payloadRoot,
      cliBundle: path.join(cliRoot, "dist/meadow.cjs"),
      cliLauncher: path.join(cliRoot, "bin/meadow"),
      commandRoot,
    });
    const commandArchive = `${commandRoot}.zip`;
    run("/usr/bin/ditto", ["-c", "-k", "--keepParent", commandRoot, commandArchive], stagingRoot);

    let desktopApp = null;
    let parityReport = null;
    if (!options.commandOnly) {
      const desktopPayloadRoot = path.join(meadowRoot, "app/runtime/payload/dist");
      if (existsSync(desktopPayloadRoot) && !existsSync(path.join(desktopPayloadRoot, ".meadow-runtime-payload"))) {
        throw new Error(`Refusing to replace an unmarked Desktop payload directory: ${desktopPayloadRoot}`);
      }
      rmSync(desktopPayloadRoot, { recursive: true, force: true });
      cpSync(payloadRoot, desktopPayloadRoot, { recursive: true, preserveTimestamps: true });
      run("npm", ["run", "build:main"], desktopRoot, { MEADOW_BUILD_PERSPECTIVE: options.perspective });
      const desktopBuildRoot = path.join(stagingRoot, "desktop");
      run(
        path.join(desktopRoot, "node_modules/.bin/electron-builder"),
        [
          "--mac",
          "--dir",
          "--arm64",
          "-c.mac.identity=null",
          "-c.mac.notarize=false",
          `-c.directories.output=${desktopBuildRoot}`,
        ],
        desktopRoot,
        {
          CSC_IDENTITY_AUTO_DISCOVERY: "false",
          MEADOW_BUILD_PERSPECTIVE: options.perspective,
          MEADOW_LOCAL_QA_UNSIGNED: "1",
        },
      );
      desktopApp = findDirectory(desktopBuildRoot, "Meadow.app");
      if (!desktopApp) throw new Error("electron-builder did not produce Meadow.app");
      const packagedPayloadRoot = path.join(desktopApp, "Contents/Resources/runtime-payload");
      parityReport = createPayloadParityReport({
        perspective: options.perspective,
        desktopPayloadRoot: packagedPayloadRoot,
        commandPayloadRoot: path.join(commandRoot, "runtime-payload"),
      });
      writeFileSync(path.join(stagingRoot, "payload-parity.json"), `${JSON.stringify(parityReport, null, 2)}\n`);
      if (parityReport.result !== "pass") throw new Error("Desktop/Command Runtime Payload parity failed");
    }

    const inventory = createArtifactInventory({
      perspective: options.perspective,
      nodeExecutable: options.nodeExecutable,
      nodeVersion,
      commandRoot,
      commandArchive,
      desktopApp,
      parityReport,
    });
    writeFileSync(path.join(stagingRoot, "artifact-inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
    if (existsSync(options.outputRoot)) rmSync(options.outputRoot, { recursive: true, force: true });
    renameSync(stagingRoot, options.outputRoot);
    return inventory;
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) printHelp();
    else process.stdout.write(`${JSON.stringify(buildQaDistributions(options), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
