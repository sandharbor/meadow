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

type GraphScope = "all" | "final";
type FilterCombination = "default" | "union" | "intersection" | "difference";

interface BundleNodesOptions {
  slug: string;
  scope: GraphScope;
  filters: string[];
  combine: FilterCombination;
}

function showHelp(): void {
  console.log(`meadow - command-line access to a running Meadow application

Usage:
  meadow bundles list
  meadow bundles list --archived
  meadow bundles archive <bundle-slug>
  meadow bundles unarchive <bundle-slug>
  meadow bundle nodes <bundle-slug> --scope <all|final>
  meadow bundle filters <bundle-slug>
  meadow help

Commands:
  bundles list                     List current bundles as JSON.
  bundles list --archived          List archived bundles as JSON.
  bundles archive <bundle-slug>    Archive a bundle and return JSON.
  bundles unarchive <bundle-slug>  Unarchive a bundle and return JSON.
  bundle nodes                     Describe a bundle's working graph as JSON.
  bundle filters                   List filters available to a bundle as JSON.

Meadow connects to the local runtime started by the desktop application or
development server. JSON is written to standard output.`);
}

function showBundleHelp(): void {
  console.log(`Usage:
  meadow bundle nodes <bundle-slug> --scope <all|final> [options]
  meadow bundle filters <bundle-slug>

Commands:
  nodes     Return deterministic nodes and edges from the working graph.
  filters   List stable filter IDs, descriptions, selectors, actions, and scope.

Run 'meadow bundle nodes --help' for graph filtering options.`);
}

function showBundleNodesHelp(): void {
  console.log(`Usage:
  meadow bundle nodes <bundle-slug> --scope <all|final> [options]

Required:
  --scope all                     Include every node in the raw working graph.
  --scope final                   Include tracked, non-blacklisted, non-frontier nodes.

Filtering:
  --filter <filter-id>=solo       Keep nodes matched by a filter. Repeatable.
  --filter <filter-id>=exclude    Remove nodes matched by a filter. Repeatable.
  --combine <operation>           default, union, intersection, or difference.

The default combination matches Meadow's UI: solos are unioned, exclusions are
intersected, and the two resulting sets are intersected. Difference is evaluated
in command-line order. Run 'meadow bundle filters <bundle-slug>' to discover IDs.`);
}

function showBundleFiltersHelp(): void {
  console.log(`Usage:
  meadow bundle filters <bundle-slug>

Returns built-in filters, selector groups, and custom filters as JSON. Each
entry states whether it is bundle-scoped or global and whether it can be passed
directly to 'meadow bundle nodes --filter'.`);
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
    let detail = "";
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === "string") detail = ` ${body.error}`;
    } catch {
      // The status remains useful when an older runtime returns no JSON body.
    }
    throw new Error(`Meadow API request failed (${response.status}).${detail}`);
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

function parseBundleNodesOptions(args: string[]): BundleNodesOptions {
  const slug = args[0];
  if (!slug || slug.startsWith("--")) {
    throw new Error("Usage: meadow bundle nodes <bundle-slug> --scope <all|final>");
  }

  let scope: GraphScope | undefined;
  let combine: FilterCombination = "default";
  const filters: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === "--scope") {
      if (scope !== undefined) throw new Error("--scope may only be provided once");
      if (value !== "all" && value !== "final") {
        throw new Error("--scope must be exactly 'all' or 'final'");
      }
      scope = value;
      index += 1;
      continue;
    }
    if (option === "--filter") {
      if (!value || value.startsWith("--")) {
        throw new Error("--filter requires '<filter-id>=solo' or '<filter-id>=exclude'");
      }
      const separatorIndex = value.lastIndexOf("=");
      const mode = value.slice(separatorIndex + 1);
      if (separatorIndex <= 0 || (mode !== "solo" && mode !== "exclude")) {
        throw new Error("--filter requires '<filter-id>=solo' or '<filter-id>=exclude'");
      }
      filters.push(value);
      index += 1;
      continue;
    }
    if (option === "--combine") {
      if (
        value !== "default"
        && value !== "union"
        && value !== "intersection"
        && value !== "difference"
      ) {
        throw new Error("--combine must be default, union, intersection, or difference");
      }
      combine = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${option}`);
  }

  if (!scope) throw new Error("--scope is required and must be 'all' or 'final'");
  if (filters.length === 0 && combine !== "default") {
    throw new Error("--combine requires at least one --filter");
  }
  return { slug, scope, filters, combine };
}

async function describeBundleNodes(options: BundleNodesOptions): Promise<void> {
  const query = new URLSearchParams({ scope: options.scope });
  options.filters.forEach(filter => query.append("filter", filter));
  if (options.combine !== "default") query.set("combine", options.combine);
  const response = await requestJson(
    resolveSession(),
    `/bundles/${encodeURIComponent(options.slug)}/curation/graph-description?${query.toString()}`,
  );
  console.log(JSON.stringify(response, null, 2));
}

async function listBundleFilters(slug: string): Promise<void> {
  const response = await requestJson(
    resolveSession(),
    `/bundles/${encodeURIComponent(slug)}/curation/filters`,
  );
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

  if (args[0] === "bundle" && (args.length === 1 || args[1] === "--help" || args[1] === "-h")) {
    showBundleHelp();
    return;
  }

  if (args[0] === "bundle" && args[1] === "nodes") {
    if (args[2] === "--help" || args[2] === "-h") {
      showBundleNodesHelp();
      return;
    }
    await describeBundleNodes(parseBundleNodesOptions(args.slice(2)));
    return;
  }

  if (args[0] === "bundle" && args[1] === "filters") {
    if (args[2] === "--help" || args[2] === "-h") {
      showBundleFiltersHelp();
      return;
    }
    if (args.length !== 3 || args[2].trim().length === 0) {
      throw new Error("Usage: meadow bundle filters <bundle-slug>");
    }
    await listBundleFilters(args[2]);
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
