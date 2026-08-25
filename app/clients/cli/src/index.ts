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

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getDefaultConfigDirectory } from "../../../shared_code/utils/appConfigUtils.js";
import {
  MEADOW_RUNTIME_PROTOCOL,
  MEADOW_RUNTIME_SESSION_ENV,
  type RuntimeSessionDescriptor,
} from "../../../contracts/types/runtime.js";
import {
  ensureRuntime,
  createBrowserLaunchUrl,
  RuntimeClientLease,
} from "../../../runtime/supervisor/src/runtimeClient.js";
import { createRuntimePayloadLaunchSpec } from "../../../runtime/supervisor/src/runtimePayload.js";
import { createSourceRuntimeLaunchSpec } from "../../../runtime/supervisor/src/sourceLaunchSpec.js";
import { runBundleNodeCommand, showBundleNodeHelp } from "./nodeCommands.js";
import { parseTrackBundleOptions, type TrackBundleOptions } from "./trackCommands.js";

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

interface CreateBundleOptions {
  sourceDirectory: string;
  entryPage: string;
  slug?: string;
}

interface BundleVersionOptions {
  slug: string;
  versionId: string;
}

class CliApiError extends Error {
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    const message = typeof body.error === "string"
      ? body.error
      : `Meadow API request failed (${status}).`;
    super(message);
    this.name = "CliApiError";
    this.body = body;
  }
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
  meadow open
  meadow bundles list
  meadow bundles list --archived
  meadow bundles create --source <directory> --entry <relative-page>
  meadow bundles archive <bundle-slug>
  meadow bundles unarchive <bundle-slug>
  meadow bundle track <bundle-slug> --all-safe
  meadow bundle node track <bundle-slug> --path <node-path>
  meadow bundle node <operation> <bundle-slug> (--id <id> | --path <path>)
  meadow bundle open <bundle-slug>
  meadow bundle generate <bundle-slug>
  meadow bundle save-generation <bundle-slug> --version <version-id>
  meadow bundle publish <bundle-slug> --version <version-id>
  meadow bundle nodes <bundle-slug> --scope <all|final>
  meadow bundle filters <bundle-slug>
  meadow review open <review-request-id>
  meadow help [command ...]

Commands:
  open                             Open the full Meadow Web Client explicitly.
  bundles list                     List current bundles as JSON.
  bundles list --archived          List archived bundles as JSON.
  bundles create                   Create a page-derived bundle using normal defaults.
  bundles archive <bundle-slug>    Archive a bundle and return JSON.
  bundles unarchive <bundle-slug>  Unarchive a bundle and return JSON.
  bundle track                     Atomically track a selected set or all safe nodes.
  bundle node                      Inspect or mutate one node by stable ID or source path;
                                   use 'bundle node track' for one-at-a-time curation.
  bundle open                      Open the full Web Client at a bundle explicitly.
  bundle generate                  Generate a read-only local preview version.
  bundle save-generation           Save a generated version in Meadow Home.
  bundle publish                   Publish a saved version with the active provider.
  bundle nodes                     Describe a bundle's working graph as JSON.
  bundle filters                   List filters available to a bundle as JSON.
  review open                      Open the full Web Client in a browser at a
                                   durable Bundle Boundary Review Request.

Meadow starts or attaches to the local Runtime on demand. Commands stay
headless unless their operation is explicitly named 'open'. JSON is written to
standard output.`);
}

function showBundlesHelp(): void {
  console.log(`Usage:
  meadow bundles list [--archived]
  meadow bundles create --source <directory> --entry <relative-page> [--slug <slug>]
  meadow bundles archive <bundle-slug>
  meadow bundles unarchive <bundle-slug>

Commands:
  create     Create a bundle from a source directory and entry page. The entry
             page is relative to the source directory. Meadow uses its normal
             traversal defaults and infers a slug from the page title.
  list       List current bundles; pass --archived for archived bundles.
  archive    Archive an existing bundle.
  unarchive  Restore an archived bundle.

Implicit creation is safe to retry: the same canonical source directory, entry
page, and defaults return the existing bundle. Pass a distinct --slug only when
you intentionally want another bundle from the same source page.

Run 'meadow bundles create --help' for creation examples.`);
}

function showBundlesCreateHelp(): void {
  console.log(`Usage:
  meadow bundles create --source <directory> --entry <relative-page> [--slug <slug>]

Required:
  --source <directory>       Directory containing the source graph.
  --entry <relative-page>    Page path relative to that directory, including
                             its Markdown filename when known.

Optional:
  --slug <slug>              Explicit lowercase bundle slug. Omit this to infer
                             a slug and make retries idempotent.

Implicit creation is safe to retry: the same canonical source directory, entry
page, and normal defaults return the existing bundle with created set to false.
The entry page is tracked automatically; single-node curation should track only
additional pages.

Examples:
  meadow bundles create --source /path/to/notes --entry "Notable Mental Models.md"
  meadow bundles create --source /path/to/notes --entry subdir/start.md --slug my-site

After creation, use the returned nextActions or inspect
'meadow bundle --help' to curate and generate the bundle.`);
}

function showBundleHelp(): void {
  console.log(`Usage:
  meadow bundle track <bundle-slug> --all-safe
  meadow bundle track <bundle-slug> --node-key <bundle-node-key> [--node-key <key> ...]
  meadow bundle node track <bundle-slug> --path <node-path>
  meadow bundle node <operation> <bundle-slug> (--id <id> | --path <path>)
  meadow bundle open <bundle-slug>
  meadow bundle generate <bundle-slug>
  meadow bundle save-generation <bundle-slug> --version <version-id>
  meadow bundle publish <bundle-slug> --version <version-id>
  meadow bundle nodes <bundle-slug> --scope <all|final> [options]
  meadow bundle filters <bundle-slug>

Commands:
  track     Atomically track a selected set by stable bundleNodeKey, or use
            --all-safe for every trackable node Meadow does not consider sensitive.
  node      Inspect, curate, find, or set traversal depths for one node.
  open      Open the full Meadow Web Client at this bundle explicitly.
  generate  Generate or regenerate the current version and return its versionId
            plus a bundle-scoped, read-only preview URL.
  save-generation
            Save the specified current version using Meadow's normal versioning.
  publish   Publish a saved version using the single active publishing provider
            and return its public URL and provider identity.
  nodes     Return deterministic nodes and edges from the working graph.
  filters   List stable filter IDs, descriptions, selectors, actions, and scope.

Run 'meadow bundle node --help' for single-node operations,
'meadow bundle track --help' for safe bulk curation, or
'meadow bundle nodes --help' for graph filtering options.`);
}

function showBundleGenerateHelp(): void {
  console.log(`Usage:
  meadow bundle generate <bundle-slug>

Generates or regenerates the bundle's current working version. The JSON result
contains a versionId, saved: false, and a bundle-scoped read-only previewUrl.
It does not expose Meadow Home or generated-file paths.

Generation and saving are deliberately separate. Use the returned nextActions
or run 'meadow bundle save-generation <slug> --version <version-id>'.

If a tracked file became sensitive after it was tracked, generate before
reaffirming it. Meadow pauses with a durable Review Request and returns the
exact headless 'bundle node track --include-sensitive' action. Run that action,
then retry generation. The optional 'review open' command is not required.`);
}

function showBundleSaveGenerationHelp(): void {
  console.log(`Usage:
  meadow bundle save-generation <bundle-slug> --version <version-id>

Required:
  --version <version-id>   The versionId returned by 'meadow bundle generate'.

Saving commits the generated files with Meadow's normal versioning and returns
their savedGenerationId. The command refuses a stale or non-current version and
is safe to retry; a retry returns changed: false with the same identities.

After saving, use the returned nextActions or run
'meadow bundle publish <slug> --version <version-id>'.`);
}

function showBundlePublishHelp(): void {
  console.log(`Usage:
  meadow bundle publish <bundle-slug> --version <version-id>

Required:
  --version <version-id>   The versionId returned by 'meadow bundle generate'.

Publishes the explicitly selected saved version using the single active
publishing provider and its default settings. The provider may initialize an
identity as part of this explicit request. The JSON result includes the public
URL, provider and provider-instance IDs, whether an identity was created, and
any remaining provider allowance.

Publish refuses an unsaved version. It never chooses between multiple active
providers; leave exactly one active and retry.`);
}

function showBundleTrackHelp(): void {
  console.log(`Usage:
  meadow bundle track <bundle-slug> --all-safe
  meadow bundle track <bundle-slug> --node-key <bundle-node-key> [--node-key <key> ...]

Modes:
  --all-safe             Atomically track every currently trackable node that
                         Meadow does not consider effectively sensitive.
  --node-key <key>       Track a specific node by the bundleNodeKey returned by
                         'meadow bundle nodes <slug> --scope all'. Repeatable.

For explicit one-at-a-time curation, use
'meadow bundle node track <slug> --path <node-path>'. The --node-key form above
is intended for atomically tracking a selected set.

Safe bulk tracking reports newly tracked, already tracked, sensitive-skipped,
untrackable-skipped, and rejected nodes. It never tracks sensitive nodes.
Targeted tracking also refuses sensitive or untrackable nodes and makes no
partial change when any requested key is invalid. Both modes are safe to retry.

After tracking, use the returned nextActions or run
'meadow bundle generate <bundle-slug>'.`);
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

let runtimeLease: RuntimeClientLease | null = null;

function resolveSourceProjectRoot(): string {
  return path.resolve(
    process.env.MEADOW_PROJECT_ROOT
      ?? path.join(path.dirname(process.argv[1] ?? process.cwd()), "../../../.."),
  );
}

async function ensureCliRuntime(): Promise<void> {
  if (runtimeLease) return;
  const homeDirectory = getDefaultConfigDirectory();
  const cliDirectory = path.dirname(process.argv[1] ?? process.cwd());
  const payloadRoot = [
    process.env.MEADOW_RUNTIME_PAYLOAD_ROOT,
    path.resolve(cliDirectory, "../runtime-payload"),
    path.resolve(cliDirectory, "../../runtime-payload"),
  ].find((candidate): candidate is string => Boolean(
    candidate && existsSync(path.join(candidate, "manifest.json")),
  ));
  if (payloadRoot) {
    const launchSpec = createRuntimePayloadLaunchSpec({ payloadRoot, homeDirectory });
    runtimeLease = await ensureRuntime({
      homeDirectory,
      payload: launchSpec.payload,
      launchSpec,
      supervisorEntryPath: path.join(payloadRoot, "supervisor/meadow-runtime-supervisor.cjs"),
      descriptorPath: process.env[MEADOW_RUNTIME_SESSION_ENV],
      nodeExecutable: launchSpec.service.executable,
    });
    return;
  }

  const projectRoot = resolveSourceProjectRoot();
  const appVersion = process.env.MEADOW_APP_VERSION ?? "0.5.43";
  const perspective = process.env.MEADOW_BUILD_PERSPECTIVE === "composed"
    ? "composed"
    : "standalone";
  const payload = {
    identity: process.env.MEADOW_RUNTIME_PAYLOAD_IDENTITY
      ?? `source-${perspective}-${appVersion}`,
    appVersion,
    perspective,
  } as const;
  const launchSpec = createSourceRuntimeLaunchSpec({
    projectRoot,
    homeDirectory,
    appVersion,
    payloadIdentity: payload.identity,
    perspective,
  });
  runtimeLease = await ensureRuntime({
    homeDirectory,
    payload,
    launchSpec,
    supervisorEntryPath: path.join(
      projectRoot,
      "app",
      "runtime",
      "supervisor",
      "dist",
      "meadow-runtime-supervisor.cjs",
    ),
    descriptorPath: process.env[MEADOW_RUNTIME_SESSION_ENV],
  });
}

async function openBrowser(
  targetPath: string,
  operation: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const session = resolveSession();
  const launchUrl = await createBrowserLaunchUrl(session, targetPath);
  const executable = process.env.MEADOW_BROWSER_OPEN_EXECUTABLE
    ?? (process.platform === "darwin" ? "/usr/bin/open" : "xdg-open");
  await new Promise<void>((resolve, reject) => {
    execFile(executable, [launchUrl], error => {
      if (error) reject(new Error(`Could not open the Meadow Web Client: ${error.message}`));
      else resolve();
    });
  });
  console.log(JSON.stringify({
    operation,
    opened: true,
    url: new URL(targetPath, session.frontendOrigin).toString(),
    ...details,
  }, null, 2));
}

function resolveSession(): RuntimeSessionDescriptor {
  if (!runtimeLease) throw new Error("The Meadow Runtime client lease is unavailable");
  return runtimeLease.descriptor;
}

async function requestJson(
  session: RuntimeSessionDescriptor,
  pathname: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<unknown> {
  const healthResponse = await fetch(`${session.backendUrl}/health`);
  if (!healthResponse.ok) {
    throw new Error("The running Meadow application is not ready.");
  }
  const health = await healthResponse.json() as { ready?: unknown; protocol?: unknown };
  if (health.ready !== true || health.protocol !== MEADOW_RUNTIME_PROTOCOL) {
    throw new Error("The running Meadow application uses an incompatible local protocol.");
  }

  const response = await fetch(`${session.backendUrl}${pathname}`, {
    method,
    headers: {
      "x-meadow-capability": session.capability,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    let errorBody: Record<string, unknown> | undefined;
    try {
      const body = await response.json() as unknown;
      if (typeof body === "object" && body !== null && !Array.isArray(body)) {
        errorBody = body as Record<string, unknown>;
      }
    } catch {
      // The status remains useful when an older runtime returns no JSON body.
    }
    if (errorBody) throw new CliApiError(response.status, errorBody);
    throw new Error(`Meadow API request failed (${response.status}).`);
  }
  return response.json() as Promise<unknown>;
}

function parseCreateBundleOptions(args: string[]): CreateBundleOptions {
  let sourceDirectory: string | undefined;
  let entryPage: string | undefined;
  let slug: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option !== "--source" && option !== "--entry" && option !== "--slug") {
      throw new Error(`Unknown option: ${option}. Run 'meadow bundles create --help'.`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`${option} requires a value. Run 'meadow bundles create --help'.`);
    }
    if (option === "--source") {
      if (sourceDirectory !== undefined) throw new Error("--source may only be provided once");
      sourceDirectory = value;
    } else if (option === "--entry") {
      if (entryPage !== undefined) throw new Error("--entry may only be provided once");
      entryPage = value;
    } else {
      if (slug !== undefined) throw new Error("--slug may only be provided once");
      slug = value;
    }
    index += 1;
  }
  if (!sourceDirectory || !entryPage) {
    throw new Error("--source and --entry are required. Run 'meadow bundles create --help'.");
  }
  return { sourceDirectory, entryPage, ...(slug && { slug }) };
}

async function createBundle(options: CreateBundleOptions): Promise<void> {
  const response = await requestJson(resolveSession(), "/bundles", "POST", {
    sourceDirectory: options.sourceDirectory,
    entryPage: options.entryPage,
    ...(options.slug && { slug: options.slug }),
  });
  if (
    typeof response !== "object"
    || response === null
    || (response as { operation?: unknown }).operation !== "bundles.create"
    || typeof (response as { slug?: unknown }).slug !== "string"
    || (response as { entryPageTracked?: unknown }).entryPageTracked !== true
  ) {
    throw new Error("Meadow returned an invalid bundle creation response.");
  }
  console.log(JSON.stringify(response, null, 2));
}

async function trackBundle(options: TrackBundleOptions): Promise<void> {
  const response = await requestJson(
    resolveSession(),
    `/bundles/${encodeURIComponent(options.slug)}/curation/track-nodes`,
    "POST",
    options.mode === "all-safe" ? { allSafe: true } : { nodeKeys: options.nodeKeys },
  );
  if (
    typeof response !== "object"
    || response === null
    || (response as { operation?: unknown }).operation !== "bundle.track"
    || !Array.isArray((response as { newlyTracked?: unknown }).newlyTracked)
  ) {
    throw new Error("Meadow returned an invalid bundle tracking response.");
  }
  console.log(JSON.stringify(response, null, 2));
}

function parseSlugOnly(args: string[], usage: string): string {
  if (args.length !== 1 || !args[0] || args[0].startsWith("--")) {
    throw new Error(`Usage: ${usage}`);
  }
  return args[0];
}

function parseBundleVersionOptions(args: string[], command: string): BundleVersionOptions {
  const slug = args[0];
  if (!slug || slug.startsWith("--")) {
    throw new Error(`Usage: meadow bundle ${command} <bundle-slug> --version <version-id>`);
  }
  if (args.length !== 3 || args[1] !== "--version" || !args[2] || args[2].startsWith("--")) {
    throw new Error(`Usage: meadow bundle ${command} <bundle-slug> --version <version-id>`);
  }
  return { slug, versionId: args[2] };
}

async function generateBundle(slug: string): Promise<void> {
  console.error(`meadow: generating bundle '${slug}'...`);
  const response = await requestJson(
    resolveSession(),
    `/bundles/${encodeURIComponent(slug)}/generation/preview`,
    "POST",
    {},
  );
  if (
    typeof response === "object"
    && response !== null
    && (response as { operation?: unknown }).operation === "bundle.generate"
    && (response as { paused?: unknown }).paused === true
    && typeof (response as { reviewRequest?: { reviewRequestId?: unknown } }).reviewRequest?.reviewRequestId === "string"
  ) {
    console.log(JSON.stringify(response, null, 2));
    process.exitCode = 2;
    return;
  }
  if (
    typeof response !== "object"
    || response === null
    || (response as { operation?: unknown }).operation !== "bundle.generate"
    || typeof (response as { versionId?: unknown }).versionId !== "string"
    || typeof (response as { previewUrl?: unknown }).previewUrl !== "string"
  ) {
    throw new Error("Meadow returned an invalid bundle generation response.");
  }
  console.log(JSON.stringify(response, null, 2));
}

async function openReview(reviewRequestId: string): Promise<void> {
  const response = await requestJson(
    resolveSession(),
    `/review/requests/${encodeURIComponent(reviewRequestId)}`,
  );
  if (
    typeof response !== "object"
    || response === null
    || (response as { reviewRequestId?: unknown }).reviewRequestId !== reviewRequestId
    || typeof (response as { deepLinkPath?: unknown }).deepLinkPath !== "string"
  ) {
    throw new Error("Meadow returned an invalid Bundle Boundary Review Request.");
  }
  await openBrowser(
    (response as { deepLinkPath: string }).deepLinkPath,
    "review.open",
    { reviewRequestId },
  );
}

async function saveBundleGeneration(options: BundleVersionOptions): Promise<void> {
  console.error(`meadow: saving version '${options.versionId}' for bundle '${options.slug}'...`);
  const response = await requestJson(
    resolveSession(),
    `/bundles/${encodeURIComponent(options.slug)}/review/versions/${encodeURIComponent(options.versionId)}/save-generation`,
    "POST",
    {},
  );
  if (
    typeof response !== "object"
    || response === null
    || (response as { operation?: unknown }).operation !== "bundle.save-generation"
    || (response as { versionId?: unknown }).versionId !== options.versionId
    || typeof (response as { savedGenerationId?: unknown }).savedGenerationId !== "string"
  ) {
    throw new Error("Meadow returned an invalid save-generation response.");
  }
  console.log(JSON.stringify(response, null, 2));
}

async function publishBundle(options: BundleVersionOptions): Promise<void> {
  console.error(`meadow: publishing version '${options.versionId}' for bundle '${options.slug}'...`);
  const response = await requestJson(
    resolveSession(),
    `/bundles/${encodeURIComponent(options.slug)}/sharing/publish`,
    "POST",
    { versionId: options.versionId },
  );
  if (
    typeof response !== "object"
    || response === null
    || (response as { operation?: unknown }).operation !== "bundle.publish"
    || (response as { versionId?: unknown }).versionId !== options.versionId
    || typeof (response as { savedGenerationId?: unknown }).savedGenerationId !== "string"
    || typeof (response as { url?: unknown }).url !== "string"
    || typeof (response as { provider?: { id?: unknown; instanceId?: unknown } }).provider?.id !== "string"
    || typeof (response as { provider?: { id?: unknown; instanceId?: unknown } }).provider?.instanceId !== "string"
  ) {
    throw new Error("Meadow returned an invalid publication response.");
  }
  console.log(JSON.stringify(response, null, 2));
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
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === "help" && rawArgs.length > 1
    ? [...rawArgs.slice(1), "--help"]
    : rawArgs;
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    showHelp();
    return;
  }

  const isHelpRequest = args.includes("--help") || args.includes("-h");
  const isRuntimeCommand = (
    args[0] === "open"
  ) || (
    args[0] === "bundles"
    && ["list", "create", "archive", "unarchive"].includes(args[1] ?? "")
  ) || (
    args[0] === "bundle"
    && ["track", "node", "open", "generate", "save-generation", "publish", "nodes", "filters"].includes(args[1] ?? "")
  ) || (
    args[0] === "review" && args[1] === "open"
  );
  if (isRuntimeCommand && !isHelpRequest) await ensureCliRuntime();

  if (args[0] === "open") {
    if (args.length !== 1) throw new Error("Usage: meadow open");
    await openBrowser("/", "open");
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

  if (args[0] === "bundles" && (args.length === 1 || args[1] === "--help" || args[1] === "-h")) {
    showBundlesHelp();
    return;
  }

  if (args[0] === "bundles" && args[1] === "create") {
    if (args[2] === "--help" || args[2] === "-h") {
      showBundlesCreateHelp();
      return;
    }
    await createBundle(parseCreateBundleOptions(args.slice(2)));
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

  if (args[0] === "bundle" && args[1] === "node") {
    if (
      args.length === 2
      || args[2] === "--help"
      || args[2] === "-h"
      || args[3] === "--help"
      || args[3] === "-h"
    ) {
      showBundleNodeHelp();
      return;
    }
    await runBundleNodeCommand(
      args.slice(2),
      (pathname, method, body) => requestJson(resolveSession(), pathname, method, body),
    );
    return;
  }

  if (args[0] === "bundle" && args[1] === "open") {
    if (args[2] === "--help" || args[2] === "-h") {
      console.log("Usage: meadow bundle open <bundle-slug>");
      return;
    }
    const slug = parseSlugOnly(args.slice(2), "meadow bundle open <bundle-slug>");
    await openBrowser(`/bundle/${encodeURIComponent(slug)}`, "bundle.open");
    return;
  }

  if (args[0] === "review" && args[1] === "open") {
    if (args[2] === "--help" || args[2] === "-h") {
      console.log(`Usage: meadow review open <review-request-id>

Opens the full Meadow Web Client in the default browser at a durable Bundle
Boundary Review Request. This is an optional visual workflow; generation pause
responses declare whether their returned command actions can resolve headlessly.`);
      return;
    }
    const reviewRequestId = parseSlugOnly(
      args.slice(2),
      "meadow review open <review-request-id>",
    );
    await openReview(reviewRequestId);
    return;
  }

  if (args[0] === "bundle" && args[1] === "track") {
    if (args[2] === "--help" || args[2] === "-h") {
      showBundleTrackHelp();
      return;
    }
    await trackBundle(parseTrackBundleOptions(args.slice(2)));
    return;
  }

  if (args[0] === "bundle" && args[1] === "generate") {
    if (args[2] === "--help" || args[2] === "-h") {
      showBundleGenerateHelp();
      return;
    }
    await generateBundle(parseSlugOnly(args.slice(2), "meadow bundle generate <bundle-slug>"));
    return;
  }

  if (args[0] === "bundle" && args[1] === "save-generation") {
    if (args[2] === "--help" || args[2] === "-h") {
      showBundleSaveGenerationHelp();
      return;
    }
    await saveBundleGeneration(parseBundleVersionOptions(args.slice(2), "save-generation"));
    return;
  }

  if (args[0] === "bundle" && args[1] === "publish") {
    if (args[2] === "--help" || args[2] === "-h") {
      showBundlePublishHelp();
      return;
    }
    await publishBundle(parseBundleVersionOptions(args.slice(2), "publish"));
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

async function run(): Promise<void> {
  try {
    await main();
  } finally {
    await runtimeLease?.release();
  }
}

run().catch((error: unknown) => {
  if (error instanceof CliApiError) {
    console.error(JSON.stringify(error.body, null, 2));
  } else {
    console.error(`meadow: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
