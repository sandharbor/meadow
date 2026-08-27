import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findUnexpectedDistDirectories,
  validatePolicy,
} from "../scripts/check-dist-directories.mjs";

async function withTemporaryRepository(run) {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "meadow-dist-policy-"));
  try {
    await run(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

const emptyPolicy = {
  allowedDistDirectories: [],
  ignoredTrees: [],
};

test("finds dist directories throughout a repository", async () => {
  await withTemporaryRepository(async repositoryRoot => {
    await mkdir(path.join(repositoryRoot, "app", "tooling", "dev_tools", "dist"), { recursive: true });
    await mkdir(path.join(repositoryRoot, "tools", "example", "dist"), { recursive: true });

    assert.deepEqual(
      await findUnexpectedDistDirectories(repositoryRoot, emptyPolicy),
      ["app/tooling/dev_tools/dist", "tools/example/dist"],
    );
  });
});

test("allows only explicitly documented dist outputs", async () => {
  await withTemporaryRepository(async repositoryRoot => {
    await mkdir(path.join(repositoryRoot, "app", "clients", "cli", "dist", "nested", "dist"), { recursive: true });
    await mkdir(path.join(repositoryRoot, "app", "tooling", "dev_tools", "dist"), { recursive: true });

    const policy = {
      allowedDistDirectories: [
        { path: "app/clients/cli/dist", reason: "CLI distribution output." },
      ],
      ignoredTrees: [],
    };

    assert.deepEqual(
      await findUnexpectedDistDirectories(repositoryRoot, policy),
      ["app/tooling/dev_tools/dist"],
    );
  });
});

test("ignores dependencies, tool caches, and documented generated trees", async () => {
  await withTemporaryRepository(async repositoryRoot => {
    await mkdir(path.join(repositoryRoot, "node_modules", "dependency", "dist"), { recursive: true });
    await mkdir(path.join(repositoryRoot, "native", "target", "package", "dist"), { recursive: true });
    await mkdir(path.join(repositoryRoot, "desktop", "build", "payload", "dist"), { recursive: true });

    const policy = {
      allowedDistDirectories: [],
      ignoredTrees: [
        { path: "desktop/build", reason: "Desktop packaging output." },
      ],
    };

    assert.deepEqual(await findUnexpectedDistDirectories(repositoryRoot, policy), []);
  });
});

test("requires normalized, explained policy exceptions", () => {
  assert.throws(
    () => validatePolicy({
      allowedDistDirectories: [{ path: "app/tooling/dev_tools", reason: "No dist suffix." }],
    }),
    /must name a dist directory/,
  );

  assert.throws(
    () => validatePolicy({
      allowedDistDirectories: [{ path: "app/clients/cli/dist", reason: "" }],
    }),
    /must explain why the exception is needed/,
  );
});
