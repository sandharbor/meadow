/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { ConceptText } from '../../../../concepts/types.js';

export interface RecordedCheckpoint {
  id: number;
  message: string;
  text?: ConceptText;
  timestamp: string;
  sourceLine?: number;
}

export interface RecordedKeyFrame {
  docId: string;
  filename: string;
  timestamp?: string;
  codeRevision?: string;
  uncommittedCode?: boolean;
  checkpointId?: number;
}

export interface CheckpointTarget {
  homeDirectory: string;
  partition: string;
  ports: Record<string, number>;
}

export type CheckpointOptions = {
  keyFrames?: readonly { readonly id: string }[];
} & (CheckpointTarget | { homeDirectory?: undefined; partition?: undefined; ports?: undefined });
