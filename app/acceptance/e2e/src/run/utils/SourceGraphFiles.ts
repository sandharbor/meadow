/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import path from 'node:path';

/** Inspect and edit the scenario's isolated live sources, independently of accepted captures. */
export class SourceGraphFiles {
  constructor(private readonly root: string) {}
  text(relativePath: string): string { return fs.readFileSync(path.join(this.root, relativePath), 'utf8'); }
  append(relativePath: string, text: string): void { fs.appendFileSync(path.join(this.root, relativePath), text); }
  replaceText(relativePath: string, before: string, after: string): void {
    const current = this.text(relativePath);
    if (!current.includes(before)) throw new Error(`Source ${relativePath} does not contain ${JSON.stringify(before)}`);
    fs.writeFileSync(path.join(this.root, relativePath), current.replaceAll(before, after));
  }
}
