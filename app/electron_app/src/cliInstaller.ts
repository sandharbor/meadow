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

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CliInstallResult {
  status: 'installed' | 'already-installed' | 'conflict' | 'unavailable';
  commandPath: string | null;
  message: string;
}

interface InstallDestination {
  directory: string;
  requiresAdministrator: boolean;
}

export interface CliInstallerOptions {
  platform?: NodeJS.Platform;
  environmentPath?: string;
  homeDirectory?: string;
  systemInstallDirectory?: string;
  loginShellPathResolver?: () => Promise<string | null>;
  directoryIsWritable?: (directory: string) => boolean;
  privilegedLinkInstaller?: (sourcePath: string, commandPath: string) => Promise<void>;
}

const SHELL_PATH_START_MARKER = '__MEADOW_SHELL_PATH_START__';
const SHELL_PATH_END_MARKER = '__MEADOW_SHELL_PATH_END__';
const SHELL_ENVIRONMENT_TIMEOUT_MS = 10_000;

function isManagedMeadowLinkTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/');
  return normalized.endsWith('/Contents/Resources/cli/meadow')
    || normalized.endsWith('/app/cli/bin/meadow');
}

function defaultShell(): string {
  try {
    const configuredShell = os.userInfo().shell;
    if (configuredShell) return configuredShell;
  } catch {
    // Fall through to environment and platform defaults.
  }
  return process.env.SHELL || '/bin/sh';
}

export function resolveLoginShellPath(): Promise<string | null> {
  const command = `printf '\\n${SHELL_PATH_START_MARKER}%s${SHELL_PATH_END_MARKER}\\n' "$PATH"`;
  return new Promise((resolve) => {
    execFile(
      defaultShell(),
      ['-i', '-l', '-c', command],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: SHELL_ENVIRONMENT_TIMEOUT_MS,
      },
      (_error, stdout) => {
        const output = stdout;
        const start = output.lastIndexOf(SHELL_PATH_START_MARKER);
        if (start < 0) {
          resolve(null);
          return;
        }
        const valueStart = start + SHELL_PATH_START_MARKER.length;
        const end = output.indexOf(SHELL_PATH_END_MARKER, valueStart);
        if (end < 0) {
          resolve(null);
          return;
        }
        const shellPath = output.slice(valueStart, end);
        resolve(shellPath || null);
      },
    );
  });
}

function normalizedPathEntries(environmentPath: string, homeDirectory: string): Set<string> {
  return new Set(
    environmentPath
      .split(path.delimiter)
      .filter(Boolean)
      .map((entry) => path.resolve(entry.replace(/^~(?=\/)/, homeDirectory))),
  );
}

function defaultDirectoryIsWritable(directory: string): boolean {
  try {
    fs.accessSync(directory, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveInstallDestination(
  environmentPath: string,
  homeDirectory: string,
  platform: NodeJS.Platform,
  systemInstallDirectory: string,
  directoryIsWritable: (directory: string) => boolean,
): InstallDestination | null {
  const pathEntries = normalizedPathEntries(environmentPath, homeDirectory);
  const userDirectories = [
    path.join(homeDirectory, '.local', 'bin'),
    path.join(homeDirectory, 'bin'),
  ];

  // Prefer standard per-user locations regardless of their PATH ordering. If
  // the user has already configured one, creating the final directory is a
  // safe, password-free install and does not modify shell startup files.
  for (const directory of userDirectories) {
    if (!pathEntries.has(directory)) continue;
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
    } catch {
      continue;
    }
    if (directoryIsWritable(directory)) {
      return { directory, requiresAdministrator: false };
    }
  }

  const resolvedSystemDirectory = path.resolve(systemInstallDirectory);
  if (!pathEntries.has(resolvedSystemDirectory)) return null;
  if (fs.existsSync(resolvedSystemDirectory) && directoryIsWritable(resolvedSystemDirectory)) {
    return { directory: resolvedSystemDirectory, requiresAdministrator: false };
  }
  if (platform === 'darwin') {
    return { directory: resolvedSystemDirectory, requiresAdministrator: true };
  }
  return null;
}

function runAppleScript(script: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script, ...args], { encoding: 'utf8' }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function installLinkWithAdministratorPrivileges(
  sourcePath: string,
  commandPath: string,
): Promise<void> {
  const installDirectory = path.dirname(commandPath);
  const script = `
on run argv
  set sourcePath to item 1 of argv
  set commandPath to item 2 of argv
  set installDirectory to item 3 of argv
  set commandText to "/bin/mkdir -p " & quoted form of installDirectory
  set commandText to commandText & " && if [ -L " & quoted form of commandPath & " ]; then /bin/rm " & quoted form of commandPath & "; fi"
  set commandText to commandText & " && /bin/ln -s " & quoted form of sourcePath & " " & quoted form of commandPath
  do shell script commandText with administrator privileges
end run`;
  await runAppleScript(script, [sourcePath, commandPath, installDirectory]);
}

function existingCommandResult(
  commandPath: string,
  sourcePath: string,
): CliInstallResult | 'replace-managed-link' | null {
  const stat = fs.lstatSync(commandPath, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isSymbolicLink()) {
    return {
      status: 'conflict',
      commandPath,
      message: `A different file already exists at ${commandPath}. Meadow left it unchanged.`,
    };
  }

  const currentTarget = fs.readlinkSync(commandPath);
  const resolvedTarget = path.resolve(path.dirname(commandPath), currentTarget);
  if (resolvedTarget === path.resolve(sourcePath)) {
    return {
      status: 'already-installed',
      commandPath,
      message: `The meadow command is already installed at ${commandPath}.`,
    };
  }
  if (!isManagedMeadowLinkTarget(resolvedTarget)) {
    return {
      status: 'conflict',
      commandPath,
      message: `A different command already exists at ${commandPath}. Meadow left it unchanged.`,
    };
  }
  return 'replace-managed-link';
}

function installationCancelled(error: unknown): boolean {
  return error instanceof Error && /user canceled|\(-128\)/i.test(error.message);
}

export async function installCommandLineInterface(
  sourcePath: string,
  options: CliInstallerOptions = {},
): Promise<CliInstallResult> {
  if (!fs.existsSync(sourcePath)) {
    return {
      status: 'unavailable',
      commandPath: null,
      message: 'The Meadow command-line files are not available in this application build.',
    };
  }

  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? os.homedir();
  let environmentPath = options.environmentPath ?? process.env.PATH ?? '';
  if (platform === 'darwin') {
    const loginShellPathResolver = options.loginShellPathResolver ?? resolveLoginShellPath;
    try {
      environmentPath = await loginShellPathResolver() ?? environmentPath;
    } catch {
      // A broken or slow shell startup file should not prevent the process PATH fallback.
    }
  }

  const destination = resolveInstallDestination(
    environmentPath,
    homeDirectory,
    platform,
    options.systemInstallDirectory ?? '/usr/local/bin',
    options.directoryIsWritable ?? defaultDirectoryIsWritable,
  );
  if (!destination) {
    return {
      status: 'unavailable',
      commandPath: null,
      message: `No supported command directory was found on your shell PATH. Add ${path.join(homeDirectory, '.local', 'bin')} or ${path.join(homeDirectory, 'bin')} to PATH and try again.`,
    };
  }

  const commandPath = path.join(destination.directory, 'meadow');
  const existingResult = existingCommandResult(commandPath, sourcePath);
  if (existingResult && existingResult !== 'replace-managed-link') return existingResult;

  if (destination.requiresAdministrator) {
    try {
      const privilegedLinkInstaller = options.privilegedLinkInstaller
        ?? installLinkWithAdministratorPrivileges;
      await privilegedLinkInstaller(sourcePath, commandPath);
    } catch (error) {
      return {
        status: 'unavailable',
        commandPath,
        message: installationCancelled(error)
          ? 'Command-line installation was cancelled.'
          : `Meadow could not install the command at ${commandPath}.`,
      };
    }
  } else {
    if (existingResult === 'replace-managed-link') fs.unlinkSync(commandPath);
    fs.symlinkSync(sourcePath, commandPath);
  }

  return {
    status: 'installed',
    commandPath,
    message: `Installed the meadow command at ${commandPath}.`,
  };
}
