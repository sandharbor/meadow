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

import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { FindInSitesOptions } from '../../shared_code/types/findInSitesOptions';
import { ensureResourcesConfigInitialized, loadResourcesConfig } from '../../shared_code/utils/resourcesConfigUtils';
import { getDefaultConfigDirectory } from '../../shared_code/utils/appConfigUtils';
import { resolveNativeRustBinaryPathFromNativeUtilsParent } from '../../shared_code/utils/nativeRustBinaryPath';
import { UpdateManager } from './updateManager';

// Set the app name immediately, before any other operations (important for macOS menu bar)
app.name = 'Meadow';

// Set About panel options for macOS "About Meadow" dialog
// Note: We call this again in app.whenReady() to use app.getVersion() which isn't available until then
app.setAboutPanelOptions({
  applicationName: 'Meadow',
  copyright: 'Meadow',
});

// Test mode configuration
const isTestMode = process.argv.includes('--test-mode');
const testLogFile = process.argv.includes('--log-file') 
  ? process.argv[process.argv.indexOf('--log-file') + 1] 
  : path.join(process.cwd(), 'meadow-test.log');

// Enhanced logging function
function log(level: 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  const fullLogEntry = data ? `${logEntry} ${JSON.stringify(data)}` : logEntry;
  
  console.log(fullLogEntry);
  
  if (isTestMode) {
    try {
      fs.appendFileSync(testLogFile, fullLogEntry + '\n');
    } catch (error) {
      console.error('Failed to write to test log file:', error);
    }
  }
}

class MeadowApp {
  private mainWindow: BrowserWindow | null = null;
  private backendProcess: ChildProcess | null = null;
  private frontendProcess: ChildProcess | null = null;
  private sourcePageSearchByTitlePath: string = '';
  private fastGitOpsPath: string = '';
  private workingGraphPath: string = '';
  private nodePath: string = '';
  private backendPort: number = 0;
  private frontendPort: number = 0;
  private isDev: boolean = !app.isPackaged;
  private findInSitesOptions: FindInSitesOptions | null = null;
  private updateManager: UpdateManager;

  constructor() {
    log('INFO', 'Initializing MeadowApp', { 
      isDev: this.isDev, 
      isTestMode, 
      testLogFile,
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion()
    });
    
    // Parse command line arguments for find in sites options
    this.parseFindInSitesArgs();
    
    if (isTestMode) {
      // Clear previous test log
      try {
        fs.writeFileSync(testLogFile, `=== Meadow Test Log Started at ${new Date().toISOString()} ===\n`);
      } catch (error) {
        console.error('Failed to initialize test log file:', error);
      }
    }
    
    this.setupPaths();
    this.setupAppEvents();
    this.setupIpcHandlers();
    this.updateManager = new UpdateManager(this.isDev, () => this.mainWindow);
    log('SUCCESS', 'MeadowApp initialization completed');
  }
  
  private parseFindInSitesArgs(): void {
    const args = process.argv;
    log('INFO', 'Parsing command line arguments', { args });
    
    const vaultPathIndex = args.indexOf('--vault-path');
    const folderPathIndex = args.indexOf('--folder-path');
    const pageNameIndex = args.indexOf('--page-name');

    if (vaultPathIndex !== -1 && folderPathIndex !== -1 && pageNameIndex !== -1) {
      this.findInSitesOptions = {
        vaultPath: args[vaultPathIndex + 1],
        folderPath: args[folderPathIndex + 1],
        pageName: args[pageNameIndex + 1]
      };
      log('SUCCESS', 'Find in sites options parsed from CLI', this.findInSitesOptions);
    } else {
      log('INFO', 'No find in sites arguments found, running in normal mode');
    }
  }

  private setupPaths(): void {
    log('INFO', 'Setting up application paths');
    
    if (this.isDev) {
      // Development paths (release preferred, debug fallback — same as backend)
      const nativeUtilsParentDir = path.join(__dirname, '../..');
      this.sourcePageSearchByTitlePath = resolveNativeRustBinaryPathFromNativeUtilsParent({
        nativeUtilsParentDir,
        cratePathSegments: ['source_page_search_by_title', 'source_page_search_by_title_code'],
        binaryName: 'source_page_search_by_title_bin',
      });
      this.fastGitOpsPath = resolveNativeRustBinaryPathFromNativeUtilsParent({
        nativeUtilsParentDir,
        cratePathSegments: ['fast_git_ops', 'fast_git_ops_code'],
        binaryName: 'fast_git_ops_bin',
      });
      this.workingGraphPath = resolveNativeRustBinaryPathFromNativeUtilsParent({
        nativeUtilsParentDir,
        cratePathSegments: ['working_graph', 'working_graph_code'],
        binaryName: 'working_graph_bin',
      });
      this.nodePath = 'node';
      log('INFO', 'Using development paths', { sourcePageSearchByTitlePath: this.sourcePageSearchByTitlePath, fastGitOpsPath: this.fastGitOpsPath, workingGraphPath: this.workingGraphPath, nodePath: this.nodePath });
    } else {
      // Production paths
      const resourcesPath = (process as any).resourcesPath;
      this.sourcePageSearchByTitlePath = path.join(resourcesPath, 'source_page_search_by_title', 'source_page_search_by_title_bin');
      this.fastGitOpsPath = path.join(resourcesPath, 'fast_git_ops', 'fast_git_ops_bin');
      this.workingGraphPath = path.join(resourcesPath, 'working_graph', 'working_graph_bin');
      
      // Use wrapper script for Node.js to handle execution from mounted DMG
      if (process.platform === 'darwin') {
        this.nodePath = path.join(resourcesPath, 'node-wrapper.sh');
      } else {
        this.nodePath = path.join(resourcesPath, 'node');
      }
      
      log('INFO', 'Using production paths', { 
        resourcesPath, 
        sourcePageSearchByTitlePath: this.sourcePageSearchByTitlePath,
        fastGitOpsPath: this.fastGitOpsPath,
        workingGraphPath: this.workingGraphPath,
        nodePath: this.nodePath 
      });
      
      // Verify paths exist
      const sourcePageSearchByTitleExists = fs.existsSync(this.sourcePageSearchByTitlePath);
      const fastGitOpsExists = fs.existsSync(this.fastGitOpsPath);
      const workingGraphExists = fs.existsSync(this.workingGraphPath);
      const nodeExists = fs.existsSync(this.nodePath);
      
      log('INFO', 'Path verification', { 
        sourcePageSearchByTitleExists,
        fastGitOpsExists,
        workingGraphExists,
        nodeExists,
        sourcePageSearchByTitlePath: this.sourcePageSearchByTitlePath,
        fastGitOpsPath: this.fastGitOpsPath,
        workingGraphPath: this.workingGraphPath,
        nodePath: this.nodePath
      });
      
      if (!sourcePageSearchByTitleExists || !fastGitOpsExists || !workingGraphExists || !nodeExists) {
        log('ERROR', 'Critical path verification failed', {
          sourcePageSearchByTitleExists,
          fastGitOpsExists,
          workingGraphExists,
          nodeExists,
          sourcePageSearchByTitlePath: this.sourcePageSearchByTitlePath,
          fastGitOpsPath: this.fastGitOpsPath,
          workingGraphPath: this.workingGraphPath,
          nodePath: this.nodePath
        });
      }
    }
  }

  private setupAppEvents(): void {
    log('INFO', 'Setting up application events');
    
    app.whenReady().then(async () => {
      log('SUCCESS', 'Electron app is ready');

      // Set version in About panel now that app.getVersion() is available
      app.setAboutPanelOptions({
        applicationName: 'Meadow',
        applicationVersion: app.getVersion(),
        copyright: 'Meadow',
      });

      this.setupMenu();
      await this.allocatePorts();
      this.createWindow();
      this.startBackendServer();
      this.startFrontendServer();
      
      // Wait for servers to be ready before loading frontend
      try {
        await this.loadFrontend();
      } catch (error) {
        log('ERROR', 'Failed to load frontend', { error: (error as Error).message });
        // Show error dialog to user
        dialog.showErrorBox(
          'Startup Error',
          `Failed to load the frontend: ${(error as Error).message}`
        );
        return;
      }

      // Start auto-update check timer (skip in dev mode)
      this.updateManager.startAutoCheckTimer();

      app.on('activate', () => {
        log('INFO', 'App activated');
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow();
        }
      });
      
      // In test mode, perform health check after startup
      if (isTestMode) {
        setTimeout(async () => {
          log('INFO', 'Starting post-startup health check (test mode)');
          const isHealthy = await this.performHealthCheck();
          if (isHealthy) {
            log('SUCCESS', '=== APPLICATION STARTUP COMPLETE - ALL SYSTEMS HEALTHY ===');
            // Write completion marker to log file
            try {
              fs.appendFileSync(testLogFile, '=== STARTUP_COMPLETE ===\n');
            } catch (error) {
              console.error('Failed to write startup completion marker:', error);
            }
          } else {
            log('ERROR', '=== APPLICATION STARTUP FAILED - HEALTH CHECKS FAILED ===');
            try {
              fs.appendFileSync(testLogFile, '=== STARTUP_FAILED ===\n');
            } catch (error) {
              console.error('Failed to write startup failure marker:', error);
            }
          }
        }, 5000); // Wait 5 seconds for servers to fully start
      }
    });

    app.on('window-all-closed', () => {
      log('INFO', 'All windows closed, cleaning up');
      this.cleanup();
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('before-quit', () => {
      log('INFO', 'App about to quit, cleaning up');
      this.cleanup();
    });
  }

  private async allocatePorts(): Promise<void> {
    const configDir = getDefaultConfigDirectory();
    ensureResourcesConfigInitialized(configDir);
    const resources = loadResourcesConfig(configDir);

    if (!resources.backendPort || !resources.frontendPort) {
      throw new Error(
        `backendPort and frontendPort must be set in resources config at ${configDir}. ` +
        `Delete resources.local.yaml to fall back to resources.yaml defaults, or set ports explicitly.`
      );
    }

    this.backendPort = resources.backendPort;
    this.frontendPort = resources.frontendPort;
    log('SUCCESS', 'Ports read from resources config', { backendPort: this.backendPort, frontendPort: this.frontendPort });
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('get-fast-git-ops-path', () => {
      return this.fastGitOpsPath;
    });

    ipcMain.handle('get-backend-port', () => {
      return this.backendPort;
    });

    ipcMain.handle('get-frontend-port', () => {
      return this.frontendPort;
    });

    ipcMain.handle('get-target-page-info', () => {
      return this.findInSitesOptions;
    });

    ipcMain.handle('show-open-dialog', async (event: any, options: any) => {
      const result = await dialog.showOpenDialog(this.mainWindow!, options);
      return result;
    });

    ipcMain.handle('show-save-dialog', async (event: any, options: any) => {
      const result = await dialog.showSaveDialog(this.mainWindow!, options);
      return result;
    });

    ipcMain.handle('check-for-update', async () => {
      await this.updateManager.checkForUpdate();
    });

    ipcMain.handle('download-update', async () => {
      await this.updateManager.downloadUpdate();
    });

    ipcMain.handle('install-update', async () => {
      await this.updateManager.installUpdate();
    });

    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('get-update-state', () => {
      return this.updateManager.getState();
    });

    ipcMain.handle('open-external', async (event: any, url: string) => {
      await shell.openExternal(url);
    });

    ipcMain.handle('open-path', async (event: any, itemPath: string) => {
      return shell.openPath(itemPath);
    });
  }

  private setupMenu(): void {
    if (process.platform === 'darwin') {
      const checkForUpdatesItems = this.updateManager.isConfigured()
        ? [
            {
              label: 'Check for Updates...',
              click: () => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                  this.mainWindow.webContents.send('open-update-modal');
                  this.updateManager.checkForUpdate();
                }
              }
            },
          ]
        : [];

      const template = [
        {
          label: app.getName(),
          submenu: [
            { role: 'about' },
            ...checkForUpdatesItems,
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        {
          label: 'File',
          submenu: [
            { role: 'close' }
          ]
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectall' }
          ]
        },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
          ]
        },
        {
          label: 'Window',
          submenu: [
            { role: 'minimize' },
            { role: 'close' }
          ]
        }
      ];

      const menu = Menu.buildFromTemplate(template as any);
      Menu.setApplicationMenu(menu);
    }
  }

  private createWindow(): void {
    log('INFO', 'Creating main application window');
    
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Meadow',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        preload: path.join(__dirname, 'preload.js')
      },
      frame: false,
      titleBarStyle: 'hidden',
      show: false
    });

    log('SUCCESS', 'Main window created');

    // Don't load frontend immediately - wait for it to be ready
    if (this.isDev) {
      // In development, load from Vite dev server
      log('INFO', `Will load frontend from Vite dev server (http://localhost:${this.frontendPort}) when ready`);
    } else {
      // In production, load from the embedded frontend server when ready
      const frontendUrl = `http://localhost:${this.frontendPort}`;
      log('INFO', 'Will load frontend from embedded server when ready', { frontendUrl });
    }

    this.mainWindow.once('ready-to-show', () => {
      log('SUCCESS', 'Main window is ready to show');
      this.mainWindow?.show();
    });

    this.mainWindow.on('closed', () => {
      log('INFO', 'Main window closed');
      this.mainWindow = null;
    });
  }

  private async waitForBackendServer(): Promise<void> {
    // Give the backend process a moment to start listening
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 500; // 500ms
    let attempts = 0;
    const maxAttempts = maxWaitTime / checkInterval;

    log('INFO', 'Waiting for backend server to be ready...');

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`http://localhost:${this.backendPort}/api/health`);
        if (response.ok) {
          log('SUCCESS', 'Backend server is ready!');
          return;
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }

      attempts++;
      if (attempts % 10 === 0) { // Log every 5 seconds
        log('INFO', `Still waiting for backend server... (${attempts * checkInterval / 1000}s elapsed)`);
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    log('ERROR', 'Backend server failed to start within timeout period');
    throw new Error('Backend server startup timeout');
  }

  private async waitForFrontendServer(): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 500; // 500ms
    let attempts = 0;
    const maxAttempts = maxWaitTime / checkInterval;
    // In dev mode, Vite serves at root; in production, check /api/health
    const checkUrl = this.isDev
      ? `http://localhost:${this.frontendPort}/`
      : `http://localhost:${this.frontendPort}/api/health`;

    log('INFO', 'Waiting for frontend server to be ready...', { checkUrl });

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(checkUrl);
        if (response.ok) {
          log('SUCCESS', 'Frontend server is ready!');
          return;
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }

      attempts++;
      if (attempts % 10 === 0) { // Log every 5 seconds
        log('INFO', `Still waiting for frontend server... (${attempts * checkInterval / 1000}s elapsed)`);
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    log('ERROR', 'Frontend server failed to start within timeout period');
    throw new Error('Frontend server startup timeout');
  }

  private async loadFrontend(): Promise<void> {
    // Wait for backend server to be ready in both dev and production
    await this.waitForBackendServer();
    
    // Wait for frontend server (Vite in dev, embedded server in production)
    await this.waitForFrontendServer();
    
    if (!this.mainWindow) {
      log('ERROR', 'Main window is null, cannot load frontend');
      return;
    }

    // Load the frontend
    if (this.isDev) {
      // In development, load from Vite dev server
      log('INFO', `Loading frontend from Vite dev server (http://localhost:${this.frontendPort})`);
      this.mainWindow.loadURL(`http://localhost:${this.frontendPort}`);
      // this.mainWindow.webContents.openDevTools();
    } else {
      // In production, load from the embedded frontend server
      const frontendUrl = `http://localhost:${this.frontendPort}`;
      log('INFO', 'Loading frontend from embedded server', { frontendUrl });
      this.mainWindow.loadURL(frontendUrl);
    }
  }

  private startBackendServer(): void {
    log('INFO', 'Starting backend server');
    
    try {
      let backendScript: string;
      let cwd: string;

      if (this.isDev) {
        // Development: run the backend from source
        // In dev mode, __dirname is electron_app/dist/electron_app/src
        // We need to go up to the project root and then into backend
        backendScript = 'src/index.ts';
        cwd = path.join(__dirname, '../../../../backend');
        const tsxPath = path.join(cwd, 'node_modules', '.bin', 'tsx');
        log('INFO', 'Starting backend in development mode', { backendScript, cwd, tsxPath });
        
        this.backendProcess = spawn(tsxPath, [backendScript], {
          cwd,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            MEADOW_APP_VERSION: app.getVersion(),
            MEADOW_IS_DEV: 'true'
          },
          stdio: 'pipe'
        });
      } else {
        // Production: run the built backend with embedded Node.js
        backendScript = 'src/index.js';
        cwd = path.join((process as any).resourcesPath, 'backend');
        log('INFO', 'Starting backend in production mode', { backendScript, cwd, nodePath: this.nodePath });
        
        this.backendProcess = spawn(this.nodePath, [backendScript], {
          cwd,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            SOURCE_PAGE_SEARCH_BY_TITLE_PATH: this.sourcePageSearchByTitlePath,
            FAST_GIT_OPS_PATH: this.fastGitOpsPath,
            WORKING_GRAPH_PATH: this.workingGraphPath,
            MEADOW_EXAMPLE_SITE_PATH: path.join((process as any).resourcesPath, 'example_site'),
            MEADOW_APP_VERSION: app.getVersion(),
            MEADOW_IS_DEV: 'false'
          },
          stdio: 'pipe'
        });
      }

      this.backendProcess.stdout?.on('data', (data) => {
        const message = data.toString().trim();
        log('INFO', 'Backend stdout', { message });
        console.log(`Backend: ${data}`);
      });

      this.backendProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        log('ERROR', 'Backend stderr', { message });
        console.error(`Backend Error: ${data}`);
      });

      this.backendProcess.on('close', (code) => {
        log('WARN', 'Backend process exited', { code });
        console.log(`Backend process exited with code ${code}`);
      });

      this.backendProcess.on('error', (error) => {
        log('ERROR', 'Failed to start backend', { error: error.message, stack: error.stack });
        console.error('Failed to start backend:', error);
        dialog.showErrorBox(
          'Backend Error', 
          `Failed to start the backend server: ${error.message}`
        );
      });

      log('SUCCESS', 'Backend server startup initiated', { 
        port: this.backendPort, 
        pid: this.backendProcess?.pid 
      });

    } catch (error) {
      log('ERROR', 'Error starting backend', { error: (error as Error).message, stack: (error as Error).stack });
      console.error('Error starting backend:', error);
      dialog.showErrorBox(
        'Startup Error', 
        `Failed to initialize the backend: ${error}`
      );
    }
  }

  private startFrontendServer(): void {
    log('INFO', 'Starting frontend server');

    try {
      if (this.isDev) {
        // Development: start Vite dev server for the frontend
        const cwd = path.join(__dirname, '../../../../frontend');
        const vitePath = path.join(cwd, 'node_modules', '.bin', 'vite');
        log('INFO', 'Starting Vite dev server for frontend', { cwd, vitePath, frontendPort: this.frontendPort, backendPort: this.backendPort });

        this.frontendProcess = spawn(vitePath, [], {
          cwd,
          env: {
            ...process.env,
            VITE_FRONTEND_PORT: this.frontendPort.toString(),
            VITE_BACKEND_PORT: this.backendPort.toString(),
          },
          stdio: 'pipe'
        });
      } else {
        const frontendScript = 'server.js';
        const cwd = path.join((process as any).resourcesPath, 'frontend');

        log('INFO', 'Starting frontend in production mode', { frontendScript, cwd, nodePath: this.nodePath });

        this.frontendProcess = spawn(this.nodePath, [frontendScript], {
          cwd,
          env: { ...process.env, NODE_ENV: 'production', PORT: this.frontendPort.toString(), BACKEND_PORT: this.backendPort.toString() },
          stdio: 'pipe'
        });
      }

      this.frontendProcess.stdout?.on('data', (data) => {
        const message = data.toString().trim();
        log('INFO', 'Frontend stdout', { message });
        console.log(`Frontend: ${data}`);
      });

      this.frontendProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        log('ERROR', 'Frontend stderr', { message });
        console.error(`Frontend Error: ${data}`);
        
        // Detect critical frontend errors
        if (message.includes('Frontend build not found')) {
          log('ERROR', 'Critical frontend error detected - build files missing', { message });
          // Show error dialog to user
          dialog.showErrorBox(
            'Frontend Build Error',
            'The frontend build files were not found. The application may not have been built correctly.'
          );
        }
      });

      this.frontendProcess.on('close', (code) => {
        log('WARN', 'Frontend process exited', { code });
        console.log(`Frontend process exited with code ${code}`);
      });

      this.frontendProcess.on('error', (error) => {
        log('ERROR', 'Failed to start frontend', { error: error.message, stack: error.stack });
        console.error('Failed to start frontend:', error);
        dialog.showErrorBox(
          'Frontend Error', 
          `Failed to start the frontend server: ${error.message}`
        );
      });

      log('SUCCESS', 'Frontend server startup initiated', { 
        port: this.frontendPort, 
        backendPort: this.backendPort,
        pid: this.frontendProcess?.pid 
      });

    } catch (error) {
      log('ERROR', 'Error starting frontend', { error: (error as Error).message, stack: (error as Error).stack });
      console.error('Error starting frontend:', error);
      dialog.showErrorBox(
        'Startup Error', 
        `Failed to initialize the frontend: ${error}`
      );
    }
  }

  private cleanup(): void {
    log('INFO', 'Cleaning up processes and resources');
    
    if (this.backendProcess) {
      log('INFO', 'Terminating backend process', { pid: this.backendProcess.pid });
      this.backendProcess.kill();
      this.backendProcess = null;
    }
    if (this.frontendProcess) {
      log('INFO', 'Terminating frontend process', { pid: this.frontendProcess.pid });
      this.frontendProcess.kill();
      this.frontendProcess = null;
    }
    
    log('SUCCESS', 'Cleanup completed');
  }
  
  // Health check method for testing
  private async performHealthCheck(): Promise<boolean> {
    log('INFO', 'Performing application health check');
    
    try {
      // Check backend health
      const backendHealthy = await this.checkBackendHealth();
      if (!backendHealthy) {
        log('ERROR', 'Backend health check failed');
        return false;
      }
      
      // Check frontend health  
      const frontendHealthy = await this.checkFrontendHealth();
      if (!frontendHealthy) {
        log('ERROR', 'Frontend health check failed');
        return false;
      }
      
      // Check main window
      if (!this.mainWindow) {
        log('ERROR', 'Main window is null');
        return false;
      }
      
      log('SUCCESS', 'All health checks passed');
      return true;
    } catch (error) {
      log('ERROR', 'Health check failed with error', { error: (error as Error).message });
      return false;
    }
  }
  
  private async checkBackendHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log('ERROR', 'Backend health check timeout');
        resolve(false);
      }, 10000);
      
      const testUrl = `http://localhost:${this.backendPort}/api/health`;
      log('INFO', 'Checking backend health', { url: testUrl });
      
      fetch(testUrl)
        .then(response => {
          clearTimeout(timeout);
          if (response.ok) {
            log('SUCCESS', 'Backend health check passed');
            resolve(true);
          } else {
            log('ERROR', 'Backend health check failed', { status: response.status });
            resolve(false);
          }
        })
        .catch(error => {
          clearTimeout(timeout);
          log('ERROR', 'Backend health check error', { error: error.message });
          resolve(false);
        });
    });
  }
  
  private async checkFrontendHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log('ERROR', 'Frontend health check timeout');
        resolve(false);
      }, 10000);
      
      const testUrl = `http://localhost:${this.frontendPort}/api/health`;
      log('INFO', 'Checking frontend health', { url: testUrl });
      
      fetch(testUrl)
        .then(response => {
          clearTimeout(timeout);
          if (response.ok) {
            log('SUCCESS', 'Frontend health check passed');
            resolve(true);
          } else {
            log('ERROR', 'Frontend health check failed', { status: response.status });
            resolve(false);
          }
        })
        .catch(error => {
          clearTimeout(timeout);
          log('ERROR', 'Frontend health check error', { error: error.message });
          resolve(false);
        });
    });
  }
}

// Create and start the app
new MeadowApp(); 