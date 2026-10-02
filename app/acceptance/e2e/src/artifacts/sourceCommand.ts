/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** An execution of a command in the captured scenario source. */
export interface SourceCommand {
  id: number;
  file: string;
  line: number;
  column: number;
  endLine: number;
  text: string;
  status: 'running' | 'completed' | 'failed';
}
