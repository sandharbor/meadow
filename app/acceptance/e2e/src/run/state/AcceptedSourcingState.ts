/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import path from 'node:path';

/** Reads the accepted source capture and tracking evidence afresh after each action. */
export class AcceptedSourcingState {
  private readonly directory: string;
  constructor(configDir: string, bundleSlug: string) {
    this.directory = path.join(configDir, 'bundles', bundleSlug, 'raw');
  }
  get current(): { acceptedId: string; candidateId?: string } {
    return JSON.parse(fs.readFileSync(path.join(this.directory, 'sourcing/state.json'), 'utf8'));
  }
  get acceptedId(): string { return this.current.acceptedId; }
  get tracking(): Record<string, { sensitivity: { effectivelySensitive: boolean; reviewedAt?: string } }> {
    return JSON.parse(fs.readFileSync(path.join(this.directory, 'sourcing/tracking.json'), 'utf8'));
  }
  get acceptanceHistory(): unknown[] {
    return JSON.parse(fs.readFileSync(path.join(this.directory, 'sourcing/acceptance-history.json'), 'utf8'));
  }
  retainedPageText(filename: string): string {
    return fs.readFileSync(path.join(this.directory, 'tracked_page_content', filename), 'utf8');
  }
  hasRetainedPage(filename: string): boolean {
    return fs.existsSync(path.join(this.directory, 'tracked_page_content', filename));
  }
}
