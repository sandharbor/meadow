/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

/** App-level provider settings used to arrange publishing destinations and failures. */
export class MeadowHomeProviderSettings {
  private readonly directory: string;
  constructor(home: string, providerId: string) { this.directory = path.join(home, 'app/publishing_providers', providerId); }
  private update(filename: string, fields: Record<string, unknown>): void {
    const file = path.join(this.directory, filename);
    const current = fs.existsSync(file) ? YAML.parse(fs.readFileSync(file, 'utf8')) : {};
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(file, YAML.stringify({ ...current, ...fields }));
  }
  setActive(isActive: boolean): void { this.update('pp_config.yaml', { isActive }); }
  setResources(fields: Record<string, unknown>): void { this.update('pp_resources.yaml', fields); }
  /** Restore the exact secret document after exercising a missing-credentials failure. */
  removeS3Credentials(): () => void {
    const file = path.join(this.directory, 'pp_secrets.yaml');
    const original = fs.readFileSync(file);
    this.update('pp_secrets.yaml', { s3AccessKeyId: '', s3SecretAccessKey: '' });
    return () => fs.writeFileSync(file, original);
  }
}
