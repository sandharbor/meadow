#!/usr/bin/env node
/**
 * Reports whether source files belong to an architectural owner.
 *
 * The check walks a source root, skips generated/build directories, and treats
 * files under `areas/...` as area-owned and files under `shared/...` as shared.
 * Use `--require-ownership` to fail when a source file does not live in one of
 * those owned locations.
 */
import fs from 'fs';
import path from 'path';

const sourceExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.scss',
  '.ts',
  '.tsx',
]);

const skipDirectories = new Set([
  '.git',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

function parseArgs(argv) {
  const args = {
    sourceRoot: argv[2] ?? 'src',
    requireOwnership: false,
    summary: false,
  };

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--require-ownership') {
      args.requireOwnership = true;
    } else if (arg === '--summary') {
      args.summary = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirectories.has(entry.name)) continue;
      results.push(...walkFiles(path.join(directory, entry.name)));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      results.push(path.join(directory, entry.name));
    }
  }
  return results;
}

function getOwner(sourceRoot, filePath) {
  const relativePath = toPosixPath(path.relative(sourceRoot, filePath));
  const parts = relativePath.split('/');

  if (parts[0] === 'areas') {
    if (parts[1] === 'bundles') {
      return 'area:bundles';
    }
    if (parts[1] === 'bundle' && parts[2]) {
      return `area:bundle/${parts[2]}`;
    }
    if (parts[1]) {
      return `area:${parts[1]}`;
    }
  }

  if (parts[0] === 'shared') {
    return 'shared';
  }

  return null;
}

function printList(title, rows, formatRow, summary) {
  if (rows.length === 0 || summary) return;
  console.log(title);
  for (const row of rows) {
    console.log(`  - ${formatRow(row)}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const sourceRoot = path.resolve(args.sourceRoot);
  const sourceLabel = path.relative(process.cwd(), sourceRoot) || '.';

  const files = walkFiles(sourceRoot).sort();
  const ownership = files.map((file) => {
    const relativePath = toPosixPath(path.relative(sourceRoot, file));
    const owner = getOwner(sourceRoot, file);

    return {
      file,
      relativePath,
      owner,
    };
  });

  const owned = ownership.filter((item) => item.owner);
  const unowned = ownership.filter((item) => !item.owner);

  console.log(
    `Area ownership for ${sourceLabel}: ${files.length} files, ${owned.length} owned, ${unowned.length} unowned`
  );

  printList('Unowned source files:', unowned, (item) => `${item.relativePath}`, args.summary);

  if (args.requireOwnership && unowned.length > 0) {
    console.log(`❌ ${unowned.length} source file(s) do not have an area/shared owner`);
    process.exit(1);
  }

  const ownershipStatus = unowned.length > 0 ? `${unowned.length} ownership gap(s) remain` : 'all source files are owned';
  console.log(`✅ Area ownership checked for ${sourceLabel}: ${ownershipStatus}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
