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

import { existsSync } from "node:fs";
import { getDefaultConfigDirectory } from "../../shared_code/utils/appConfigUtils.js";
import {
  getLocalRuntimeSessionPath,
  MEADOW_CONTROL_PROTOCOL,
  MEADOW_RUNTIME_SESSION_ENV,
  readLocalRuntimeSession,
  type LocalRuntimeSession,
} from "../../shared_code/utils/localRuntimeSession.js";

interface BundleSummary {
  slug?: unknown;
  archivedAt?: unknown;
  [key: string]: unknown;
}

interface BundleMutationResult {
  success?: unknown;
  slug?: unknown;
  archivedAt?: unknown;
  [key: string]: unknown;
}

function showHelp(): void {
  console.log(`meadow - command-line access to a running Meadow application

Usage:
  meadow bundles list
  meadow bundles list --archived
  meadow bundles archive <bundle-slug>
  meadow bundles unarchive <bundle-slug>
  meadow help

Commands:
  bundles list                     List current bundles as JSON.
  bundles list --archived          List archived bundles as JSON.
  bundles archive <bundle-slug>    Archive a bundle and return JSON.
  bundles unarchive <bundle-slug>  Unarchive a bundle and return JSON.

Meadow connects to the local runtime started by the desktop application or
development server. JSON is written to standard output.`);
}

function resolveSession(): LocalRuntimeSession {
  const configuredPath = process.env[MEADOW_RUNTIME_SESSION_ENV];
  const sessionPath = configuredPath
    ?? getLocalRuntimeSessionPath(getDefaultConfigDirectory());
  if (!existsSync(sessionPath)) {
    throw new Error("No running Meadow application was found. Open Meadow and try again.");
  }
  return readLocalRuntimeSession(sessionPath);
}

async function requestJson(
  session: LocalRuntimeSession,
  pathname: string,
  method: "GET" | "POST" = "GET",
): Promise<unknown> {
  const healthResponse = await fetch(`${session.backendUrl}/health`);
  if (!healthResponse.ok) {
    throw new Error("The running Meadow application is not ready.");
  }
  const health = await healthResponse.json() as { ready?: unknown; protocol?: unknown };
  if (health.ready !== true || health.protocol !== MEADOW_CONTROL_PROTOCOL) {
    throw new Error("The running Meadow application uses an incompatible local protocol.");
  }

  const response = await fetch(`${session.backendUrl}${pathname}`, {
    method,
    headers: { "x-meadow-capability": session.capability },
  });
  if (!response.ok) {
    throw new Error(`Meadow API request failed (${response.status}).`);
  }
  return response.json() as Promise<unknown>;
}

async function listBundles(archived: boolean): Promise<void> {
  const response = await requestJson(resolveSession(), "/bundles/detailed");
  if (!Array.isArray(response)) {
    throw new Error("Meadow returned an invalid bundle list.");
  }
  const bundles = (response as BundleSummary[])
    .filter((bundle) => archived ? Boolean(bundle.archivedAt) : !bundle.archivedAt);
  console.log(JSON.stringify(bundles, null, 2));
}

async function setBundleArchived(slug: string, archived: boolean): Promise<void> {
  const action = archived ? "archive" : "unarchive";
  const response = await requestJson(
    resolveSession(),
    `/bundles/${encodeURIComponent(slug)}/${action}`,
    "POST",
  );
  if (
    typeof response !== "object"
    || response === null
    || (response as BundleMutationResult).success !== true
    || (response as BundleMutationResult).slug !== slug
  ) {
    throw new Error(`Meadow returned an invalid bundle ${action} response.`);
  }
  console.log(JSON.stringify(response, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    showHelp();
    return;
  }

  if (args[0] === "bundles" && args[1] === "list") {
    const options = args.slice(2);
    const unknown = options.filter((option) => option !== "--archived");
    if (unknown.length > 0) {
      throw new Error(`Unknown option: ${unknown[0]}`);
    }
    await listBundles(options.includes("--archived"));
    return;
  }

  if (
    args[0] === "bundles"
    && (args[1] === "archive" || args[1] === "unarchive")
  ) {
    if (args.length !== 3 || args[2].trim().length === 0) {
      throw new Error(`Usage: meadow bundles ${args[1]} <bundle-slug>`);
    }
    await setBundleArchived(args[2], args[1] === "archive");
    return;
  }

  throw new Error(`Unknown command: ${args.join(" ")}`);
}

main().catch((error: unknown) => {
  console.error(`meadow: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
