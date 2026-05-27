#!/usr/bin/env node
/**
 * Reports whether source files stay within the configured size limit.
 *
 * The check walks a source root, skips generated/build directories, and counts
 * lines for each source file. Files over `--max-lines` must have a documented
 * temporary exception when `--require-line-exceptions` is used; stale exceptions
 * are reported when the matching file is no longer oversized.
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
    exceptionsPath: null,
    maxLines: 1000,
    requireLineExceptions: false,
    summary: false,
  };

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--exceptions') {
      args.exceptionsPath = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--max-lines') {
      args.maxLines = Number.parseInt(argv[i + 1] ?? '', 10);
      i += 1;
    } else if (arg === '--require-line-exceptions') {
      args.requireLineExceptions = true;
    } else if (arg === '--summary') {
      args.summary = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.maxLines) || args.maxLines <= 0) {
    throw new Error('--max-lines must be a positive integer');
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

function loadExceptions(exceptionsPath) {
  if (!exceptionsPath) return { temporaryLineLimitExceptions: {} };
  const resolved = path.resolve(exceptionsPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Exceptions file not found: ${exceptionsPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return {
    temporaryLineLimitExceptions: parsed.temporaryLineLimitExceptions ?? {},
  };
}

function countLines(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.length === 0) return 0;
  const lineBreaks = source.match(/\n/g)?.length ?? 0;
  return source.endsWith('\n') ? lineBreaks : lineBreaks + 1;
}

function hasDocumentedLineException(exception) {
  return Boolean(
    exception &&
      typeof exception.reason === 'string' &&
      exception.reason.trim() &&
      typeof exception.followUp === 'string' &&
      exception.followUp.trim()
  );
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
  const exceptions = loadExceptions(args.exceptionsPath);
  const lineExceptions = exceptions.temporaryLineLimitExceptions;

  const files = walkFiles(sourceRoot).sort();
  const fileSizes = files.map((file) => {
    const relativePath = toPosixPath(path.relative(sourceRoot, file));
    const lines = countLines(file);
    const lineException = lineExceptions[relativePath];
    const oversized = lines > args.maxLines;
    const documentedLineException = hasDocumentedLineException(lineException);

    return {
      file,
      relativePath,
      lines,
      oversized,
      documentedLineException,
    };
  });

  const oversized = fileSizes.filter((item) => item.oversized);
  const oversizedWithoutException = oversized.filter((item) => !item.documentedLineException);
  const staleLineExceptions = Object.keys(lineExceptions)
    .filter((relativePath) => !oversized.some((item) => item.relativePath === relativePath))
    .sort();

  console.log(
    `File size check for ${sourceLabel}: ${files.length} files, ${oversized.length} over ${args.maxLines} lines`
  );

  printList(
    'Oversized source files:',
    oversized,
    (item) => `${item.relativePath} (${item.lines} lines${item.documentedLineException ? ', documented exception' : ', missing exception'})`,
    args.summary
  );
  printList(
    'Stale line-limit exceptions:',
    staleLineExceptions,
    (relativePath) => relativePath,
    args.summary
  );

  if (args.requireLineExceptions && oversizedWithoutException.length > 0) {
    console.log(`❌ ${oversizedWithoutException.length} oversized source file(s) lack a documented temporary exception`);
    process.exit(1);
  }

  const lineStatus = oversizedWithoutException.length > 0
    ? `${oversizedWithoutException.length} line-limit exception gap(s) remain`
    : 'all oversized source files have documented exceptions';
  console.log(`✅ File size checked for ${sourceLabel}: ${lineStatus}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
