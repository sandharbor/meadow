/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireLocalServices,
  loadLocalServices,
  releaseLocalServices,
  restoreCheckpoint,
  startPartitionServices,
  type LocalServiceContainer,
  type LocalServicePart,
  type StartedPartitionServices,
} from '../../../local_services/src/index.js';
import { EMPTY_HOME, homeFixtureDisplayName, openHomeFixture } from '../../../../shared_code/shared_dev/savedStates.js';
import { ensureResourcesConfigInitialized, saveResourcesLocalConfig } from '../../../../shared_code/utils/resourcesConfigUtils.js';
import { checkpointOptions, checkpointRepository } from './checkpointCatalog.js';
import type { ParticipatesIn, savedState } from '../../../../concepts/index.js';

export type SavedStateOrigin =
  | { kind: 'normal' }
  | { kind: 'empty' }
  | { kind: 'fixture'; fixture: string }
  | { kind: 'checkpoint'; runId: string; scenario: string; checkpoint: number };

export type ServiceTarget = 'local' | 'hosted';

/** A saved state that cannot be opened the way it was asked for. */
export class SavedStateRefusal extends Error {}

/** Everything the "What am I QA-ing?" panel shows. */
export interface OpenSavedState {
  id: string;
  origin: SavedStateOrigin;
  label: string;
  homeDirectory: string;
  logsDirectory: string;
  serviceTarget: ServiceTarget;
  openedAt: string;
  partition?: string;
  localServiceParts?: string[];
  /** Containers this partition lives in; a restarted container lost it. */
  localServiceContainers?: Record<string, string>;
  /** Ports of the partition's processes, reused when Dev Tools restarts. */
  localServicePorts?: Record<string, number>;
  /** Set when the open state could not be resumed after a restart. */
  notice?: string;
  checkpoint?: {
    message: string;
    scenarioTitle: string;
    reportUrl: string;
    runCodeRevision: string;
    runUncommittedCode: boolean;
  };
  currentCode: { revision: string; uncommitted: boolean };
  formatUpgrade?: { from: number; to: number };
  /** Extra Runtime service environment for Local Services stand-ins. */
  serviceEnvironment: Record<string, string>;
}

export interface SavedStateSessionOptions {
  projectRoot: string;
  /** The developer's real Meadow Home, opened as Normal. */
  normalHome: string;
  /** Root for opened saved-state homes. */
  homesDirectory?: string;
  instanceName?: string;
}

function currentCode(projectRoot: string): OpenSavedState['currentCode'] {
  try {
    return {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim(),
      uncommitted: execFileSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf8' }).trim().length > 0,
    };
  } catch {
    return { revision: 'unknown', uncommitted: false };
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'state';
}

/**
 * Dev Tools opens one saved state at a time into its own home folder. The
 * developer's real Meadow Home is never moved; Normal simply opens it.
 */
export class SavedStateSession {
  readonly homesDirectory: string;
  private readonly statePath: string;
  private readonly holder: string;
  private services: StartedPartitionServices | undefined;
  private leasedParts: { parts: LocalServicePart[]; containers: Record<string, LocalServiceContainer> } | undefined;

  constructor(private readonly options: SavedStateSessionOptions) {
    const instance = options.instanceName ?? 'default';
    this.homesDirectory = options.homesDirectory ?? path.join(os.homedir(), 'meadow-dev-homes', slug(instance));
    this.statePath = path.join(this.homesDirectory, 'current.json');
    this.holder = `dev-tools-${slug(instance)}-${process.pid}`;
  }

  current(): OpenSavedState {
    try {
      return JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as OpenSavedState;
    } catch {
      return this.normalState();
    }
  }

  private normalState(): OpenSavedState {
    return {
      id: 'normal',
      origin: { kind: 'normal' },
      label: 'Normal',
      homeDirectory: this.options.normalHome,
      logsDirectory: path.join(this.options.normalHome, 'logs'),
      serviceTarget: 'hosted',
      openedAt: new Date().toISOString(),
      currentCode: currentCode(this.options.projectRoot),
      serviceEnvironment: {},
    };
  }

  /** Adopt an already-prepared home, such as an E2E scenario's own home. */
  adopt(state: Omit<OpenSavedState, 'openedAt' | 'currentCode' | 'serviceEnvironment'> & { serviceEnvironment?: Record<string, string> }): OpenSavedState {
    const adopted: OpenSavedState = {
      ...state,
      openedAt: new Date().toISOString(),
      currentCode: currentCode(this.options.projectRoot),
      serviceEnvironment: state.serviceEnvironment ?? {},
    };
    this.save(adopted);
    return adopted;
  }

  /** Graphs isolated inside the open home, which source changes may modify. */
  openSourceGraphs(): string[] {
    const session = path.join(this.current().homeDirectory, 'source_graphs', '.meadow-source-session.json');
    try {
      return (JSON.parse(fs.readFileSync(session, 'utf8')) as { sourceGraphs: string[] }).sourceGraphs;
    } catch {
      return [];
    }
  }

  private save(state: OpenSavedState): void {
    fs.mkdirSync(this.homesDirectory, { recursive: true });
    fs.writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  /** Stop the partition processes and drop the partition of the open state. */
  async closeCurrent(): Promise<void> {
    const current = this.current();
    await this.services?.stop();
    this.services = undefined;
    if (current.partition && this.leasedParts) {
      for (const part of this.leasedParts.parts) {
        const container = this.leasedParts.containers[part.id];
        if (container) await part.dropPartition(container, current.partition);
      }
    }
    if (this.leasedParts) {
      await releaseLocalServices(this.holder);
      this.leasedParts = undefined;
    }
  }

  async open(origin: SavedStateOrigin, serviceTarget: ServiceTarget): Promise<OpenSavedState> {
    await this.closeCurrent();
    if (origin.kind === 'normal') {
      const state = this.normalState();
      this.save(state);
      return state;
    }
    if (origin.kind === 'empty' && serviceTarget === 'local') {
      throw new SavedStateRefusal('A fresh install has no home to wire to local services; open the Empty Home with Hosted Development.');
    }

    const code = currentCode(this.options.projectRoot);
    const label = origin.kind === 'empty' ? 'Empty Home'
      : origin.kind === 'fixture' ? homeFixtureDisplayName(origin.fixture)
      : `Checkpoint ${origin.checkpoint}`;
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${slug(label)}`;
    const root = path.join(this.homesDirectory, 'homes', id);
    const homeDirectory = path.join(root, 'home');
    const logsDirectory = path.join(root, 'logs');
    fs.mkdirSync(logsDirectory, { recursive: true });
    const partition = serviceTarget === 'local' ? `dev-${id}` : undefined;
    const state: OpenSavedState = {
      id, origin, label, homeDirectory, logsDirectory, serviceTarget, partition,
      openedAt: new Date().toISOString(), currentCode: code,
      serviceEnvironment: { MEADOW_LOG_DIRECTORY_OVERRIDE: logsDirectory },
    };

    if (serviceTarget === 'local') {
      this.leasedParts = await acquireLocalServices(this.holder);
      state.localServiceParts = this.leasedParts.parts.map(part => part.displayName);
    }

    let preferredPorts: Record<string, number> = {};
    if (origin.kind === 'fixture' || origin.kind === 'empty') {
      openHomeFixture({
        projectRoot: this.options.projectRoot,
        fixtureName: origin.kind === 'empty' ? EMPTY_HOME : origin.fixture,
        homeDirectory,
      });
      if (origin.kind === 'fixture') this.writeLocalResources(homeDirectory, logsDirectory);
    } else {
      const option = checkpointOptions(origin.runId, origin.scenario).find(candidate => candidate.index === origin.checkpoint);
      if (!option) throw new SavedStateRefusal(`Checkpoint ${origin.checkpoint} not found`);
      if (!option.openable) throw new SavedStateRefusal(option.unavailableReason);
      if (serviceTarget === 'hosted' && !option.hostedAvailable) throw new SavedStateRefusal(option.hostedUnavailableReason);
      await restoreCheckpoint({
        repo: checkpointRepository(origin.runId, origin.scenario),
        index: origin.checkpoint,
        homeDirectory,
        // A hosted fork restores only the home; it held no service state.
        parts: this.leasedParts?.parts ?? [],
        containers: this.leasedParts?.containers ?? {},
        partition: partition ?? 'hosted',
        restoreParts: serviceTarget === 'local',
      });
      this.writeLocalResources(homeDirectory, logsDirectory);
      preferredPorts = option.metadata.ports;
      state.label = `${option.metadata.scenario} — ${option.message}`;
      state.checkpoint = {
        message: option.message,
        scenarioTitle: option.metadata.scenario,
        reportUrl: option.reportUrl,
        runCodeRevision: option.metadata.codeRevision,
        runUncommittedCode: option.metadata.uncommittedCode,
      };
      if (option.upgradeFromFormat !== undefined && option.metadata.home.formatVersion !== null) {
        const { CURRENT_MEADOW_HOME_FORMAT_VERSION } = await import('../../../../shared_code/utils/meadowHomeFormat.js');
        state.formatUpgrade = { from: option.metadata.home.formatVersion, to: CURRENT_MEADOW_HOME_FORMAT_VERSION };
      }
    }

    if (serviceTarget === 'local' && this.leasedParts && partition) {
      for (const part of this.leasedParts.parts) {
        // Restored parts already hold their captured state.
        if (origin.kind === 'checkpoint') continue;
        await part.preparePartition(this.leasedParts.containers[part.id], partition);
      }
      this.services = await startPartitionServices({
        partition,
        containers: this.leasedParts.containers,
        homeDirectory,
        logsDirectory,
        activateProviders: origin.kind !== 'checkpoint',
        preferredPorts,
      });
      Object.assign(state.serviceEnvironment, this.services.environment);
      state.localServicePorts = this.services.ports;
      state.localServiceContainers = Object.fromEntries(
        Object.entries(this.leasedParts.containers).map(([id, container]) => [id, container.containerName]),
      );
    }
    this.save(state);
    return state;
  }

  /**
   * After a Dev Tools restart, restart the open Local state's processes. If
   * its containers were replaced, its partition is gone: fall back to Normal
   * and say why rather than presenting a half-restored state.
   */
  async resume(): Promise<void> {
    const current = this.current();
    if (current.serviceTarget !== 'local' || !current.partition) return;
    const leased = await acquireLocalServices(this.holder);
    const sameContainers = Object.entries(current.localServiceContainers ?? {})
      .every(([id, name]) => leased.containers[id]?.containerName === name);
    if (!sameContainers) {
      await releaseLocalServices(this.holder);
      this.save({ ...this.normalState(), notice: `Local services restarted, so "${current.label}" could not be resumed. Open it again.` });
      return;
    }
    this.leasedParts = leased;
    this.services = await startPartitionServices({
      partition: current.partition,
      containers: leased.containers,
      homeDirectory: current.homeDirectory,
      logsDirectory: current.logsDirectory,
      activateProviders: false,
      preferredPorts: current.localServicePorts ?? {},
    });
    this.save({ ...current, serviceEnvironment: { ...current.serviceEnvironment, ...this.services.environment }, localServicePorts: this.services.ports });
  }

  private writeLocalResources(homeDirectory: string, logsDirectory: string): void {
    ensureResourcesConfigInitialized(homeDirectory);
    saveResourcesLocalConfig({ logDirectory: logsDirectory }, homeDirectory);
  }

  /** Local partition processes die with Dev Tools; its lease is released too. */
  async shutdown(): Promise<void> {
    await this.services?.stop();
    this.services = undefined;
    if (this.leasedParts) await releaseLocalServices(this.holder);
  }

  async localServicesMounted(): Promise<string[]> {
    return (await loadLocalServices()).parts.map(part => part.displayName);
  }
}

export type DevToolsSavedStateMeadowConceptParticipations = [
  ParticipatesIn<typeof savedState, "open-for-qa", typeof SavedStateSession>,
];
