#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ALWAYS_IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".terraform",
  "coverage",
  "node_modules",
  "target",
]);

function normalizePolicyPath(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  if (value.includes("\\")) {
    throw new Error(`${label} must use forward slashes: ${value}`);
  }

  const normalized = path.posix.normalize(value);
  if (
    path.posix.isAbsolute(value)
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized !== value
  ) {
    throw new Error(`${label} must be a normalized repository-relative path: ${value}`);
  }

  return normalized;
}

function validateEntries(entries, label, { mustBeDistDirectory = false } = {}) {
  if (!Array.isArray(entries)) {
    throw new Error(`${label} must be an array`);
  }

  const seenPaths = new Set();
  return entries.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${label}[${index}] must be an object`);
    }

    const entryPath = normalizePolicyPath(entry.path, `${label}[${index}].path`);
    if (mustBeDistDirectory && path.posix.basename(entryPath) !== "dist") {
      throw new Error(`${label}[${index}].path must name a dist directory: ${entryPath}`);
    }

    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      throw new Error(`${label}[${index}].reason must explain why the exception is needed`);
    }

    if (seenPaths.has(entryPath)) {
      throw new Error(`${label} contains the duplicate path ${entryPath}`);
    }
    seenPaths.add(entryPath);

    return { path: entryPath, reason: entry.reason.trim() };
  });
}

export function validatePolicy(policy) {
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("dist policy must be an object");
  }

  return {
    allowedDistDirectories: validateEntries(
      policy.allowedDistDirectories,
      "allowedDistDirectories",
      { mustBeDistDirectory: true },
    ),
    ignoredTrees: validateEntries(policy.ignoredTrees ?? [], "ignoredTrees"),
  };
}

export async function loadPolicy(policyPath) {
  const contents = await readFile(policyPath, "utf8");
  return validatePolicy(JSON.parse(contents));
}

function toRepositoryPath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

export async function findUnexpectedDistDirectories(repositoryRoot, policy) {
  const validatedPolicy = validatePolicy(policy);
  const allowedDistDirectories = new Set(
    validatedPolicy.allowedDistDirectories.map(entry => entry.path),
  );
  const ignoredTrees = new Set(validatedPolicy.ignoredTrees.map(entry => entry.path));
  const unexpected = [];

  async function walk(relativeDirectory) {
    const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || ALWAYS_IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      const childRelativePath = path.join(relativeDirectory, entry.name);
      const repositoryPath = toRepositoryPath(childRelativePath);

      if (ignoredTrees.has(repositoryPath)) {
        continue;
      }

      if (entry.name === "dist") {
        if (!allowedDistDirectories.has(repositoryPath)) {
          unexpected.push(repositoryPath);
        }
        continue;
      }

      await walk(childRelativePath);
    }
  }

  await walk("");
  return unexpected.sort();
}

function parseArguments(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root" || argument === "--policy") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a path`);
      }
      parsed[argument.slice(2)] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!parsed.root || !parsed.policy) {
    throw new Error("Usage: check-dist-directories.mjs --root <repository> --policy <policy.json>");
  }

  return parsed;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const repositoryRoot = path.resolve(args.root);
  const policy = await loadPolicy(path.resolve(args.policy));
  const unexpected = await findUnexpectedDistDirectories(repositoryRoot, policy);

  if (unexpected.length > 0) {
    console.error("❌ Unexpected dist directories found:");
    for (const directory of unexpected) {
      console.error(`  - ${directory}`);
    }
    console.error("");
    console.error("Remove these generated directories. If one is an intentional packaging or deployment output,");
    console.error("add a narrowly scoped, explained exception to the repository's dist policy.");
    process.exitCode = 1;
    return;
  }

  const approvedCount = policy.allowedDistDirectories.length;
  console.log(`✅ No unexpected dist directories (${approvedCount} intentional outputs allowed).`);
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) {
  main().catch(error => {
    console.error(`❌ Unable to check dist directories: ${error.message}`);
    process.exitCode = 1;
  });
}
