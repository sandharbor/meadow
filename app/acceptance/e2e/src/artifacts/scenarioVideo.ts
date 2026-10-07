/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const scenarioRecordingDirectory = (testDirectory: string): string => path.join(testDirectory, '.video-recordings');

/** Recordings are scoped to their scenario and run, rather than shared temporary test output. */
export function findScenarioRecording(testDirectory: string): string | null {
  const directory = scenarioRecordingDirectory(testDirectory);
  if (!existsSync(directory)) return null;
  return readdirSync(directory).filter(file => file.endsWith('.webm'))
    .map(file => path.join(directory, file)).sort((a, b) => statSync(b).size - statSync(a).size)[0] ?? null;
}

/** A saved recording belongs to its run, even after Playwright cleans its temporary output. */
export function assembleScenarioVideo(testDirectory: string, recording: string | null): number | undefined {
  const destination = path.join(testDirectory, 'video.webm');
  if (recording) copyFileSync(recording, destination);
  return existsSync(destination) ? statSync(destination).size : undefined;
}
