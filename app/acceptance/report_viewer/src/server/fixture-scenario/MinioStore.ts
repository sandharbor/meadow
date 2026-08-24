/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import path from "path";
import { StateRepoBase } from "./StateRepoBase.js";
import { TickStamp } from "./Ticker.js";

// MinioStore mirrors the live snapshot fixture's "minio-state-repo": every
// S3 object is a file under objects/<key>, committed in git as the test
// progresses. Object keys are stamped with the tick that created them so
// the S3 pane is self-documenting.

export class MinioStore extends StateRepoBase {
  constructor(testDir: string) {
    super(testDir, "minio-state-repo");
  }

  // Put an object at objects/<key>. The tick number is woven into the key
  // so the object's provenance is visible in the listing.
  putObject(tick: TickStamp, baseKey: string, body: string | Buffer): string {
    const stampedKey = `T${tick.tickIndex}-${baseKey}`;
    this.writeRepoFile(`objects/${stampedKey}`, body);
    return stampedKey;
  }

  updateObject(objectKey: string, body: string | Buffer): void {
    this.writeRepoFile(`objects/${objectKey}`, body);
  }

  deleteObject(objectKey: string): void {
    const full = path.resolve(this.repoDir, "objects", objectKey);
    if (!full.startsWith(path.resolve(this.repoDir, "objects") + path.sep)) {
      throw new Error(`Refusing to delete S3 object outside objects/: ${objectKey}`);
    }
    rmSync(full, { force: true });
  }

  // Return current object keys, including uncommitted working-tree changes.
  // This mirrors live captureTickSync, which reads the bucket state directly
  // rather than waiting for a manual snapshot commit.
  listObjectKeys(): string[] {
    return this.listObjectFiles().map(({ key }) => key).sort();
  }

  objectContents(): Record<string, string> {
    const contents: Record<string, string> = {};
    for (const { key, fullPath } of this.listObjectFiles()) {
      contents[key] = readFileSync(fullPath, "utf8");
    }
    return contents;
  }

  private listObjectFiles(): { key: string; fullPath: string }[] {
    const objectsDir = path.join(this.repoDir, "objects");
    if (!existsSync(objectsDir)) return [];

    const files: { key: string; fullPath: string }[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          visit(fullPath);
        } else if (stat.isFile()) {
          files.push({
            key: path.relative(objectsDir, fullPath).split(path.sep).join("/"),
            fullPath,
          });
        }
      }
    };
    visit(objectsDir);
    return files.sort((a, b) => a.key.localeCompare(b.key));
  }
}
