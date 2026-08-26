/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import { AppConfigPaths } from '../../../../../shared_code/paths/appConfigPaths.js';
import bundleConfigRoutes from '../../areas/bundle/curation/routes/bundleConfigRoutes.js';
import customFiltersRoutes from '../../areas/bundle/curation/routes/customFiltersRoutes.js';
import bundleCurationRoutes from '../../areas/bundle/curation/routes/bundleCurationRoutes.js';
import bundleOperationRoutes from '../../areas/bundle/curation/routes/bundleOperationRoutes.js';
import hooksRoutes from '../../areas/bundle/generation/routes/hooksRoutes.js';
import customAssetsRoutes from '../../areas/bundle/generation/routes/customAssetsRoutes.js';
import appConfigRoutes from '../routes/appConfigRoutes.js';
import { createLocalSaveRoutes } from '../../areas/bundle/sharing/routes/localSaveRoutes.js';
import { buildFilteredSourcesExportForBundle } from '../../areas/bundle/generation/sources-export/filteredSourcesExport.js';
import { buildFilteredOpenKnowledgeFormatForBundle } from '../../areas/bundle/generation/open-knowledge-format/filteredOpenKnowledgeFormat.js';
import bundleListingRoutes from '../../areas/bundles/routes/bundleListingRoutes.js';
import bundleGenerationRoutes from '../../areas/bundle/generation/routes/bundleGenerationRoutes.js';
import stylePresetsRoutes from '../../areas/bundle/generation/routes/stylePresetsRoutes.js';
import logRoutes from '../routes/logRoutes.js';
import appConfigFileRoutes from '../routes/appConfigFileRoutes.js';
import providerDiscoveryRoutes from '../../areas/bundle/sharing/routes/providerDiscoveryRoutes.js';
import publishingCliRoutes from '../../areas/bundle/sharing/routes/publishingCliRoutes.js';
import { createHealthRoutes } from '../routes/healthRoutes.js';
import reviewRoutes from '../../areas/bundle/review/routes/reviewRoutes.js';
import { getConfigDirectory } from '../bundle-config/bundleConfigPaths.js';
import { ResourcesConfig } from '../../../../../contracts/types/resourcesConfig.js';
import {
  ensureAllProviderResourcesInitialized,
  registerAllProviderRoutes,
} from '../publishing-provider-host/providerRegistry.js';
import {
  ensureAppConfigInitialized,
  loadAppConfig as loadAppConfigFromDisk,
  appConfigFileExists,
  getDefaultConfigDirectory,
} from '../../../../../shared_code/utils/appConfigUtils.js';
import { ensureDefaultGlobalFiltersInitialized } from '../../../../../shared_code/utils/defaultGlobalFiltersUtils.js';
import { getGlobalCustomFiltersPath } from '../../../../../shared_code/utils/globalCustomFiltersUtils.js';
import { loadResourcesConfig, ensureResourcesConfigInitialized } from '../../../../../shared_code/utils/resourcesConfigUtils.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../shared_code/utils/appConfigGitUtils.js';
// import { startIntermittentAutoCommit } from '../utils/configDirectory/gitUtils/intermittentAutoCommit.js';
import { logger, setLogDirectoryOverride } from '../utils/logging/backendLoggingUtils.js';
import { startLogMaintenance, stopLogMaintenance } from '../utils/logging/logfiles/logMaintenanceService.js';
import {
  createControlPlaneSecurity,
  MEADOW_CONTROL_PROTOCOL,
} from './controlPlaneSecurity.js';
import { preflightMeadowHome } from '../../../../../shared_code/utils/meadowHomeFormat.js';
import { getPlatformPaths } from '../../../../../shared_code/paths/getPlatformPaths.js';
import {
  describeStartupFailure,
  writeStartupFailureDiagnostic,
} from '../../../../../shared_code/utils/startupRecovery.js';
import { createRuntimeOperationLeaseMiddleware } from './runtimeOperationLease.js';
import type {
  ParticipatesIn,
  runtimeService,
} from '../../../../../concepts/index.js';

// Configure dotenv to load environment variables
dotenv.config();

// Helper function to load resources config
const loadResources = (): ResourcesConfig => loadResourcesConfig(getConfigDirectory());

// Note: config directory helpers are imported from `shared/bundle-config/bundleConfigPaths.ts`

import { runMigrationsOnStartup } from '../migrations/runner.js';

const app = express();

// Port is set from resources config in startServer() after config is loaded.
let port: number = 0;
const platformPaths = getPlatformPaths();
let selectedHomePath = platformPaths.defaultConfigDirectory;

const launchCapability = process.env.MEADOW_API_CAPABILITY;
const allowedUiOrigin = process.env.MEADOW_UI_ORIGIN;
if (!launchCapability || !allowedUiOrigin) {
  throw new Error('MEADOW_API_CAPABILITY and MEADOW_UI_ORIGIN are required');
}
// Keep the resolved launch contract available to legacy internal consumers
// and subprocesses while the runtime-session descriptor becomes canonical.
process.env.MEADOW_API_CAPABILITY = launchCapability;
process.env.MEADOW_UI_ORIGIN = allowedUiOrigin;

// Health is the sole unauthenticated route and intentionally exposes no port,
// path, version, timing, or process information.
app.use('/api', createHealthRoutes(MEADOW_CONTROL_PROTOCOL));
app.use('/api', createControlPlaneSecurity({
  capability: launchCapability,
  allowedOrigin: allowedUiOrigin,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api', createRuntimeOperationLeaseMiddleware({
  controlUrl: process.env.MEADOW_RUNTIME_CONTROL_URL,
  capability: launchCapability,
}));



// Use graph config routes
app.use('/api', bundleConfigRoutes);
app.use('/api', customFiltersRoutes);
app.use('/api', bundleCurationRoutes);
app.use('/api', bundleOperationRoutes);
app.use('/api', hooksRoutes);
app.use('/api', customAssetsRoutes);
app.use('/api', appConfigRoutes);
app.use('/api', createLocalSaveRoutes({
  buildRawSourcesExportForBundle: buildFilteredSourcesExportForBundle,
  buildOpenKnowledgeFormatForBundle: buildFilteredOpenKnowledgeFormatForBundle,
}));
app.use('/api', logRoutes);
app.use('/api', appConfigFileRoutes);
app.use('/api', providerDiscoveryRoutes);
app.use('/api', publishingCliRoutes);
app.use('/api', bundleListingRoutes);
app.use('/api', bundleGenerationRoutes);
app.use('/api', reviewRoutes);
app.use('/api', stylePresetsRoutes);

// Mounts each registered provider's routes under
// /api/sharing/publishing-providers/<providerId>/...
registerAllProviderRoutes(app);

// Centralized error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error:", err.stack || err.message);
  if (res.headersSent) {
    logger.error("Headers already sent, cannot send error response for:", req.path);
    return; 
  }
  res.status(500).json({ error: 'Internal Server Error' });
});

export async function startRuntimeService(): Promise<void> {
  const appVersion = process.env.MEADOW_APP_VERSION ?? '';
  const isDev = process.env.MEADOW_IS_DEV === 'true';
  // Path resolution only reads the strict bootstrap file. The format preflight
  // is deliberately the first operation allowed to mutate the selected Home.
  const configDir = getDefaultConfigDirectory();
  selectedHomePath = configDir;
  preflightMeadowHome(configDir, appVersion);

  // Log app lifecycle startup only after the Home writer boundary passes.
  const buildType = isDev ? 'development' : 'production';
  logger.info(`[lifecycle] Meadow v${appVersion} starting (${buildType} build)`);

  // Ensure the config-dir git repo (and its .gitignore) exists BEFORE anything
  // commits. Migrations' pre-migration commit used to auto-init the repo on
  // demand via commitChangesNative, which did NOT create a .gitignore — so
  // per-instance files like app/resources.local.yaml and
  // app/secret_app_config.yaml were getting tracked in the initial commit and
  // then flagged as modified forever after. Calling initRepo() here is
  // idempotent (no-op when a repo already exists) and writes the .gitignore
  // on first init so those files are excluded from the very first commit.
  const startupGit = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
  const gitInitialized = await startupGit.initRepo();
  if (gitInitialized) {
    // A format-current Home can have no migrations or default patches to
    // trigger a later commit. Capture its initial state immediately so the
    // repository is clean on the very first public-format launch as well.
    await startupGit.commitDirs(['.'], 'initial Meadow Home snapshot');
  }

  await runMigrationsOnStartup();
  // Ensure app/app_config.yaml exists and contains defaults for new settings.
  // Commit any changes (either newly created OR patched with new defaults)
  // so git history reflects the real config state.
  const appConfigExistedBefore = appConfigFileExists(configDir);
  const { wasPatched: appConfigWasPatched } = ensureAppConfigInitialized(configDir, isDev);

  if (appConfigWasPatched && appConfigFileExists(configDir)) {
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
    const message = appConfigExistedBefore
      ? 'patch app config with new defaults'
      : 'initial app config';
    await gitUtils.addAndCommit(AppConfigPaths.relative.appConfigFile(), message);
  }

  // Ensure default global filters are seeded (e.g., daily notes sensitive filter).
  // Commit any changes so the backend-created file doesn't linger as an
  // uncommitted-new entry in git from tick 1 onward.
  const globalFiltersPath = getGlobalCustomFiltersPath(configDir);
  const globalFiltersExistedBefore = fs.existsSync(globalFiltersPath);
  const { wasPatched: globalFiltersWasPatched } = ensureDefaultGlobalFiltersInitialized(configDir);

  if (globalFiltersWasPatched && fs.existsSync(globalFiltersPath)) {
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
    const message = globalFiltersExistedBefore
      ? 'patch global custom filters with new defaults'
      : 'initial global custom filters';
    await gitUtils.addAndCommit('app/global_custom_filters.json', message);
  }

  // Ensure resources config exists and contains defaults
  const resourcesFilePath = AppConfigPaths.getResourcesFile(configDir);
  const resourcesExistedBefore = fs.existsSync(resourcesFilePath);
  const { wasPatched: resourcesWasPatched } = ensureResourcesConfigInitialized(configDir);

  if (resourcesWasPatched && fs.existsSync(resourcesFilePath)) {
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
    const message = resourcesExistedBefore
      ? 'patch resources config with new defaults'
      : 'initial resources config';
    await gitUtils.addAndCommit(AppConfigPaths.relative.resourcesFile(), message);
  }

  // Let each publishing provider seed its own pp_resources.yaml (DNS names,
  // buckets, etc.) so provider-specific infra doesn't leak into core.
  ensureAllProviderResourcesInitialized(configDir, isDev);

  // Apply log directory override if configured in resources
  const resourcesConfig = loadResources();
  if (resourcesConfig.logDirectory) {
    setLogDirectoryOverride(resourcesConfig.logDirectory);
  }

  // The launch contract provides one random loopback port, whether it was
  // created by Electron, the dev stack, or the E2E harness.
  const launchPort = Number.parseInt(
    process.env.MEADOW_BACKEND_PORT ?? '',
    10,
  );
  if (Number.isInteger(launchPort) && launchPort > 0 && launchPort <= 65535) {
    port = launchPort;
    process.env.MEADOW_BACKEND_PORT = String(port);
  } else {
    throw new Error('A local runtime backend port is required');
  }

  // Apply log level override if configured
  const appConfig = loadAppConfigFromDisk(getConfigDirectory());
  if (appConfig.logLevelOverride) {
    logger.setLevel(appConfig.logLevelOverride);
    logger.info(`[lifecycle] Log level overridden to '${appConfig.logLevelOverride}'`);
  }

  // Start log rotation and cleanup service
  startLogMaintenance(getConfigDirectory());
  // Start the intermittent auto-commit background task
  // startIntermittentAutoCommit();
  app.listen(port, '127.0.0.1', () => {
    logger.info(`Server running on IPv4 loopback port ${port}`);
  });
}

startRuntimeService().catch((error) => {
  const diagnosticPath = process.env.MEADOW_STARTUP_DIAGNOSTIC_PATH;
  const diagnostic = describeStartupFailure(error, {
    selectedHomePath,
    bootstrapPath: platformPaths.bootstrapConfigPath,
    appVersion: process.env.MEADOW_APP_VERSION ?? 'unknown',
  });
  logger.error(`[startup] ${diagnostic.category}: ${diagnostic.title}`);
  if (diagnosticPath) {
    try {
      writeStartupFailureDiagnostic(diagnosticPath, diagnostic);
    } catch {
      logger.error('Failed to write startup recovery diagnostic');
    }
  }
  process.exit(1);
});

// Graceful shutdown handling
function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  stopLogMaintenance();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export type RuntimeServiceMeadowConceptParticipations = [
  ParticipatesIn<typeof runtimeService, 'start-service', typeof startRuntimeService>,
  ParticipatesIn<typeof runtimeService, 'mutate-home', typeof startRuntimeService>,
];
