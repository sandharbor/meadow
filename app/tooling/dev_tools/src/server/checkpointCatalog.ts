/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CHECKPOINT_REPO_DIRECTORY,
  checkpointCompatibility,
  listCheckpoints,
  type CheckpointMetadata,
} from '../../../local_services/src/index.js';
import { describeAppPlace, parseAppPlace } from '../../../../contracts/places/index.js';

/** A checkpoint as Dev Tools and the report viewer present it. */
export interface CheckpointOption {
  runId: string;
  scenario: string;
  index: number;
  message: string;
  capturedAt: string;
  openable: boolean;
  /** Why the checkpoint cannot be opened at all. */
  unavailableReason?: string;
  /** Hosted Development is only possible when no local service holds state. */
  hostedAvailable: boolean;
  hostedUnavailableReason?: string;
  upgradeFromFormat?: number;
  reportUrl: string;
  /** Where in the app the checkpoint was taken, for display. */
  placeDescription?: string;
  metadata: CheckpointMetadata;
}

export function e2eRunsDirectory(): string {
  return process.env.MEADOW_E2E_RUNS_DIRECTORY ?? path.join(os.homedir(), 'meadow-e2e-artifacts/current');
}

export function reportViewerUrl(): string {
  return (process.env.MEADOW_REPORT_VIEWER_URL ?? 'http://localhost:5175').replace(/\/$/, '');
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function scenarioDirectory(runId: string, scenario: string): string {
  if (!SAFE_SEGMENT.test(runId) || !SAFE_SEGMENT.test(scenario) || runId.startsWith('.') || scenario.startsWith('.')) {
    throw new Error('Invalid run or scenario');
  }
  const directory = path.join(e2eRunsDirectory(), runId, scenario);
  if (!fs.existsSync(directory)) throw new Error(`Scenario not found: ${runId}/${scenario}`);
  return directory;
}

export function checkpointRepository(runId: string, scenario: string): string {
  return path.join(scenarioDirectory(runId, scenario), CHECKPOINT_REPO_DIRECTORY);
}

function describePlace(place: string): string | undefined {
  try {
    return describeAppPlace(parseAppPlace(place).place);
  } catch {
    return undefined;
  }
}

function describeState(metadata: CheckpointMetadata): string {
  return metadata.parts.filter(part => part.hasState).map(part => part.displayName).join(' and ');
}

export function checkpointOptions(runId: string, scenario: string): CheckpointOption[] {
  const repo = checkpointRepository(runId, scenario);
  return listCheckpoints(repo).map(({ index, metadata }) => {
    const compatibility = checkpointCompatibility(metadata);
    const heldState = describeState(metadata);
    return {
      runId,
      scenario,
      index,
      message: metadata.message,
      capturedAt: metadata.capturedAt,
      openable: compatibility.openable,
      ...(compatibility.reason && { unavailableReason: compatibility.reason }),
      hostedAvailable: compatibility.openable && heldState.length === 0,
      ...(heldState && {
        hostedUnavailableReason: `This checkpoint holds state in local ${heldState}, such as published content or a signed-in account; a hosted backend could not resolve it.`,
      }),
      ...(compatibility.upgradeFromFormat !== undefined && { upgradeFromFormat: compatibility.upgradeFromFormat }),
      reportUrl: `${reportViewerUrl()}/${encodeURIComponent(runId)}/${encodeURIComponent(scenario)}`,
      ...(metadata.place && { placeDescription: describePlace(metadata.place) }),
      metadata,
    };
  });
}
