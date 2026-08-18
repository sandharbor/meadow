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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CliInstallResult {
  status: 'installed' | 'already-installed' | 'conflict' | 'unavailable';
  commandPath: string | null;
  message: string;
}

function isManagedMeadowLinkTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/');
  return normalized.endsWith('/Contents/Resources/cli/meadow')
    || normalized.endsWith('/app/cli/bin/meadow');
}

function resolveInstallDirectory(): string | null {
  const home = os.homedir();
  const allowed = new Set([
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]);
  const pathEntries = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => path.resolve(entry.replace(/^~(?=\/)/, home)));

  for (const entry of pathEntries) {
    if (!allowed.has(entry) || !fs.existsSync(entry)) continue;
    try {
      fs.accessSync(entry, fs.constants.W_OK);
      return entry;
    } catch {
      // Keep looking for a user-writable directory already on PATH.
    }
  }
  return null;
}

export function installCommandLineInterface(sourcePath: string): CliInstallResult {
  if (!fs.existsSync(sourcePath)) {
    return {
      status: 'unavailable',
      commandPath: null,
      message: 'The Meadow command-line files are not available in this application build.',
    };
  }
  const installDirectory = resolveInstallDirectory();
  if (!installDirectory) {
    return {
      status: 'unavailable',
      commandPath: null,
      message: 'No user-writable command directory was found on PATH.',
    };
  }

  const commandPath = path.join(installDirectory, 'meadow');
  if (fs.existsSync(commandPath) || fs.lstatSync(commandPath, { throwIfNoEntry: false })) {
    const stat = fs.lstatSync(commandPath);
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
    fs.unlinkSync(commandPath);
  }

  fs.symlinkSync(sourcePath, commandPath);
  return {
    status: 'installed',
    commandPath,
    message: `Installed the meadow command at ${commandPath}.`,
  };
}
