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

/**
 * Benchmark comparing native fast_git_ops status command vs isomorphic-git statusMatrix
 * Run with: npx tsx benchmark.ts /path/to/git/repo
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import git from 'isomorphic-git';
import { resolveNativeRustBinaryPath } from '../../../shared_code/utils/nativeRustBinaryPath.js';

const FAST_GIT_OPS_BINARY = resolveNativeRustBinaryPath({
  importMetaUrl: import.meta.url,
  upLevelsToApp: 3,
  cratePathSegments: ['fast_git_ops', 'fast_git_ops_code'],
  binaryName: 'fast_git_ops_bin',
});

// Get target directory from command line args
const targetDir = process.argv[2] || path.join(import.meta.dirname, '../../..');

console.log(`\n🔬 Benchmarking git status performance on: ${targetDir}\n`);

// Find git root
function findGitRoot(startPath: string): string | null {
  let currentPath = startPath;
  while (currentPath !== path.dirname(currentPath)) {
    const gitDir = path.join(currentPath, '.git');
    if (fs.existsSync(gitDir)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  return null;
}

const gitRoot = findGitRoot(targetDir);
if (!gitRoot) {
  console.error('Not a git repository');
  process.exit(1);
}

console.log(`Git root: ${gitRoot}`);

// Benchmark native fast_git_ops status
console.log('\n📊 Running native fast_git_ops status (gitoxide-based)...');
const nativeStart = Date.now();
try {
  const result = execSync(`"${FAST_GIT_OPS_BINARY}" status "${targetDir}"`, { encoding: 'utf8' });
  const nativeResults = JSON.parse(result);
  const nativeTime = Date.now() - nativeStart;
  console.log(`   Native: ${nativeTime}ms (found ${nativeResults.length} changed files)`);
} catch (error) {
  console.error('   Native fast_git_ops failed:', error);
}

// Benchmark isomorphic-git
console.log('\n📊 Running isomorphic-git statusMatrix...');
const isoStart = Date.now();
try {
  const statusMatrix = await git.statusMatrix({
    fs,
    dir: gitRoot,
  });
  
  // Count changed files (same logic as confFileExplorerUtils.ts)
  let changedCount = 0;
  for (const [_filepath, head, workdir, stage] of statusMatrix) {
    if (head === 0 && workdir === 2) changedCount++; // new
    else if (head === 1 && workdir === 2) changedCount++; // modified
    else if (head === 1 && workdir === 0) changedCount++; // deleted
    else if (stage === 2 && head === 0) changedCount++; // staged-new
    else if (stage === 2 && head === 1) changedCount++; // staged-modified
  }
  
  const isoTime = Date.now() - isoStart;
  console.log(`   Isomorphic-git: ${isoTime}ms (found ${changedCount} changed files out of ${statusMatrix.length} total entries)`);
} catch (error) {
  console.error('   Isomorphic-git failed:', error);
}

console.log('\n✅ Benchmark complete!\n');
