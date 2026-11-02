/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

/** Home bootstrap and diagnostic evidence shared by acceptance scenarios. */
export class MeadowHomeFiles {
  constructor(private readonly home: string) {}
  formatVersion(): number { return YAML.parse(fs.readFileSync(path.join(this.home, 'meadow_home.yaml'), 'utf8')).formatVersion; }
  ignoreRules(): string { return fs.readFileSync(path.join(this.home, '.gitignore'), 'utf8'); }
  logText(): string { return fs.readFileSync(path.join(this.home, 'logs/meadow.log'), 'utf8'); }
}
