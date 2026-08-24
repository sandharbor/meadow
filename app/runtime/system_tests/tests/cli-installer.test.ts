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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installCommandLineInterface } from "../../../electron_app/src/cliInstaller.js";

const temporaryDirectories: string[] = [];

function makeFixture(): { root: string; home: string; sourcePath: string; systemBin: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-cli-installer-test-"));
  temporaryDirectories.push(root);
  const home = path.join(root, "home");
  const sourcePath = path.join(root, "Meadow.app", "Contents", "Resources", "cli", "meadow");
  const systemBin = path.join(root, "usr", "local", "bin");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "#!/bin/sh\n", { mode: 0o755 });
  return { root, home, sourcePath, systemBin };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Meadow CLI installation", () => {
  it("uses the login-shell PATH when Finder gives Electron a minimal PATH", async () => {
    const { home, sourcePath, systemBin } = makeFixture();
    const userBin = path.join(home, ".local", "bin");

    const result = await installCommandLineInterface(sourcePath, {
      platform: "darwin",
      environmentPath: "/usr/bin:/bin:/usr/sbin:/sbin",
      homeDirectory: home,
      systemInstallDirectory: systemBin,
      loginShellPathResolver: () => Promise.resolve(`${userBin}:/usr/bin:/bin`),
      privilegedLinkInstaller: () => Promise.reject(new Error("privileged install should not run")),
    });

    const commandPath = path.join(userBin, "meadow");
    expect(result).toMatchObject({ status: "installed", commandPath });
    expect(fs.readlinkSync(commandPath)).toBe(sourcePath);
  });

  it("prefers the standard per-user directory over PATH ordering", async () => {
    const { home, sourcePath, systemBin } = makeFixture();
    const localBin = path.join(home, ".local", "bin");
    const homeBin = path.join(home, "bin");
    fs.mkdirSync(homeBin, { recursive: true });

    const result = await installCommandLineInterface(sourcePath, {
      platform: "darwin",
      environmentPath: "/usr/bin:/bin",
      homeDirectory: home,
      systemInstallDirectory: systemBin,
      loginShellPathResolver: () => Promise.resolve(`${homeBin}:${localBin}:/usr/bin`),
    });

    expect(result.commandPath).toBe(path.join(localBin, "meadow"));
  });

  it("falls back to the process PATH if login-shell discovery fails", async () => {
    const { home, sourcePath, systemBin } = makeFixture();
    const homeBin = path.join(home, "bin");

    const result = await installCommandLineInterface(sourcePath, {
      platform: "darwin",
      environmentPath: `${homeBin}:/usr/bin:/bin`,
      homeDirectory: home,
      systemInstallDirectory: systemBin,
      loginShellPathResolver: () => Promise.reject(new Error("shell startup failed")),
    });

    expect(result).toMatchObject({
      status: "installed",
      commandPath: path.join(homeBin, "meadow"),
    });
  });

  it("uses administrator installation only for a shell-visible system directory", async () => {
    const { home, sourcePath, systemBin } = makeFixture();
    fs.mkdirSync(systemBin, { recursive: true });
    let privilegedCall: { sourcePath: string; commandPath: string } | null = null;

    const result = await installCommandLineInterface(sourcePath, {
      platform: "darwin",
      environmentPath: "/usr/bin:/bin",
      homeDirectory: home,
      systemInstallDirectory: systemBin,
      loginShellPathResolver: () => Promise.resolve(`${systemBin}:/usr/bin:/bin`),
      directoryIsWritable: (directory) => directory !== systemBin,
      privilegedLinkInstaller: (privilegedSourcePath, commandPath) => {
        privilegedCall = { sourcePath: privilegedSourcePath, commandPath };
        return Promise.resolve();
      },
    });

    expect(result).toMatchObject({
      status: "installed",
      commandPath: path.join(systemBin, "meadow"),
    });
    expect(privilegedCall).toEqual({
      sourcePath,
      commandPath: path.join(systemBin, "meadow"),
    });
  });

  it("does not overwrite a conflicting system command before elevation", async () => {
    const { home, sourcePath, systemBin } = makeFixture();
    fs.mkdirSync(systemBin, { recursive: true });
    const commandPath = path.join(systemBin, "meadow");
    fs.writeFileSync(commandPath, "different command\n");
    let privilegedInstallerCalled = false;

    const result = await installCommandLineInterface(sourcePath, {
      platform: "darwin",
      environmentPath: "/usr/bin:/bin",
      homeDirectory: home,
      systemInstallDirectory: systemBin,
      loginShellPathResolver: () => Promise.resolve(`${systemBin}:/usr/bin:/bin`),
      directoryIsWritable: () => false,
      privilegedLinkInstaller: () => {
        privilegedInstallerCalled = true;
        return Promise.resolve();
      },
    });

    expect(result).toMatchObject({ status: "conflict", commandPath });
    expect(privilegedInstallerCalled).toBe(false);
    expect(fs.readFileSync(commandPath, "utf8")).toBe("different command\n");
  });

  it("reports an unavailable install when no supported directory is on the shell PATH", async () => {
    const { home, sourcePath, systemBin } = makeFixture();

    const result = await installCommandLineInterface(sourcePath, {
      platform: "darwin",
      environmentPath: "/usr/bin:/bin:/usr/sbin:/sbin",
      homeDirectory: home,
      systemInstallDirectory: systemBin,
      loginShellPathResolver: () => Promise.resolve("/usr/bin:/bin:/usr/sbin:/sbin"),
    });

    expect(result).toMatchObject({ status: "unavailable", commandPath: null });
    expect(result.message).toContain(path.join(home, ".local", "bin"));
  });
});
