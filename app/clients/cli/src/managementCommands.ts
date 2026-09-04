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

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestJson = (
  pathname: string,
  method?: ApiMethod,
  body?: unknown,
) => Promise<unknown>;

type JsonObject = Record<string, unknown>;

interface ParsedOptions {
  positionals: string[];
  values: Map<string, string>;
  flags: Set<string>;
}

interface ProviderOptions {
  providerId: string;
  slug: string;
}

const READER_CONNECTIONS = new Set(["connected", "disconnected"]);
const CLEANUP_POLICIES = new Set(["keep", "delete-after-success"]);

function requireObject(value: unknown, description: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Meadow returned an invalid ${description} response.`);
  }
  return value as JsonObject;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function parseOptions(
  args: string[],
  valueOptions: readonly string[],
  flagOptions: readonly string[] = [],
): ParsedOptions {
  const allowedValues = new Set(valueOptions);
  const allowedFlags = new Set(flagOptions);
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    if (allowedFlags.has(argument)) {
      if (flags.has(argument)) throw new Error(`${argument} may only be provided once`);
      flags.add(argument);
      continue;
    }
    if (!allowedValues.has(argument)) throw new Error(`Unknown option: ${argument}`);
    if (values.has(argument)) throw new Error(`${argument} may only be provided once`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    values.set(argument, value);
    index += 1;
  }
  return { positionals, values, flags };
}

function requireValue(options: ParsedOptions, name: string): string {
  const value = options.values.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requirePositionals(options: ParsedOptions, count: number, usage: string): string[] {
  if (options.positionals.length !== count || options.positionals.some(value => value.startsWith("--"))) {
    throw new Error(`Usage: ${usage}`);
  }
  return options.positionals;
}

function requireReaderConnection(value: string | undefined, required: boolean): string | undefined {
  if (!value && required) throw new Error("--readers is required");
  if (value && !READER_CONNECTIONS.has(value)) {
    throw new Error("--readers must be connected or disconnected");
  }
  return value;
}

function requireCleanupPolicy(value: string | undefined, required: boolean): string | undefined {
  if (!value && required) throw new Error("--predecessor-files is required");
  if (value && !CLEANUP_POLICIES.has(value)) {
    throw new Error("--predecessor-files must be keep or delete-after-success");
  }
  return value;
}

function providerBase(providerId: string, slug: string): string {
  return `/sharing/publishing-providers/${encodeURIComponent(providerId)}/bundles/${encodeURIComponent(slug)}`;
}

function providerOptions(options: ParsedOptions, usage: string): ProviderOptions {
  const [slug] = requirePositionals(options, 1, usage);
  return { providerId: requireValue(options, "--provider"), slug };
}

export function showBundleVersionsHelp(): void {
  console.log(`Usage:
  meadow bundle versions list <bundle-slug>
  meadow bundle versions get <bundle-slug> <version-id>
  meadow bundle versions create <bundle-slug> [--notes <text>] [--confirm-no-changes]
  meadow bundle versions update <bundle-slug> <version-id> --notes <text>
  meadow bundle versions delete <bundle-slug> <version-id>
  meadow bundle versions restore <bundle-slug> <version-id>
  meadow bundle versions cancel-current <bundle-slug>

Commands:
  list            List every generated version and its derived, save, and integrity state.
  get             Read one generated-version record.
  create          Create a new unsaved version after the current version is saved.
  update          Replace a version's private local note without changing its files.
  delete          Delete a frozen version's local files and retain its tombstone.
  restore         Restore modified frozen files exactly from Meadow Home Git history.
  cancel-current  Remove the never-saved current version and return to its predecessor.

Creating a version with no generated changes requires --confirm-no-changes.
Local deletion never deletes publication records or remote files.`);
}

export async function runBundleVersionsCommand(args: string[], request: RequestJson): Promise<void> {
  const operation = args[0];
  if (!operation || operation === "--help" || operation === "-h") {
    showBundleVersionsHelp();
    return;
  }
  if (operation === "list") {
    const options = parseOptions(args.slice(1), []);
    const [slug] = requirePositionals(options, 1, "meadow bundle versions list <bundle-slug>");
    const response = requireObject(await request(`/bundles/${encodeURIComponent(slug)}/review/versions`), "version list");
    printJson({ ...response, schemaVersion: 1, operation: "bundle.versions.list", slug });
    return;
  }
  if (operation === "get") {
    const options = parseOptions(args.slice(1), []);
    const [slug, versionId] = requirePositionals(options, 2, "meadow bundle versions get <bundle-slug> <version-id>");
    const response = requireObject(await request(`/bundles/${encodeURIComponent(slug)}/review/versions`), "version list");
    const versions: unknown[] = Array.isArray(response.versions) ? response.versions as unknown[] : [];
    const version: unknown = versions.find(candidate => requireObject(candidate, "generated version").versionId === versionId);
    if (!version) throw new Error(`Unknown generated bundle version ${versionId}`);
    printJson({ schemaVersion: 1, operation: "bundle.versions.get", slug, version });
    return;
  }
  if (operation === "create") {
    const options = parseOptions(args.slice(1), ["--notes"], ["--confirm-no-changes"]);
    const [slug] = requirePositionals(options, 1, "meadow bundle versions create <bundle-slug> [options]");
    const response = requireObject(await request(
      `/bundles/${encodeURIComponent(slug)}/generation/versions`,
      "POST",
      {
        ...(options.values.has("--notes") ? { notes: options.values.get("--notes") } : {}),
        confirmedNoGeneratedChanges: options.flags.has("--confirm-no-changes"),
      },
    ), "version creation");
    printJson({ ...response, schemaVersion: 1, operation: "bundle.versions.create", slug });
    if (response.paused === true) process.exitCode = 2;
    return;
  }
  if (operation === "update") {
    const options = parseOptions(args.slice(1), ["--notes"]);
    const [slug, versionId] = requirePositionals(options, 2, "meadow bundle versions update <bundle-slug> <version-id> --notes <text>");
    const notes = requireValue(options, "--notes");
    const response = requireObject(await request(
      `/bundles/${encodeURIComponent(slug)}/review/versions/${encodeURIComponent(versionId)}`,
      "PATCH",
      { notes },
    ), "version update");
    printJson({ ...response, schemaVersion: 1, operation: "bundle.versions.update", slug, versionId, notes });
    return;
  }
  if (operation === "delete" || operation === "restore") {
    const options = parseOptions(args.slice(1), []);
    const [slug, versionId] = requirePositionals(options, 2, `meadow bundle versions ${operation} <bundle-slug> <version-id>`);
    const pathname = `/bundles/${encodeURIComponent(slug)}/review/versions/${encodeURIComponent(versionId)}`;
    const response = requireObject(await request(
      operation === "restore" ? `${pathname}/restore-frozen` : pathname,
      operation === "restore" ? "POST" : "DELETE",
    ), `version ${operation}`);
    printJson({ ...response, schemaVersion: 1, operation: `bundle.versions.${operation}`, slug, versionId });
    return;
  }
  if (operation === "cancel-current") {
    const options = parseOptions(args.slice(1), []);
    const [slug] = requirePositionals(options, 1, "meadow bundle versions cancel-current <bundle-slug>");
    const response = requireObject(await request(
      `/bundles/${encodeURIComponent(slug)}/review/versions/current/cancel`,
      "POST",
    ), "current-version cancellation");
    printJson({ ...response, schemaVersion: 1, operation: "bundle.versions.cancel-current", slug });
    return;
  }
  throw new Error(`Unknown bundle versions command: ${operation}`);
}

export function showBundlePublicationsHelp(): void {
  console.log(`Usage:
  meadow bundle publications list <bundle-slug> --provider <provider-id> [--version <version-id>]
  meadow bundle publications get <bundle-slug> <revision-id> --provider <provider-id>
  meadow bundle publications configure <bundle-slug> --provider <provider-id> --slug <publish-slug> [options]
  meadow bundle publications plan <bundle-slug> --provider <provider-id> --version <version-id> [options]
  meadow bundle publications cancel <bundle-slug> <revision-id> --provider <provider-id>
  meadow bundle publications delete <bundle-slug> <revision-id> --provider <provider-id>

Options for a successor publication revision:
  --readers <connected|disconnected>
  --predecessor-files <keep|delete-after-success>

Use 'configure' to change a provider's publish slug. If that address has
already published content, the reader and predecessor-file choices are
required and the command creates a pending revision for the selected or current
generated version. Re-running 'plan' updates the provider's one pending revision.
'cancel' removes only a never-published pending record. 'delete' removes the
remote files for a published revision and retains its deleted history record.`);
}

async function loadPublicationState(request: RequestJson, options: ProviderOptions, versionId?: string): Promise<JsonObject> {
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return requireObject(await request(`${providerBase(options.providerId, options.slug)}/publication-state${query}`), "publication state");
}

export async function runBundlePublicationsCommand(args: string[], request: RequestJson): Promise<void> {
  const operation = args[0];
  if (!operation || operation === "--help" || operation === "-h") {
    showBundlePublicationsHelp();
    return;
  }
  if (operation === "list") {
    const parsed = parseOptions(args.slice(1), ["--provider", "--version"]);
    const options = providerOptions(parsed, "meadow bundle publications list <bundle-slug> --provider <provider-id>");
    const state = await loadPublicationState(request, options, parsed.values.get("--version"));
    printJson({ schemaVersion: 1, operation: "bundle.publications.list", slug: options.slug, providerId: options.providerId, state });
    return;
  }
  if (operation === "get") {
    const parsed = parseOptions(args.slice(1), ["--provider"]);
    const [slug, revisionId] = requirePositionals(parsed, 2, "meadow bundle publications get <bundle-slug> <revision-id> --provider <provider-id>");
    const options = { slug, providerId: requireValue(parsed, "--provider") };
    const state = await loadPublicationState(request, options);
    const revisions: unknown[] = Array.isArray(state.revisions) ? state.revisions as unknown[] : [];
    const revision: unknown = revisions.find(candidate => requireObject(candidate, "publication revision").publicationRevisionId === revisionId);
    if (!revision) throw new Error(`Unknown publication revision ${revisionId}`);
    printJson({ schemaVersion: 1, operation: "bundle.publications.get", slug, providerId: options.providerId, revision });
    return;
  }
  if (operation === "configure") {
    const parsed = parseOptions(args.slice(1), ["--provider", "--slug", "--version", "--readers", "--predecessor-files"]);
    const options = providerOptions(parsed, "meadow bundle publications configure <bundle-slug> --provider <provider-id> --slug <publish-slug>");
    const publishSlug = requireValue(parsed, "--slug");
    const base = providerBase(options.providerId, options.slug);
    const currentConfig = requireObject(await request(`${base}/provider-config`), "provider configuration");
    const state = await loadPublicationState(request, options);
    const revisions = Array.isArray(state.revisions) ? state.revisions : [];
    const changingPublishedAddress = revisions.some(candidate => {
      const revision = requireObject(candidate, "publication revision");
      return revision.publishedAt !== null && revision.publishedAt !== undefined;
    }) && currentConfig.publishSlug !== publishSlug;
    const readerConnectionToPredecessor = requireReaderConnection(parsed.values.get("--readers"), changingPublishedAddress);
    const predecessorCleanupPolicy = requireCleanupPolicy(parsed.values.get("--predecessor-files"), changingPublishedAddress);
    const response = requireObject(await request(`${base}/provider-config`, "PUT", {
      publishSlug,
      ...(parsed.values.has("--version") ? { versionId: parsed.values.get("--version") } : {}),
      ...(readerConnectionToPredecessor ? { readerConnectionToPredecessor } : {}),
      ...(predecessorCleanupPolicy ? { predecessorCleanupPolicy } : {}),
    }), "provider configuration update");
    printJson({ ...response, schemaVersion: 1, operation: "bundle.publications.configure", slug: options.slug, providerId: options.providerId });
    return;
  }
  if (operation === "plan") {
    const parsed = parseOptions(args.slice(1), ["--provider", "--version", "--readers", "--predecessor-files"]);
    const options = providerOptions(parsed, "meadow bundle publications plan <bundle-slug> --provider <provider-id> --version <version-id> [options]");
    const versionId = requireValue(parsed, "--version");
    const readerConnectionToPredecessor = requireReaderConnection(parsed.values.get("--readers"), true);
    const predecessorCleanupPolicy = requireCleanupPolicy(parsed.values.get("--predecessor-files"), true);
    const response = requireObject(await request(
      `${providerBase(options.providerId, options.slug)}/publication-revisions/plan`,
      "POST",
      { versionId, readerConnectionToPredecessor, predecessorCleanupPolicy },
    ), "publication planning");
    printJson({ ...response, schemaVersion: 1, operation: "bundle.publications.plan", slug: options.slug, providerId: options.providerId, versionId });
    return;
  }
  if (operation === "cancel" || operation === "delete") {
    const parsed = parseOptions(args.slice(1), ["--provider"]);
    const [slug, revisionId] = requirePositionals(parsed, 2, `meadow bundle publications ${operation} <bundle-slug> <revision-id> --provider <provider-id>`);
    const providerId = requireValue(parsed, "--provider");
    const response = requireObject(await request(
      `${providerBase(providerId, slug)}/publication-revisions/${encodeURIComponent(revisionId)}${operation === "cancel" ? "/cancel" : ""}`,
      operation === "cancel" ? "POST" : "DELETE",
    ), `publication ${operation}`);
    printJson({ ...response, schemaVersion: 1, operation: `bundle.publications.${operation}`, slug, providerId, revisionId });
    return;
  }
  throw new Error(`Unknown bundle publications command: ${operation}`);
}

export function showBundlesRenameHelp(): void {
  console.log(`Usage:
  meadow bundles rename-plan <bundle-slug>
  meadow bundles rename <bundle-slug> --to <new-slug> [--provider-decision <decision> ...]
  meadow bundles undo-rename <renamed-bundle-slug>

A provider decision is colon-separated:
  <provider-id>:<publish-slug>:<connected|disconnected>:<keep|delete-after-success>

Run rename-plan first. Supply exactly one --provider-decision for every
provider it reports. An unpublished rename needs no provider decisions, keeps
version 1, and regenerates tracked files. A published rename creates an unsaved
generated successor. Undo is available until one provider publishes it.`);
}

function parseProviderDecision(value: string): JsonObject {
  const [providerId, publishSlug, readerConnectionToPredecessor, predecessorCleanupPolicy, ...extra] = value.split(":");
  if (!providerId || !publishSlug || !readerConnectionToPredecessor || !predecessorCleanupPolicy || extra.length > 0) {
    throw new Error("--provider-decision must contain provider-id:publish-slug:reader-choice:file-choice");
  }
  requireReaderConnection(readerConnectionToPredecessor, true);
  requireCleanupPolicy(predecessorCleanupPolicy, true);
  return { providerId, publishSlug, readerConnectionToPredecessor, predecessorCleanupPolicy };
}

export async function runBundlesRenameCommand(args: string[], request: RequestJson): Promise<void> {
  const operation = args[0];
  if (!operation || operation === "--help" || operation === "-h") {
    showBundlesRenameHelp();
    return;
  }
  if (operation === "rename-plan") {
    const parsed = parseOptions(args.slice(1), []);
    const [slug] = requirePositionals(parsed, 1, "meadow bundles rename-plan <bundle-slug>");
    const plan = requireObject(await request(`/bundles/${encodeURIComponent(slug)}/rename-plan`), "bundle rename plan");
    printJson({ ...plan, schemaVersion: 1, operation: "bundles.rename-plan" });
    return;
  }
  if (operation === "rename") {
    const positionals: string[] = [];
    const providerDecisions: JsonObject[] = [];
    let newSlug: string | undefined;
    for (let index = 1; index < args.length; index += 1) {
      const argument = args[index];
      if (!argument.startsWith("--")) {
        positionals.push(argument);
        continue;
      }
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      if (argument === "--to") {
        if (newSlug) throw new Error("--to may only be provided once");
        newSlug = value;
      } else if (argument === "--provider-decision") {
        providerDecisions.push(parseProviderDecision(value));
      } else {
        throw new Error(`Unknown option: ${argument}`);
      }
      index += 1;
    }
    if (positionals.length !== 1 || !newSlug) {
      throw new Error("Usage: meadow bundles rename <bundle-slug> --to <new-slug> [--provider-decision <decision> ...]");
    }
    const slug = positionals[0];
    const response = requireObject(await request(`/bundles/${encodeURIComponent(slug)}/rename`, "POST", {
      newSlug,
      providers: providerDecisions,
    }), "bundle rename");
    printJson({ ...response, schemaVersion: 1, operation: "bundles.rename", previousSlug: slug });
    return;
  }
  if (operation === "undo-rename") {
    const parsed = parseOptions(args.slice(1), []);
    const [slug] = requirePositionals(parsed, 1, "meadow bundles undo-rename <renamed-bundle-slug>");
    const response = requireObject(await request(`/bundles/${encodeURIComponent(slug)}/rename/undo`, "POST"), "bundle rename undo");
    printJson({ ...response, schemaVersion: 1, operation: "bundles.undo-rename", renamedSlug: slug });
    return;
  }
  throw new Error(`Unknown bundle rename command: ${operation}`);
}

export async function listPublishingProviders(request: RequestJson): Promise<void> {
  const response = requireObject(await request("/sharing/publishing-providers"), "publishing provider list");
  printJson({ ...response, schemaVersion: 1, operation: "providers.list" });
}
