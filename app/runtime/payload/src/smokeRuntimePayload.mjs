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
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function requirePayloadRoot(args) {
  const index = args.indexOf("--payload");
  if (index < 0 || !args[index + 1]) {
    throw new Error("Usage: node src/smokeRuntimePayload.mjs --payload <directory>");
  }
  return path.resolve(args[index + 1]);
}

function runtimeDescriptorPath(homeDirectory) {
  const homeId = createHash("sha256").update(path.resolve(homeDirectory)).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), "meadow-runtime", homeId, "session.json");
}

function launchSpec(payloadRoot, homeDirectory, manifest) {
  const node = path.join(payloadRoot, "bin/node");
  return {
    schemaVersion: 1,
    homeDirectory,
    payload: {
      identity: manifest.identity,
      appVersion: manifest.appVersion,
      perspective: manifest.perspective,
    },
    service: {
      executable: node,
      args: ["dist/runtime/service/src/shared/app-shell/index.js"],
      cwd: path.join(payloadRoot, "service"),
      environment: {
        NODE_ENV: "production",
        MEADOW_IS_DEV: "false",
        SOURCE_PAGE_SEARCH_BY_TITLE_PATH: path.join(payloadRoot, "native/source_page_search_by_title_bin"),
        FAST_GIT_OPS_PATH: path.join(payloadRoot, "native/fast_git_ops_bin"),
        WORKING_GRAPH_PATH: path.join(payloadRoot, "native/working_graph_bin"),
        MEADOW_EXAMPLE_BUNDLE_PATH: path.join(payloadRoot, "example"),
      },
    },
    web: {
      executable: node,
      args: ["server.js"],
      cwd: path.join(payloadRoot, "web"),
      environment: { NODE_ENV: "production" },
    },
    idleTimeoutMs: 60_000,
  };
}

async function waitForDescriptor(descriptorPath, child, diagnostics) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (existsSync(descriptorPath)) return JSON.parse(readFileSync(descriptorPath, "utf8"));
    if (child.exitCode !== null) {
      throw new Error(`Runtime Payload exited during startup (${child.exitCode}): ${diagnostics()}`);
    }
    await delay(100);
  }
  throw new Error(`Runtime Payload startup timed out: ${diagnostics()}`);
}

async function stopSupervisor(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    delay(10_000).then(() => { throw new Error("Runtime Payload did not stop cooperatively"); }),
  ]);
}

async function startRuntime(payloadRoot, homeDirectory, manifest) {
  const specPath = path.join(path.dirname(homeDirectory), `launch-${Date.now()}.json`);
  writeFileSync(specPath, `${JSON.stringify(launchSpec(payloadRoot, homeDirectory, manifest), null, 2)}\n`, { mode: 0o600 });
  const child = spawn(
    path.join(payloadRoot, "bin/node"),
    [path.join(payloadRoot, "supervisor/meadow-runtime-supervisor.cjs"), "--launch-spec", specPath],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  const append = chunk => { output = `${output}${chunk}`.slice(-64 * 1024); };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  const descriptor = await waitForDescriptor(runtimeDescriptorPath(homeDirectory), child, () => output);
  return { child, descriptor };
}

async function authorizedControl(descriptor, pathname, body) {
  return fetch(`${descriptor.controlUrl}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-meadow-capability": descriptor.capability,
    },
    body: JSON.stringify(body),
  });
}

async function smokeBrowser(descriptor) {
  const launchResponse = await authorizedControl(descriptor, "/browser-session/create", {
    targetPath: "/bundles",
  });
  if (!launchResponse.ok) throw new Error("Runtime Payload did not create a browser launch session");
  const { launchUrl } = await launchResponse.json();
  const exchange = await fetch(launchUrl, { redirect: "manual" });
  const cookie = exchange.headers.get("set-cookie");
  if (
    exchange.status !== 303
    || exchange.headers.get("location") !== "/bundles"
    || !cookie?.includes("HttpOnly")
    || !cookie.includes("SameSite=Strict")
  ) {
    throw new Error("Runtime Payload browser bootstrap did not return a secure clean redirect");
  }
  const apiHealth = await fetch(`${descriptor.frontendOrigin}/api/health`, {
    headers: { cookie: cookie.split(";", 1)[0] },
  });
  if (!apiHealth.ok) throw new Error("Runtime Payload Web Client could not reach the service");
}

async function main() {
  const payloadRoot = requirePayloadRoot(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(path.join(payloadRoot, "manifest.json"), "utf8"));
  const trialRoot = mkdtempSync(path.join(os.tmpdir(), "meadow-runtime-payload-smoke-"));
  const homeDirectory = path.join(trialRoot, "Meadow Home");
  const children = [];
  try {
    const first = await startRuntime(payloadRoot, homeDirectory, manifest);
    children.push(first.child);
    const backendHealth = await fetch(`${first.descriptor.backendUrl}/health`);
    const frontendHealth = await fetch(first.descriptor.frontendUrl);
    if (!backendHealth.ok || !frontendHealth.ok) throw new Error("Runtime Payload children are not healthy");
    await smokeBrowser(first.descriptor);
    await stopSupervisor(first.child);

    const second = await startRuntime(payloadRoot, homeDirectory, manifest);
    children.push(second.child);
    if (second.descriptor.instanceId === first.descriptor.instanceId) {
      throw new Error("Runtime Payload restart did not create a new Runtime instance");
    }
    const bundles = await fetch(`${second.descriptor.backendUrl}/bundles/detailed`, {
      headers: { "x-meadow-capability": second.descriptor.capability },
    });
    if (!bundles.ok) throw new Error("Runtime Payload restart did not preserve a usable Meadow Home");
    await stopSupervisor(second.child);
    process.stdout.write(`${JSON.stringify({
      success: true,
      identity: manifest.identity,
      perspective: manifest.perspective,
      restartPreservedHome: true,
      browserBootstrap: true,
    })}\n`);
  } finally {
    await Promise.all(children.map(child => stopSupervisor(child).catch(() => {})));
    rmSync(trialRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
