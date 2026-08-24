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

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acknowledgeUpdateHealthFromEnvironment,
  downloadVerifiedUpdate,
  installVerifiedUpdate,
  parseUpdateMetadata,
  verifyCmsMetadata,
  type CommandResult,
  type UpdateCommandAdapter,
  type UpdateMetadata,
} from '../../../../../hosts/desktop/src/verifiedUpdater';

const HEALTH_TOKEN = 'a'.repeat(64);
const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix = 'verified-updater-test-'): string {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function metadata(overrides: Partial<UpdateMetadata> = {}): UpdateMetadata {
  return {
    appName: 'Meadow.app',
    artifactPath: 'dist/Meadow-0.5.42-prod-arm64.dmg',
    artifactSha256: 'b'.repeat(64),
    artifactSize: 128,
    bundleId: 'com.meadow.desktop',
    executableName: 'Meadow',
    releaseNotesPath: 'release_notes/0.5.42.md',
    schemaVersion: 1,
    teamId: '3Y93X67X8P',
    version: '0.5.42',
    ...overrides,
  };
}

function createApplication(applicationPath: string, marker: string): void {
  fs.mkdirSync(path.join(applicationPath, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(applicationPath, 'Contents', 'Info.plist'), marker);
  fs.writeFileSync(path.join(applicationPath, 'Contents', 'MacOS', 'Meadow'), marker, {
    mode: 0o755,
  });
  fs.writeFileSync(path.join(applicationPath, 'marker'), marker);
}

type Failure = 'dmg' | 'signature' | 'team' | 'bundle' | 'version' | 'notarization';

class FakeUpdateAdapter implements UpdateCommandAdapter {
  readonly commands: Array<{ file: string; args: readonly string[] }> = [];
  readonly copies: Array<{ source: string; destination: string }> = [];
  readonly launches: Array<{ executablePath: string; environment: NodeJS.ProcessEnv }> = [];
  terminatedPid: number | undefined;
  rollbackExistedAtAcknowledgement = false;

  constructor(private readonly options: {
    failure?: Failure;
    acknowledge?: boolean;
    failRunNumber?: number;
    copyFailure?: boolean;
    launchFailureNumber?: number;
    terminateFailure?: boolean;
    wrongAcknowledgement?: boolean;
  } = {}) {}

  async run(file: string, args: readonly string[]): Promise<CommandResult> {
    this.commands.push({ file, args: [...args] });
    if (this.commands.length === this.options.failRunNumber) {
      throw new Error(`injected command failure ${this.commands.length}`);
    }
    if (file === '/usr/bin/hdiutil' && args[0] === 'verify' && this.options.failure === 'dmg') {
      throw new Error('malformed disk image');
    }
    if (file === '/usr/bin/hdiutil' && args[0] === 'attach') {
      const mountPoint = args[args.indexOf('-mountpoint') + 1];
      createApplication(path.join(mountPoint, 'Meadow.app'), 'new');
    }
    if (file === '/usr/bin/codesign' && args[0] === '--verify' && this.options.failure === 'signature') {
      throw new Error('invalid nested signature');
    }
    if (file === '/usr/bin/codesign' && args[0] === '--display') {
      return {
        stdout: '',
        stderr: [
          `Identifier=${this.options.failure === 'bundle' ? 'example.attacker' : 'com.meadow.desktop'}`,
          `TeamIdentifier=${this.options.failure === 'team' ? 'ATTACKERTEAM' : '3Y93X67X8P'}`,
        ].join('\n'),
      };
    }
    if (file === '/usr/bin/plutil') {
      const key = args[1];
      if (key === 'CFBundleIdentifier') {
        return { stdout: this.options.failure === 'bundle' ? 'example.attacker\n' : 'com.meadow.desktop\n', stderr: '' };
      }
      if (key === 'CFBundleShortVersionString') {
        return { stdout: this.options.failure === 'version' ? '9.9.9\n' : '0.5.42\n', stderr: '' };
      }
      return { stdout: 'Meadow\n', stderr: '' };
    }
    if (file === '/usr/sbin/spctl' && this.options.failure === 'notarization') {
      throw new Error('Gatekeeper rejected update');
    }
    return { stdout: '', stderr: '' };
  }

  async copyApplication(source: string, destination: string): Promise<void> {
    this.copies.push({ source, destination });
    if (this.options.copyFailure) throw new Error('injected copy failure');
    fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
  }

  async launchApplication(
    executablePath: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<{ pid: number }> {
    this.launches.push({ executablePath, environment });
    if (this.launches.length === this.options.launchFailureNumber) {
      throw new Error(`injected launch failure ${this.launches.length}`);
    }
    if (this.options.acknowledge && environment.MEADOW_UPDATE_HEALTH_ACK_PATH) {
      const destinationDirectory = path.dirname(path.dirname(path.dirname(path.dirname(executablePath))));
      this.rollbackExistedAtAcknowledgement = fs.readdirSync(destinationDirectory)
        .some(name => name.includes('.meadow-update-rollback-'));
      fs.writeFileSync(
        environment.MEADOW_UPDATE_HEALTH_ACK_PATH,
        `${this.options.wrongAcknowledgement ? 'c'.repeat(64) : environment.MEADOW_UPDATE_HEALTH_TOKEN}\n`,
        { mode: 0o600 },
      );
    }
    return { pid: 4242 };
  }

  async terminateApplication(pid: number): Promise<void> {
    this.terminatedPid = pid;
    if (this.options.terminateFailure) throw new Error('injected termination failure');
  }
}

function installFixture(
  root: string,
  adapter: FakeUpdateAdapter,
): Parameters<typeof installVerifiedUpdate>[0] {
  const destination = path.join(root, 'Destination');
  const installedAppPath = path.join(destination, 'Meadow.app');
  const transactionDirectory = path.join(root, 'transaction');
  fs.mkdirSync(destination);
  fs.mkdirSync(transactionDirectory);
  createApplication(installedAppPath, 'old');
  const artifactPath = path.join(transactionDirectory, 'Meadow.dmg');
  fs.writeFileSync(artifactPath, 'fake dmg');
  return {
    installedAppPath,
    artifactPath,
    transactionDirectory,
    metadata: metadata(),
    healthToken: HEALTH_TOKEN,
    healthTimeoutMs: 20,
    pollIntervalMs: 1,
    adapter,
  };
}

describe('verified updater metadata and download', () => {
  it('strictly rejects malformed or wrongly identified signed metadata', () => {
    expect(() => parseUpdateMetadata('{')).toThrow(/not valid JSON/);
    expect(() => parseUpdateMetadata(JSON.stringify({ ...metadata(), extra: true })))
      .toThrow(/unknown or missing/);
    expect(() => parseUpdateMetadata(JSON.stringify(metadata({ teamId: 'ATTACKER' }))))
      .toThrow(/does not identify Meadow/);
    expect(() => parseUpdateMetadata(JSON.stringify(metadata({ bundleId: 'example.attacker' }))))
      .toThrow(/does not identify Meadow/);
    expect(() => parseUpdateMetadata(JSON.stringify(metadata({ artifactPath: '../escape.dmg' }))))
      .toThrow(/artifact path/);
  });

  it('blocks an invalid CMS signature and removes the bounded temporary directory', async () => {
    const root = temporaryDirectory();
    const fetchImplementation = async (): Promise<Response> => new Response('cms');
    await expect(downloadVerifiedUpdate('https://updates.example/app', {
      fetchImplementation: fetchImplementation as typeof fetch,
      metadataVerifier: async () => { throw new Error('invalid CMS signature'); },
      temporaryRoot: root,
    })).rejects.toThrow(/invalid CMS signature/);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('blocks a bad artifact checksum and removes partial data', async () => {
    const root = temporaryDirectory();
    const artifact = Buffer.from('fake artifact');
    const signedMetadata = metadata({
      artifactSize: artifact.length,
      artifactSha256: createHash('sha256').update('different').digest('hex'),
    });
    const fetchImplementation = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      return new Response(url.endsWith('.cms') ? 'cms' : artifact);
    };
    await expect(downloadVerifiedUpdate('https://updates.example/app', {
      fetchImplementation: fetchImplementation as typeof fetch,
      metadataVerifier: async () => Buffer.from(JSON.stringify(signedMetadata)),
      temporaryRoot: root,
    })).rejects.toThrow(/checksum/);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('fails closed at every CMS verification command boundary', async () => {
    for (let failure = 1; failure <= 3; failure += 1) {
      const transactionDirectory = temporaryDirectory(`verified-cms-${failure}-`);
      const cmsPath = path.join(transactionDirectory, 'metadata.cms');
      fs.writeFileSync(cmsPath, 'cms');
      let invocation = 0;
      const adapter = new FakeUpdateAdapter();
      adapter.run = async (file, args): Promise<CommandResult> => {
        invocation += 1;
        if (invocation === failure) throw new Error(`CMS command failure ${failure}`);
        if (file === '/usr/bin/security') {
          fs.writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify(metadata()));
        } else if (file === '/usr/bin/openssl' && args[0] === 'cms') {
          const payload = JSON.stringify(metadata());
          fs.writeFileSync(args[args.indexOf('-out') + 1], payload);
          fs.writeFileSync(args[args.indexOf('-signer') + 1], 'certificate');
        } else if (file === '/usr/bin/openssl' && args[0] === 'x509') {
          return { stdout: 'CN=Meadow Update Metadata,OU=3Y93X67X8P\n', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      };

      await expect(verifyCmsMetadata(cmsPath, transactionDirectory, adapter))
        .rejects.toThrow(`CMS command failure ${failure}`);
    }
  });

  it('requires CMS system-trust and cryptographic decodes to match and the signer Team ID to match', async () => {
    const run = async (differentDecode: boolean, teamId: string): Promise<void> => {
      const transactionDirectory = temporaryDirectory('verified-cms-identity-');
      const cmsPath = path.join(transactionDirectory, 'metadata.cms');
      const payload = JSON.stringify(metadata());
      fs.writeFileSync(cmsPath, 'cms');
      const adapter = new FakeUpdateAdapter();
      adapter.run = async (file, args): Promise<CommandResult> => {
        if (file === '/usr/bin/security') {
          fs.writeFileSync(args[args.indexOf('-o') + 1], payload);
        } else if (file === '/usr/bin/openssl' && args[0] === 'cms') {
          fs.writeFileSync(args[args.indexOf('-out') + 1], differentDecode ? `${payload} ` : payload);
          fs.writeFileSync(args[args.indexOf('-signer') + 1], 'certificate');
        } else if (file === '/usr/bin/openssl' && args[0] === 'x509') {
          return { stdout: `CN=Meadow Update Metadata,OU=${teamId}\n`, stderr: '' };
        }
        return { stdout: '', stderr: '' };
      };
      await verifyCmsMetadata(cmsPath, transactionDirectory, adapter);
    };

    await expect(run(true, '3Y93X67X8P')).rejects.toThrow(/decoded different metadata/);
    await expect(run(false, 'ATTACKERTEAM')).rejects.toThrow(/expected Team ID/);
    await expect(run(false, '3Y93X67X8P')).resolves.toBeUndefined();
  });
});

describe('verified updater transaction', () => {
  for (const failure of ['dmg', 'signature', 'team', 'bundle', 'version', 'notarization'] as const) {
    it(`blocks ${failure} failure before replacing the installed application`, async () => {
      const root = temporaryDirectory();
      const adapter = new FakeUpdateAdapter({ failure });
      const fixture = installFixture(root, adapter);
      await expect(installVerifiedUpdate(fixture)).rejects.toThrow();
      expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('old');
      expect(adapter.launches).toHaveLength(0);
    });
  }

  it('restores and relaunches the rollback application after a post-swap health failure', async () => {
    const root = temporaryDirectory();
    const adapter = new FakeUpdateAdapter();
    const fixture = installFixture(root, adapter);
    await expect(installVerifiedUpdate(fixture)).rejects.toThrow(/did not acknowledge/);
    expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('old');
    expect(adapter.terminatedPid).toBe(4242);
    expect(adapter.launches).toHaveLength(2);
  });

  it('removes rollback only after the one-time health acknowledgement', async () => {
    const root = temporaryDirectory();
    const adapter = new FakeUpdateAdapter({ acknowledge: true });
    const fixture = installFixture(root, adapter);
    const result = await installVerifiedUpdate(fixture);
    expect(adapter.rollbackExistedAtAcknowledgement).toBe(true);
    expect(result.healthAcknowledged).toBe(true);
    expect(fs.existsSync(result.rollbackPath)).toBe(false);
    expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('new');
  });

  it('passes hostile controlled paths as single argv values without shell interpretation', async () => {
    const root = temporaryDirectory('verified updater ;$(touch meadow-pwned) [x]-');
    const adapter = new FakeUpdateAdapter({ acknowledge: true });
    const fixture = installFixture(root, adapter);
    await installVerifiedUpdate(fixture);
    const verifyCommand = adapter.commands.find(command => (
      command.file === '/usr/bin/hdiutil' && command.args[0] === 'verify'
    ));
    expect(verifyCommand?.args).toEqual(['verify', fixture.artifactPath]);
    expect(adapter.copies).toHaveLength(1);
    expect(adapter.copies[0].source).toContain(path.join(fixture.transactionDirectory, 'mounted'));
    expect(adapter.copies[0].destination).toContain(path.dirname(fixture.installedAppPath));
    expect(adapter.launches[0].executablePath).toContain(path.dirname(fixture.installedAppPath));
    expect(adapter.commands.every(command => command.file.startsWith('/usr/'))).toBe(true);
    expect(fs.existsSync(path.join(os.tmpdir(), 'meadow-pwned'))).toBe(false);
  });

  it('preserves the installed app across every pre-swap external command boundary', async () => {
    // verify, attach, two complete application verification passes (six
    // commands each). The fifteenth command is best-effort detach after a
    // successful acknowledged update and is tested separately below.
    for (let failRunNumber = 1; failRunNumber <= 14; failRunNumber += 1) {
      const root = temporaryDirectory(`verified-updater-command-${failRunNumber}-`);
      const adapter = new FakeUpdateAdapter({ failRunNumber, acknowledge: true });
      const fixture = installFixture(root, adapter);
      await expect(installVerifiedUpdate(fixture)).rejects.toThrow(/injected command failure/);
      expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('old');
    }
  });

  it('does not reverse a healthy install when best-effort DMG detach fails', async () => {
    const root = temporaryDirectory();
    const adapter = new FakeUpdateAdapter({ failRunNumber: 15, acknowledge: true });
    const fixture = installFixture(root, adapter);
    await expect(installVerifiedUpdate(fixture)).resolves.toMatchObject({ healthAcknowledged: true });
    expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('new');
    expect(adapter.commands.at(-1)?.args[0]).toBe('detach');
  });

  it('preserves the installed app when staging copy fails', async () => {
    const root = temporaryDirectory();
    const adapter = new FakeUpdateAdapter({ copyFailure: true });
    const fixture = installFixture(root, adapter);
    await expect(installVerifiedUpdate(fixture)).rejects.toThrow(/copy failure/);
    expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('old');
  });

  it('restores the installed app when the updated executable cannot launch', async () => {
    const root = temporaryDirectory();
    const adapter = new FakeUpdateAdapter({ launchFailureNumber: 1 });
    const fixture = installFixture(root, adapter);
    await expect(installVerifiedUpdate(fixture)).rejects.toThrow(/launch failure/);
    expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('old');
    expect(adapter.launches).toHaveLength(2);
  });

  it('restores the installed app after a wrong health acknowledgement token', async () => {
    const root = temporaryDirectory();
    const adapter = new FakeUpdateAdapter({ acknowledge: true, wrongAcknowledgement: true });
    const fixture = installFixture(root, adapter);
    await expect(installVerifiedUpdate(fixture)).rejects.toThrow(/wrong token/);
    expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('old');
  });

  it('continues rollback when termination of the unhealthy app fails', async () => {
    const root = temporaryDirectory();
    const adapter = new FakeUpdateAdapter({ terminateFailure: true });
    const fixture = installFixture(root, adapter);
    await expect(installVerifiedUpdate(fixture)).rejects.toThrow(/did not acknowledge/);
    expect(adapter.terminatedPid).toBe(4242);
    expect(fs.readFileSync(path.join(fixture.installedAppPath, 'marker'), 'utf8')).toBe('old');
  });
});

describe('update health acknowledgement', () => {
  it('writes exclusively inside the updater transaction and clears the one-time environment', () => {
    const root = temporaryDirectory();
    const transactionDirectory = fs.mkdtempSync(path.join(root, 'meadow-update-'));
    const acknowledgementPath = path.join(transactionDirectory, 'health-ack');
    const environment: NodeJS.ProcessEnv = {
      MEADOW_UPDATE_HEALTH_TOKEN: HEALTH_TOKEN,
      MEADOW_UPDATE_HEALTH_ACK_PATH: acknowledgementPath,
      MEADOW_UPDATE_TRANSACTION_ID: 'transaction',
    };
    expect(acknowledgeUpdateHealthFromEnvironment(environment, root)).toBe(true);
    expect(fs.readFileSync(acknowledgementPath, 'utf8')).toBe(`${HEALTH_TOKEN}\n`);
    expect(environment.MEADOW_UPDATE_HEALTH_TOKEN).toBeUndefined();
  });

  it('rejects an acknowledgement path outside the updater transaction', () => {
    const root = temporaryDirectory();
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    expect(() => acknowledgeUpdateHealthFromEnvironment({
      MEADOW_UPDATE_HEALTH_TOKEN: HEALTH_TOKEN,
      MEADOW_UPDATE_HEALTH_ACK_PATH: path.join(outside, 'health-ack'),
    }, root)).toThrow(/outside its transaction/);
  });
});
