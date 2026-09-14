/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export interface FolderBundleSelectionValidation {
  selectionError: string | null;
  folderErrors: Array<{ folder: string; message: string }>;
}
