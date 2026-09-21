/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** Admission and starting selections are independent bundle decisions. */
export interface StartingSelection {
  sourceId: string;
  kind: 'file' | 'folder';
  /** Source-relative path, including the extension for a file; empty means the root folder. */
  path: string;
}
