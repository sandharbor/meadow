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
 * Centralized utility class for all git operations on the app config folder (~/.config/meadow).
 * This serves as a chokepoint for debugging and ensures consistent git behavior across the app.
 * Uses the fast_git_ops Rust binary (gitoxide) for all git operations.
 */

import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { getDefaultConfigDirectory, loadAppConfig } from "./appConfigUtils.js";
import { createLogger, Logger } from "../../backend/src/utils/logging/backendLoggingUtils.js";
import { commitChangesNative, runGitInitNative } from "../../backend/src/utils/configDirectory/gitUtils/gitStatusUtils.js";

/**
 * Author information for git commits
 */
export interface GitAuthor {
  name: string;
  email: string;
}

/**
 * Predefined authors for different parts of the application
 */
export const GIT_AUTHORS = {
  DEV_TOOLS_APP: {
    name: "dev_tools_app",
    email: "dev_tools_app@meadow.local",
  },
  MEADOW_APP: {
    name: "meadow_app",
    email: "meadow_app@meadow.local",
  },
} as const;

/**
 * Content for the .gitignore file in the config directory
 */
const GITIGNORE_CONTENT = `.DS_Store
logs/
app/secret_app_config.yaml
app/resources.local.yaml
app/publishing_providers/*/pp_secrets.yaml
app/publishing_providers/*/pp_resources.local.yaml
sites/*/config/publishing_providers/*/pp_secrets.yaml
`;

/**
 * Centralized utility class for git operations on the app config folder.
 *
 * Usage:
 * ```typescript
 * const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP);
 * await gitUtils.initRepo();
 * await gitUtils.commitFiles(["app/app_config.yaml"], "initial commit");
 * ```
 */
export class AppConfigGitUtils {
  private readonly author: GitAuthor;
  private readonly configDir: string;
  private readonly manageGitAutomaticallyOverride: boolean | undefined;
  private readonly logger: Logger;

  /**
   * Creates a new AppConfigGitUtils instance.
   * @param author - The author to use for git commits
   * @param configDir - Optional override for the config directory (defaults to ~/.config/meadow)
   * @param options - Optional settings (e.g. override manageGitAutomatically)
   */
  constructor(author: GitAuthor, configDir?: string, options?: { manageGitAutomatically?: boolean }) {
    this.author = author;
    this.configDir = configDir || getDefaultConfigDirectory();
    this.manageGitAutomaticallyOverride = options?.manageGitAutomatically;
    this.logger = createLogger();
  }

  private isManageGitAutomaticallyEnabled(): boolean {
    if (typeof this.manageGitAutomaticallyOverride === 'boolean') {
      return this.manageGitAutomaticallyOverride;
    }
    const cfg = loadAppConfig(this.configDir);
    return cfg.manageGitAutomatically !== false;
  }

  private logDisabled(wouldHave: string): void {
    this.logger.info(`[AppConfigGitUtils] manageGitAutomatically=false; skipping automatic git operation. Would have: ${wouldHave}`);
  }

  /**
   * Gets the config directory this instance operates on
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Gets the author this instance uses for commits
   */
  getAuthor(): GitAuthor {
    return this.author;
  }

  /**
   * Checks if the config directory has a git repository initialized
   */
  async isGitRepo(): Promise<boolean> {
    const gitDir = join(this.configDir, ".git");
    return existsSync(gitDir);
  }

  /**
   * Ensures the git repository is initialized before any git operation.
   * This is called automatically by other methods to guarantee the repo exists.
   */
  private async ensureRepoInitialized(): Promise<void> {
    if (!(await this.isGitRepo())) {
      this.logger.info(`[AppConfigGitUtils] Git repo not found, auto-initializing before operation...`);
      await this.initRepo();
    }
  }

  /**
   * Initializes a git repository in the config directory.
   * Also creates the .gitignore file with standard exclusions.
   *
   * @param defaultBranch - The default branch name (defaults to 'main')
   * @returns true if repo was initialized, false if it already existed
   */
  async initRepo(defaultBranch: string = "main"): Promise<boolean> {
    const wasAlreadyRepo = await this.isGitRepo();

    if (wasAlreadyRepo) {
      this.logger.info(`[AppConfigGitUtils] Git repository already exists in ${this.configDir}`);
      return false;
    }

    if (!this.isManageGitAutomaticallyEnabled()) {
      this.logDisabled(`initialized git repository in ${this.configDir} (defaultBranch=${defaultBranch})`);
      return false;
    }

    try {
      await runGitInitNative(this.configDir, defaultBranch);
      this.logger.info(`[AppConfigGitUtils] Initialized git repository in ${this.configDir}`);

      // Create .gitignore file
      this.createGitignore();

      return true;
    } catch (error) {
      this.logger.error("[AppConfigGitUtils] Error initializing git repository:", error);
      throw error;
    }
  }

  /**
   * Creates the .gitignore file with standard exclusions for the config directory.
   * Will overwrite existing .gitignore.
   */
  createGitignore(): void {
    const gitignorePath = join(this.configDir, ".gitignore");
    writeFileSync(gitignorePath, GITIGNORE_CONTENT, "utf8");
    this.logger.info(`[AppConfigGitUtils] Created .gitignore in ${this.configDir}`);
  }

  /**
   * Stages specific files and commits them using the fast_git_ops binary.
   * The commit message is automatically prefixed with the author name.
   * @param filepaths - Relative paths to files within the config directory
   * @param message - The commit message (will be prefixed with author name)
   * @returns The commit SHA if changes were committed, null if no changes
   */
  async commitFiles(filepaths: string[], message: string): Promise<string | null> {
    const prefixedMessage = `${this.author.name}: ${message}`;
    if (!this.isManageGitAutomaticallyEnabled()) {
      this.logDisabled(`created a commit in ${this.configDir} with message "${prefixedMessage}" (author=${this.author.name} <${this.author.email}>)`);
      return null;
    }
    await this.ensureRepoInitialized();
    try {
      // Resolve filepaths to absolute directories containing those files,
      // then use commitChangesNative which stages + commits
      const directories = [...new Set(filepaths.map(fp => {
        const absPath = join(this.configDir, fp);
        // commitChangesNative works on directories, so get the parent dir
        const dir = join(absPath, '..');
        return dir;
      }))];

      const sha = await commitChangesNative(
        directories,
        prefixedMessage,
        { configDir: this.configDir, manageGitAutomatically: true }
      );

      if (sha) {
        this.logger.info(`[AppConfigGitUtils] Created commit ${sha.slice(0, 7)}: ${prefixedMessage}`);
      } else {
        this.logger.info(`[AppConfigGitUtils] No changes to commit`);
      }
      return sha;
    } catch (error) {
      this.logger.error("[AppConfigGitUtils] Error creating commit:", error);
      throw error;
    }
  }

  /**
   * Commits all changes within the given directories using the fast_git_ops
   * binary. Use this when you need to commit a directory tree (e.g. a freshly-
   * copied source graph) rather than a known list of files.
   *
   * @param relDirs - Relative paths of directories within the config directory
   * @param message - The commit message (will be prefixed with author name)
   * @returns The commit SHA if changes were committed, null if no changes
   */
  async commitDirs(relDirs: string[], message: string): Promise<string | null> {
    const prefixedMessage = `${this.author.name}: ${message}`;
    if (!this.isManageGitAutomaticallyEnabled()) {
      this.logDisabled(`created a commit in ${this.configDir} with message "${prefixedMessage}" covering directories ${relDirs.join(", ")} (author=${this.author.name} <${this.author.email}>)`);
      return null;
    }
    await this.ensureRepoInitialized();
    try {
      const absDirs = relDirs.map(d => join(this.configDir, d));
      const sha = await commitChangesNative(
        absDirs,
        prefixedMessage,
        { configDir: this.configDir, manageGitAutomatically: true }
      );
      if (sha) {
        this.logger.info(`[AppConfigGitUtils] Created commit ${sha.slice(0, 7)}: ${prefixedMessage}`);
      } else {
        this.logger.info(`[AppConfigGitUtils] No changes to commit`);
      }
      return sha;
    } catch (error) {
      this.logger.error("[AppConfigGitUtils] Error creating commit:", error);
      throw error;
    }
  }

  /**
   * Stages a specific file and commits it.
   * Convenience wrapper around commitFiles for single-file operations.
   * @param filepath - Relative path to the file within the config directory
   * @param message - The commit message (will be prefixed with author name)
   * @returns The commit SHA if changes were committed, null if no changes
   */
  async addAndCommit(filepath: string, message: string): Promise<string | null> {
    return this.commitFiles([filepath], message);
  }

  /**
   * Convenience method to initialize a repo, stage all files, and commit.
   * Useful for initial setup of a new config directory.
   *
   * @param commitMessage - The commit message for the initial commit
   * @returns Object with initialization status and commit SHA (if committed)
   */
  async initAndCommitAll(
    commitMessage: string
  ): Promise<{ initialized: boolean; commitSha?: string }> {
    const initialized = await this.initRepo();

    const prefixedMessage = `${this.author.name}: ${commitMessage}`;
    if (!this.isManageGitAutomaticallyEnabled()) {
      this.logDisabled(`created a commit in ${this.configDir} with message "${prefixedMessage}"`);
      return { initialized, commitSha: undefined };
    }

    await this.ensureRepoInitialized();

    try {
      const sha = await commitChangesNative(
        [this.configDir],
        prefixedMessage,
        { configDir: this.configDir, manageGitAutomatically: true }
      );
      return { initialized, commitSha: sha ?? undefined };
    } catch (error) {
      this.logger.error("[AppConfigGitUtils] Error in initAndCommitAll:", error);
      throw error;
    }
  }
}
