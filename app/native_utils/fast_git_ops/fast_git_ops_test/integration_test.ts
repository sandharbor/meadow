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

import test from 'tape';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import git from 'isomorphic-git';
import { resolveNativeRustBinaryPath } from '../../../shared_code/utils/nativeRustBinaryPath.js';

const TEST_REPO_DIR = path.join(import.meta.dirname, 'test_repo');
const FAST_GIT_OPS_BINARY = resolveNativeRustBinaryPath({
  importMetaUrl: import.meta.url,
  upLevelsToApp: 3,
  cratePathSegments: ['fast_git_ops', 'fast_git_ops_code'],
  binaryName: 'fast_git_ops_bin',
});

interface FileStatus {
  path: string;
  status: string;
}

interface DirLogCommit {
  sha: string;
  parent_sha: string | null;
  subject: string;
  author_name: string;
  author_time: number;
  files_changed_count: number;
}

interface DirLogResult {
  commits: DirLogCommit[];
}

interface CommitFilesResult {
  sha: string;
  parent_sha: string | null;
  files: Array<{ path: string; status: "A" | "M" | "D" }>;
}

interface CatFileResult {
  found: boolean;
  kind?: string;
  data_base64?: string;
}

interface FileLogResult {
  commits: Array<{ sha: string; parent_sha: string | null; subject: string }>;
}

interface HtmlSectionDiffResult {
  files: Array<{
    path: string;
    repo_path: string;
    status: 'A' | 'M' | 'D';
    sections: {
      head: boolean;
      header: boolean;
      main: boolean;
      footer: boolean;
    };
  }>;
}

// Helper to run fast_git_ops status command and parse output
function runGitStatus(directory: string): FileStatus[] {
  const result = execSync(`"${FAST_GIT_OPS_BINARY}" status "${directory}"`, { encoding: 'utf8' });
  return JSON.parse(result) as FileStatus[];
}

function runDirLog(directory: string, limit = 50): DirLogResult {
  const result = execSync(`"${FAST_GIT_OPS_BINARY}" dir-log "${directory}" --limit "${limit}"`, { encoding: "utf8" });
  return JSON.parse(result) as DirLogResult;
}

function runCommitFiles(directory: string, sha: string): CommitFilesResult {
  const result = execSync(`"${FAST_GIT_OPS_BINARY}" commit-files "${directory}" "${sha}"`, { encoding: "utf8" });
  return JSON.parse(result) as CommitFilesResult;
}

function runCatFile(directory: string, sha: string, repoRelPath: string): CatFileResult {
  const result = execSync(`"${FAST_GIT_OPS_BINARY}" cat-file "${directory}" "${sha}" "${repoRelPath}"`, { encoding: "utf8" });
  return JSON.parse(result) as CatFileResult;
}

function runFileLog(directory: string, repoRelPath: string, limit = 50): FileLogResult {
  const result = execSync(`"${FAST_GIT_OPS_BINARY}" file-log "${directory}" "${repoRelPath}" --limit "${limit}"`, { encoding: "utf8" });
  return JSON.parse(result) as FileLogResult;
}

function runHtmlSectionDiff(directory: string): HtmlSectionDiffResult {
  const result = execSync(`"${FAST_GIT_OPS_BINARY}" html-section-diff "${directory}"`, { encoding: 'utf8' });
  return JSON.parse(result) as HtmlSectionDiffResult;
}

// Helper to create a file with content
function createFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

// Setup: Create test repo structure
async function setupTestRepo(): Promise<void> {
  // Clean up any existing test repo
  if (fs.existsSync(TEST_REPO_DIR)) {
    fs.rmSync(TEST_REPO_DIR, { recursive: true, force: true });
  }
  
  // Create directory structure:
  // test_repo/
  //   subdir_a/
  //     committed_file.txt     (committed, then modified)
  //     new_file.txt           (untracked/new)
  //   subdir_b/
  //     committed_unchanged.txt (committed, unchanged)
  //     another_new.txt        (untracked/new)
  //   root_committed.txt       (committed, unchanged)
  //   root_modified.txt        (committed, then modified)
  //   root_new.txt             (untracked/new)
  
  fs.mkdirSync(TEST_REPO_DIR, { recursive: true });
  
  // Create initial files
  createFile(path.join(TEST_REPO_DIR, 'subdir_a', 'committed_file.txt'), 'initial content a');
  createFile(path.join(TEST_REPO_DIR, 'subdir_b', 'committed_unchanged.txt'), 'unchanged content b');
  createFile(path.join(TEST_REPO_DIR, 'root_committed.txt'), 'root committed content');
  createFile(path.join(TEST_REPO_DIR, 'root_modified.txt'), 'original root modified content');
  
  // Initialize git repo
  await git.init({ fs, dir: TEST_REPO_DIR });
  
  // Stage and commit initial files
  await git.add({ fs, dir: TEST_REPO_DIR, filepath: 'subdir_a/committed_file.txt' });
  await git.add({ fs, dir: TEST_REPO_DIR, filepath: 'subdir_b/committed_unchanged.txt' });
  await git.add({ fs, dir: TEST_REPO_DIR, filepath: 'root_committed.txt' });
  await git.add({ fs, dir: TEST_REPO_DIR, filepath: 'root_modified.txt' });
  
  await git.commit({
    fs,
    dir: TEST_REPO_DIR,
    message: 'Initial commit',
    author: { name: 'Test', email: 'test@test.com' }
  });
  
  // Now modify some files (after commit)
  createFile(path.join(TEST_REPO_DIR, 'subdir_a', 'committed_file.txt'), 'MODIFIED content a');
  createFile(path.join(TEST_REPO_DIR, 'root_modified.txt'), 'MODIFIED root content');
  
  // Create new untracked files
  createFile(path.join(TEST_REPO_DIR, 'subdir_a', 'new_file.txt'), 'new file in subdir_a');
  createFile(path.join(TEST_REPO_DIR, 'subdir_b', 'another_new.txt'), 'new file in subdir_b');
  createFile(path.join(TEST_REPO_DIR, 'root_new.txt'), 'new file at root');
}

// Cleanup
function cleanupTestRepo(): void {
  if (fs.existsSync(TEST_REPO_DIR)) {
    fs.rmSync(TEST_REPO_DIR, { recursive: true, force: true });
  }
}

// Run setup before tests
await setupTestRepo();

test('fast_git_ops binary exists', (t) => {
  t.ok(fs.existsSync(FAST_GIT_OPS_BINARY), `Binary exists at ${FAST_GIT_OPS_BINARY}`);
  t.end();
});

test('fast_git_ops status: all files in repo root', (t) => {
  const results = runGitStatus(TEST_REPO_DIR);
  
  // Should find:
  // - subdir_a/committed_file.txt: modified
  // - subdir_a/new_file.txt: new
  // - subdir_b/another_new.txt: new
  // - root_modified.txt: modified
  // - root_new.txt: new
  
  // Should NOT include unchanged committed files
  
  t.ok(results.length >= 5, `Found at least 5 changed files, got ${results.length}`);
  
  const statusMap = new Map(results.map(r => [r.path, r.status]));
  
  // Check modified files
  const modifiedA = path.join(TEST_REPO_DIR, 'subdir_a', 'committed_file.txt');
  t.equal(statusMap.get(modifiedA), 'modified', 'subdir_a/committed_file.txt is modified');
  
  const modifiedRoot = path.join(TEST_REPO_DIR, 'root_modified.txt');
  t.equal(statusMap.get(modifiedRoot), 'modified', 'root_modified.txt is modified');
  
  // Check new/untracked files
  const newA = path.join(TEST_REPO_DIR, 'subdir_a', 'new_file.txt');
  t.equal(statusMap.get(newA), 'new', 'subdir_a/new_file.txt is new');
  
  const newB = path.join(TEST_REPO_DIR, 'subdir_b', 'another_new.txt');
  t.equal(statusMap.get(newB), 'new', 'subdir_b/another_new.txt is new');
  
  const newRoot = path.join(TEST_REPO_DIR, 'root_new.txt');
  t.equal(statusMap.get(newRoot), 'new', 'root_new.txt is new');
  
  // Verify unchanged files are NOT in the results
  const unchangedB = path.join(TEST_REPO_DIR, 'subdir_b', 'committed_unchanged.txt');
  t.notOk(statusMap.has(unchangedB), 'committed_unchanged.txt should not be in results (unchanged)');
  
  const unchangedRoot = path.join(TEST_REPO_DIR, 'root_committed.txt');
  t.notOk(statusMap.has(unchangedRoot), 'root_committed.txt should not be in results (unchanged)');
  
  t.end();
});

test('fast_git_ops status: scoped to subdir_a only', (t) => {
  const subdirA = path.join(TEST_REPO_DIR, 'subdir_a');
  const results = runGitStatus(subdirA);
  
  // Should only find files in subdir_a:
  // - committed_file.txt: modified
  // - new_file.txt: new
  
  t.equal(results.length, 2, `Found exactly 2 files in subdir_a, got ${results.length}`);
  
  const statusMap = new Map(results.map(r => [r.path, r.status]));
  
  const modifiedA = path.join(subdirA, 'committed_file.txt');
  t.equal(statusMap.get(modifiedA), 'modified', 'committed_file.txt is modified');
  
  const newA = path.join(subdirA, 'new_file.txt');
  t.equal(statusMap.get(newA), 'new', 'new_file.txt is new');
  
  // Verify no files from other directories
  for (const result of results) {
    t.ok(result.path.startsWith(subdirA), `File ${result.path} is within subdir_a`);
  }
  
  t.end();
});

test('fast_git_ops status: scoped to subdir_b only', (t) => {
  const subdirB = path.join(TEST_REPO_DIR, 'subdir_b');
  const results = runGitStatus(subdirB);
  
  // Should only find new file in subdir_b:
  // - another_new.txt: new
  // (committed_unchanged.txt should NOT appear since it's unchanged)
  
  t.equal(results.length, 1, `Found exactly 1 file in subdir_b, got ${results.length}`);
  
  const statusMap = new Map(results.map(r => [r.path, r.status]));
  
  const newB = path.join(subdirB, 'another_new.txt');
  t.equal(statusMap.get(newB), 'new', 'another_new.txt is new');
  
  // Verify unchanged file is not included
  const unchangedB = path.join(subdirB, 'committed_unchanged.txt');
  t.notOk(statusMap.has(unchangedB), 'committed_unchanged.txt should not be in results');
  
  t.end();
});

test('fast_git_ops html-section-diff: preserves caller path prefix and reports changed sections', async (t) => {
  const repoRoot = path.join(import.meta.dirname, 'html_diff_repo_real');
  const aliasRoot = path.join(import.meta.dirname, 'html_diff_repo_alias');

  try {
    if (fs.existsSync(aliasRoot)) {
      fs.rmSync(aliasRoot, { recursive: true, force: true });
    }
    if (fs.existsSync(repoRoot)) {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }

    fs.mkdirSync(repoRoot, { recursive: true });
    await git.init({ fs, dir: repoRoot });

    const pagePath = path.join(repoRoot, 'pages', 'index.html');
    createFile(
      pagePath,
      '<html><head><title>Test</title></head><body><main>Body</main><footer>Old footer</footer></body></html>'
    );

    await git.add({ fs, dir: repoRoot, filepath: 'pages/index.html' });
    await git.commit({
      fs,
      dir: repoRoot,
      message: 'Initial HTML baseline',
      author: { name: 'Test', email: 'test@test.com' },
    });

    createFile(
      pagePath,
      '<html><head><title>Test</title></head><body><main>Body</main><footer>Updated footer copy</footer></body></html>'
    );

    fs.symlinkSync(repoRoot, aliasRoot, 'dir');

    const result = runHtmlSectionDiff(aliasRoot);
    t.equal(result.files.length, 1, `Expected 1 changed HTML file, got ${result.files.length}`);

    const [file] = result.files;
    t.equal(file.path, path.join(aliasRoot, 'pages', 'index.html'), 'Preserves the caller path prefix');
    t.equal(file.status, 'M', 'Modified HTML file is reported as modified');
    t.deepEqual(
      file.sections,
      { head: false, header: false, main: false, footer: true },
      'Reports only the changed footer section'
    );
  } finally {
    fs.rmSync(aliasRoot, { recursive: true, force: true });
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }

  t.end();
});

test('fast_git_ops status: deleted file detection', async (t) => {
  // Delete a committed file
  const fileToDelete = path.join(TEST_REPO_DIR, 'root_committed.txt');
  fs.unlinkSync(fileToDelete);
  
  const results = runGitStatus(TEST_REPO_DIR);
  const statusMap = new Map(results.map(r => [r.path, r.status]));
  
  t.equal(statusMap.get(fileToDelete), 'deleted', 'root_committed.txt is detected as deleted');
  
  // Restore the file for other tests
  createFile(fileToDelete, 'root committed content');
  
  t.end();
});

test('fast_git_ops dir-log: includes initial commit for a subdirectory', async (t) => {
  const subdirA = path.join(TEST_REPO_DIR, "subdir_a");
  const result = runDirLog(subdirA, 10);
  t.ok(result.commits.length >= 1, "Has at least one commit");
  t.equal(result.commits[0]?.subject, "Initial commit", "Top commit subject matches");
  t.ok(result.commits[0]?.files_changed_count >= 1, "Includes file change count");
  t.end();
});

test('fast_git_ops commit-files: initial commit lists added files', async (t) => {
  const headSha = await git.resolveRef({ fs, dir: TEST_REPO_DIR, ref: "HEAD" });
  const result = runCommitFiles(TEST_REPO_DIR, headSha);
  t.equal(result.sha, headSha, "SHA echoes back");
  // Initial commit should show at least the 4 staged files as added
  const added = result.files.filter((f) => f.status === "A");
  t.ok(added.length >= 4, `Has at least 4 added files, got ${added.length}`);
  t.end();
});

test('fast_git_ops cat-file: can read file content at HEAD', async (t) => {
  const headSha = await git.resolveRef({ fs, dir: TEST_REPO_DIR, ref: "HEAD" });
  const cat = runCatFile(TEST_REPO_DIR, headSha, "root_committed.txt");
  t.ok(cat.found, "File found");
  t.ok(cat.data_base64, "Has base64 data");
  const content = Buffer.from(cat.data_base64 || "", "base64").toString("utf-8");
  t.equal(content, "root committed content", "Content matches");
  t.end();
});

test('fast_git_ops file-log: returns at least one commit for a tracked file', async (t) => {
  const result = runFileLog(TEST_REPO_DIR, "root_modified.txt", 10);
  t.ok(result.commits.length >= 1, "Has at least one commit");
  t.equal(result.commits[result.commits.length - 1]?.subject, "Initial commit", "Includes initial commit");
  t.end();
});

// ============================================
// COMMIT_CHANGES TESTS
// ============================================

interface CommitResult {
  success: boolean;
  sha: string | null;
  files_committed: number;
  message: string | null;
}

// Helper to run fast_git_ops commit_changes command
function runCommitChanges(directories: string[], message: string, authorName?: string, authorEmail?: string): CommitResult {
  const args = ['commit-changes', ...directories, '-m', message];
  if (authorName) {
    args.push('-n', authorName);
  }
  if (authorEmail) {
    args.push('-e', authorEmail);
  }
  const result = execSync(`"${FAST_GIT_OPS_BINARY}" ${args.map(a => `"${a}"`).join(' ')}`, { 
    encoding: 'utf8',
    cwd: TEST_REPO_DIR 
  });
  return JSON.parse(result) as CommitResult;
}

// Helpers to read HEAD info without relying on system `git` CLI
async function getHeadSha(): Promise<string> {
  return await git.resolveRef({ fs, dir: TEST_REPO_DIR, ref: "HEAD" });
}

async function getHeadMessage(): Promise<string> {
  const oid = await git.resolveRef({ fs, dir: TEST_REPO_DIR, ref: "HEAD" });
  const { commit } = await git.readCommit({ fs, dir: TEST_REPO_DIR, oid });
  return (commit.message || "").split("\n")[0] || "";
}

async function getHeadAuthor(): Promise<string> {
  const oid = await git.resolveRef({ fs, dir: TEST_REPO_DIR, ref: "HEAD" });
  const { commit } = await git.readCommit({ fs, dir: TEST_REPO_DIR, oid });
  return commit.author?.name || "";
}

test('fast_git_ops commit_changes: commits new and modified files', async (t) => {
  // Reset the test repo to a clean state
  await setupTestRepo();
  
  const initialHead = await getHeadSha();
  
  // Commit changes in subdir_a
  const result = runCommitChanges(
    [path.join(TEST_REPO_DIR, 'subdir_a')],
    'Test commit for subdir_a',
    'Test Author',
    'test@example.com'
  );
  
  t.ok(result.success, 'Commit should succeed');
  t.ok(result.sha, 'Should return a commit SHA');
  t.equal(result.files_committed, 2, 'Should commit 2 files (1 modified + 1 new)');
  
  // Verify HEAD changed
  const newHead = await getHeadSha();
  t.notEqual(newHead, initialHead, 'HEAD should have changed');
  t.equal(newHead, result.sha, 'Returned SHA should match HEAD');
  
  // Verify commit message
  const commitMsg = await getHeadMessage();
  t.equal(commitMsg, 'Test commit for subdir_a', 'Commit message should match');
  
  // Verify author
  const author = await getHeadAuthor();
  t.equal(author, 'Test Author', 'Author name should match');
  
  t.end();
});

test('fast_git_ops commit_changes: no changes returns null sha', async (t) => {
  // Reset and commit everything first
  await setupTestRepo();
  
  // Commit all changes first
  runCommitChanges(
    [TEST_REPO_DIR],
    'Initial commit of all changes'
  );
  
  const headBefore = await getHeadSha();
  
  // Try to commit again - should have no changes
  const result = runCommitChanges(
    [TEST_REPO_DIR],
    'Should have no changes'
  );
  
  t.ok(result.success, 'Should succeed even with no changes');
  t.equal(result.sha, null, 'SHA should be null when no changes');
  t.equal(result.files_committed, 0, 'Should commit 0 files');
  t.ok(result.message?.includes('No changes'), 'Message should indicate no changes');
  
  // HEAD should not have changed
  const headAfter = await getHeadSha();
  t.equal(headAfter, headBefore, 'HEAD should not have changed');
  
  t.end();
});

test('fast_git_ops commit_changes: commits multiple directories', async (t) => {
  await setupTestRepo();
  
  // Commit changes in both subdir_a and subdir_b
  const result = runCommitChanges(
    [
      path.join(TEST_REPO_DIR, 'subdir_a'),
      path.join(TEST_REPO_DIR, 'subdir_b')
    ],
    'Commit both subdirectories'
  );
  
  t.ok(result.success, 'Commit should succeed');
  t.ok(result.sha, 'Should return a commit SHA');
  // subdir_a: 1 modified + 1 new = 2
  // subdir_b: 1 new = 1
  t.equal(result.files_committed, 3, 'Should commit 3 files from both directories');
  
  t.end();
});

test('fast_git_ops commit_changes: handles non-existent directory gracefully', async (t) => {
  await setupTestRepo();
  
  // Try with a mix of existing and non-existing directories
  const result = runCommitChanges(
    [
      path.join(TEST_REPO_DIR, 'subdir_a'),
      path.join(TEST_REPO_DIR, 'nonexistent_dir')
    ],
    'Commit with nonexistent dir'
  );
  
  t.ok(result.success, 'Should succeed ignoring non-existent directory');
  t.ok(result.sha, 'Should return a commit SHA');
  t.equal(result.files_committed, 2, 'Should commit files from existing directory only');
  
  t.end();
});

test('fast_git_ops commit_changes: default author is Meadow', async (t) => {
  await setupTestRepo();
  
  // Commit without specifying author
  runCommitChanges(
    [path.join(TEST_REPO_DIR, 'subdir_a')],
    'Test default author'
  );
  
  const author = await getHeadAuthor();
  t.equal(author, 'Meadow', 'Default author should be Meadow');
  
  t.end();
});

// ============================================
// CASE-INSENSITIVE RENAME (GHOST ENTRY) TESTS
// ============================================

// Helper: detect case-insensitive filesystem
function isCaseInsensitiveFS(dir: string): boolean {
  const probe = path.join(dir, '__CaSe_PrObE__');
  fs.writeFileSync(probe, '');
  const exists = fs.existsSync(path.join(dir, '__case_probe__'));
  fs.unlinkSync(probe);
  return exists;
}

test('fast_git_ops commit_changes: fresh case-rename commits and leaves no ghost', async (t) => {
  await setupTestRepo();

  if (!isCaseInsensitiveFS(TEST_REPO_DIR)) {
    t.comment('Filesystem is case-sensitive — skipping case-insensitive rename test');
    t.end();
    return;
  }

  // 1. Create a file with uppercase and commit it
  const caseDir = path.join(TEST_REPO_DIR, 'case_test');
  fs.mkdirSync(caseDir, { recursive: true });
  createFile(path.join(caseDir, 'Hello World.html'), '<h1>original</h1>');

  const r1 = runCommitChanges([caseDir], 'Add uppercase file', 'Test', 'test@test.com');
  t.ok(r1.success && r1.sha, 'Initial commit of uppercase file succeeds');

  // 2. Rename to lowercase on the filesystem (case-insensitive FS keeps new casing)
  fs.renameSync(path.join(caseDir, 'Hello World.html'), path.join(caseDir, 'hello world.html'));

  // 3. Modify content so there's a definite change
  createFile(path.join(caseDir, 'hello world.html'), '<h1>updated</h1>');

  // 4. Commit — should pick up the renamed (lowercase) file
  const r2 = runCommitChanges([caseDir], 'Rename to lowercase', 'Test', 'test@test.com');
  t.ok(r2.success, 'Commit after rename should succeed');
  t.ok(r2.sha, 'Should return a commit SHA');
  t.ok(r2.files_committed >= 1, `Should commit at least 1 file, got ${r2.files_committed}`);

  // 5. Run again — should have NO changes (ghost entry cleaned on previous commit)
  const r3 = runCommitChanges([caseDir], 'Should be clean', 'Test', 'test@test.com');
  t.ok(r3.success, 'Third run should succeed');
  t.equal(r3.sha, null, 'No changes after ghost cleanup');
  t.equal(r3.files_committed, 0, 'Zero files committed');

  // 6. Status should also show no changes in the directory
  const status = runGitStatus(caseDir);
  t.equal(status.length, 0, `Status should be clean, got ${status.length} file(s): ${status.map(s => s.path).join(', ')}`);

  t.end();
});

test('fast_git_ops commit_changes: pre-existing ghost entry is cleaned even with no content changes', async (t) => {
  await setupTestRepo();

  if (!isCaseInsensitiveFS(TEST_REPO_DIR)) {
    t.comment('Filesystem is case-sensitive — skipping pre-existing ghost test');
    t.end();
    return;
  }

  // Simulate the state the user has: both "Hello World.html" (ghost, old hash)
  // and "hello world.html" (correct, current hash) in the index, with no
  // pending content changes for the lowercase entry.
  //
  // We use git plumbing to inject the ghost entry directly into the index.

  const caseDir = path.join(TEST_REPO_DIR, 'ghost_test');
  fs.mkdirSync(caseDir, { recursive: true });

  // 1. Create the file with lowercase name and commit via fast_git_ops
  createFile(path.join(caseDir, 'hello world.html'), '<h1>current</h1>');
  const r1 = runCommitChanges([caseDir], 'Add lowercase file', 'Test', 'test@test.com');
  t.ok(r1.success && r1.sha, 'Initial commit of lowercase file succeeds');

  // 2. Inject a ghost entry: create a blob with OLD content, then add it
  //    to the index under the uppercase path using git plumbing.
  const ghostHash = execSync('echo -n "<h1>old</h1>" | git hash-object -w --stdin', {
    cwd: TEST_REPO_DIR, encoding: 'utf8'
  }).trim();
  execSync(`git update-index --add --cacheinfo 100644,${ghostHash},"ghost_test/Hello World.html"`, {
    cwd: TEST_REPO_DIR
  });

  // Verify the ghost is in the index (two entries with different case)
  const lsFiles = execSync('git ls-files "ghost_test/"', {
    cwd: TEST_REPO_DIR, encoding: 'utf8'
  }).trim();
  t.ok(
    lsFiles.includes('Hello World.html') && lsFiles.includes('hello world.html'),
    `Index has both case variants: ${lsFiles.replace(/\n/g, ', ')}`
  );

  // 3. Status should report the ghost as modified (hash mismatch)
  const statusBefore = runGitStatus(caseDir);
  t.ok(statusBefore.length > 0, `Status sees ghost as changed (got ${statusBefore.length})`);

  // 4. Run commit-changes — should detect and clean the ghost, even though
  //    the REAL file (lowercase) has no content changes.
  const result = runCommitChanges([caseDir], 'Clean ghost entry', 'Test', 'test@test.com');
  t.ok(result.success, 'Commit should succeed');
  t.ok(result.sha, 'Should produce a commit (ghost removal is a tree change)');

  // 5. Status should now be clean
  const statusAfter = runGitStatus(caseDir);
  t.equal(statusAfter.length, 0, `Status clean after ghost removal, got ${statusAfter.length} file(s): ${statusAfter.map(s => s.path).join(', ')}`);

  // 6. Running commit-changes again should have nothing to do
  const result2 = runCommitChanges([caseDir], 'Truly no changes', 'Test', 'test@test.com');
  t.equal(result2.sha, null, 'No changes on subsequent run');
  t.equal(result2.files_committed, 0, 'Zero files committed');

  t.end();
});

test('fast_git_ops commit_changes: commits deletions when all files in directory are removed', async (t) => {
  // This test reproduces a real bug: when publishing to S3, the app
  // commits S3 state as a git baseline, then replaces with preview files.
  // If the user deletes all remote S3 files and re-syncs, the s3_cache
  // directory is empty — but the git index still has the old baseline files.
  // commit-changes must detect these deletions and commit them, so the
  // baseline becomes empty and ALL preview files show as needing upload.
  // Previously, commit-changes returned early with "No files found" when
  // the directory was empty, silently skipping the deletion check.
  await setupTestRepo();

  const targetDir = path.join(TEST_REPO_DIR, 'publish_test');
  fs.mkdirSync(targetDir, { recursive: true });

  // Simulate initial S3 state: commit several files as the baseline
  createFile(path.join(targetDir, 'index.html'), '<html>index</html>');
  createFile(path.join(targetDir, 'style.css'), 'body { color: red }');
  createFile(path.join(targetDir, 'about.html'), '<html>about</html>');

  const r1 = runCommitChanges([targetDir], 'S3 baseline snapshot', 'Meadow', 'meadow@local');
  t.ok(r1.success && r1.sha, 'Baseline commit succeeds');
  t.equal(r1.files_committed, 3, 'Baseline has 3 files');

  // Simulate "delete all remote files": clear the directory contents
  for (const entry of fs.readdirSync(targetDir)) {
    fs.unlinkSync(path.join(targetDir, entry));
  }

  // The directory still exists but is empty — exactly like clearDirectory() leaves it
  t.ok(fs.existsSync(targetDir), 'Directory still exists');
  t.equal(fs.readdirSync(targetDir).length, 0, 'Directory is empty');

  // commit-changes MUST detect the 3 deleted files and commit them
  const r2 = runCommitChanges([targetDir], 'S3 state cleared after delete', 'Meadow', 'meadow@local');
  t.ok(r2.success, 'Commit of deletions should succeed');
  t.ok(r2.sha, 'Should return a commit SHA (deletions are real changes)');
  t.equal(r2.files_committed, 3, 'Should record 3 file deletions');

  // After this commit, status should be clean
  const status = runGitStatus(targetDir);
  t.equal(status.length, 0, 'Status should be clean after committing deletions');

  t.end();
});

test('fast_git_ops commit_changes: mixed new, modified, and deleted files in one commit', async (t) => {
  // This test reproduces a real bug where committing a directory that contains
  // a mix of new files (not yet in the index), modified files (in the index
  // with different content), and deleted files (in the index but removed from
  // disk) would silently drop the modifications and deletions.
  //
  // Root cause: new files were added to the index via dangerously_push_entry,
  // which breaks sort order. Subsequent lookups for existing entries (to update
  // modified files or mark deleted files) used binary search, which failed on
  // the unsorted index.
  //
  // This mirrors the real-world flow where:
  //   1. copy-tracked-pages commits flat files to tracked_page_content/
  //   2. ensureTrackedPageContent clears and rebuilds with subdirectories,
  //      modifying some content (tag rewriting) and removing pages no longer tracked
  //   3. commitSiteChanges must commit all three kinds of changes in one shot
  //
  // IMPORTANT: This test uses an isolated repo so the ONLY index entries are
  // in the target directory. With extra entries from other directories (like
  // setupTestRepo's root_* and subdir_* files), the binary search midpoints
  // shift enough that the bug is masked — lookups happen to land in the still-
  // sorted prefix. In a clean repo the unsorted tail directly disrupts the
  // search and triggers the failure.

  const isoRepoDir = path.join(import.meta.dirname, 'mixed_changes_repo');
  if (fs.existsSync(isoRepoDir)) {
    fs.rmSync(isoRepoDir, { recursive: true, force: true });
  }
  fs.mkdirSync(isoRepoDir, { recursive: true });
  await git.init({ fs, dir: isoRepoDir });

  const targetDir = path.join(isoRepoDir, 'pages');
  fs.mkdirSync(targetDir, { recursive: true });

  function commitIso(dirs: string[], msg: string): CommitResult {
    const args = ['commit-changes', ...dirs, '-m', msg, '-n', 'Test', '-e', 'test@test.com'];
    const result = execSync(`"${FAST_GIT_OPS_BINARY}" ${args.map(a => `"${a}"`).join(' ')}`, {
      encoding: 'utf8', cwd: isoRepoDir,
    });
    return JSON.parse(result) as CommitResult;
  }

  // Step 1: Create initial files and commit (simulates copy-tracked-pages)
  //
  // File naming is critical to this test: the bug only manifests when a NEW
  // file sorts alphabetically BEFORE a MODIFIED file in the directory walk.
  // dangerously_push_entry (for the new file) breaks the index sort order,
  // causing the subsequent binary-search lookup (for the modified file) to
  // fail silently. We use "zzz-" prefixed names for modified/deleted files
  // so that new files (starting with "aaa-") are walked first.
  createFile(path.join(targetDir, 'zzz-modify-me.md'), 'original content');
  createFile(path.join(targetDir, 'zzz-modify-me.png'), 'original binary');
  createFile(path.join(targetDir, 'zzz-delete-1.md'), 'page to delete');
  createFile(path.join(targetDir, 'zzz-delete-2.md'), 'another page to delete');
  createFile(path.join(targetDir, 'zzz-delete-3.md'), 'third page to delete');
  createFile(path.join(targetDir, 'zzz-unchanged.md'), 'unchanged content');

  const r1 = commitIso([targetDir], 'Initial flat files');
  t.ok(r1.success && r1.sha, 'Initial commit succeeds');
  t.equal(r1.files_committed, 6, 'Committed 6 initial files');

  // Step 2: Simulate ensureTrackedPageContent — clear and rebuild with changes
  // Delete the entire directory and recreate it (just like the real code does)
  fs.rmSync(targetDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });

  // Add NEW files that sort BEFORE the modified files alphabetically.
  // This is the key: "aaa-" < "zzz-", so the walker encounters these first,
  // pushing new entries and breaking the index sort order before the modified
  // files are processed.
  createFile(path.join(targetDir, 'aaa-brand-new-1.md'), 'new page 1');
  createFile(path.join(targetDir, 'aaa-brand-new-2.md'), 'new page 2');
  createFile(path.join(targetDir, 'aaa-brand-new-3.md'), 'new page 3');
  // Recreate some files with modifications (tag rewriting changed content)
  createFile(path.join(targetDir, 'zzz-modify-me.md'), 'MODIFIED content with tag rewriting');
  createFile(path.join(targetDir, 'zzz-modify-me.png'), 'MODIFIED binary content');
  // zzz-unchanged.md is NOT recreated — it's now deleted
  // zzz-delete-*.md are NOT recreated — they're now deleted

  // Step 3: Commit — must handle all three kinds of changes:
  //   - 2 modified files (zzz-modify-me.md, zzz-modify-me.png)
  //   - 4 deleted files (zzz-delete-{1,2,3}.md, zzz-unchanged.md)
  //   - 3 new files (aaa-brand-new-{1,2,3}.md)
  const r2 = commitIso([targetDir], 'Mixed changes commit');
  t.ok(r2.success, 'Mixed changes commit should succeed');
  t.ok(r2.sha, 'Should return a commit SHA');
  t.equal(r2.files_committed, 9, 'Should commit 9 files (2 modified + 4 deleted + 3 new)');

  // Step 4: Status must be completely clean — no leftover uncommitted files
  const status = runGitStatus(targetDir);
  t.equal(
    status.length, 0,
    `Status should be clean after mixed commit, got ${status.length} file(s): ${status.map(s => `${s.status} ${s.path}`).join(', ')}`
  );

  // Step 5: A subsequent commit should have nothing to do
  const r3 = commitIso([targetDir], 'Should be clean');
  t.equal(r3.sha, null, 'No changes on subsequent run');
  t.equal(r3.files_committed, 0, 'Zero files committed');

  // Cleanup
  fs.rmSync(isoRepoDir, { recursive: true, force: true });
  t.end();
});

// Cleanup after all tests
test.onFinish(() => {
  cleanupTestRepo();
});
