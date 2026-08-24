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

import * as fs from 'fs';
import * as path from 'path';
import {
  installVerifiedUpdate,
  parseUpdateMetadata,
} from './verifiedUpdater';

interface HelperConfiguration {
  installedAppPath: string;
  artifactPath: string;
  transactionDirectory: string;
  metadata: unknown;
  healthToken: string;
  originalPid: number;
}

function isHelperConfiguration(value: unknown): value is HelperConfiguration {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.installedAppPath === 'string'
    && typeof candidate.artifactPath === 'string'
    && typeof candidate.transactionDirectory === 'string'
    && typeof candidate.metadata === 'object'
    && typeof candidate.healthToken === 'string'
    && Number.isSafeInteger(candidate.originalPid);
}

async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch {
      return;
    }
  }
  throw new Error('Meadow did not exit before the updater timeout');
}

async function main(): Promise<void> {
  const configurationPath = process.argv[2];
  if (!configurationPath || !path.isAbsolute(configurationPath)) {
    throw new Error('The updater helper requires an absolute configuration path');
  }
  const configurationStat = fs.lstatSync(configurationPath);
  if (!configurationStat.isFile() || configurationStat.isSymbolicLink()) {
    throw new Error('The updater helper configuration must be a regular file');
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(configurationPath, 'utf8'));
  if (!isHelperConfiguration(parsed)) {
    throw new Error('The updater helper configuration is invalid');
  }
  const metadata = parseUpdateMetadata(JSON.stringify(parsed.metadata));
  await waitForExit(parsed.originalPid);
  await installVerifiedUpdate({
    installedAppPath: parsed.installedAppPath,
    artifactPath: parsed.artifactPath,
    transactionDirectory: parsed.transactionDirectory,
    metadata,
    healthToken: parsed.healthToken,
  });
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : 'Unknown updater helper failure';
  process.stderr.write(`Meadow update failed: ${message}\n`);
  process.exitCode = 1;
});
