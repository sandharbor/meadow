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

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { loadResourcesConfig } from '../shared_code/utils/resourcesConfigUtils.js';

export default defineConfig(({ command }) => {
  // Env vars win (tools/dev sets these when pointing at a worktree config dir).
  // Otherwise read from resources config in the meadow home.
  let frontendPort = parseInt(process.env.VITE_FRONTEND_PORT || '0', 10);
  let backendPort = parseInt(process.env.VITE_BACKEND_PORT || '0', 10);

  if (command === 'serve' && (!frontendPort || !backendPort)) {
    const resources = loadResourcesConfig();
    frontendPort = frontendPort || resources.frontendPort || 0;
    backendPort = backendPort || resources.backendPort || 0;
    if (!frontendPort || !backendPort) {
      throw new Error('frontendPort and backendPort must be set in resources config or passed as VITE_FRONTEND_PORT/VITE_BACKEND_PORT env vars.');
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // Ensure a single copy of React is used across the app and shared_components
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: frontendPort,
      proxy: {
        '/api': {
          // Use 127.0.0.1 instead of localhost so Node does not run dual-stack
          // connect attempts (internalConnectMultiple), which often stalls ~1–2s on Windows.
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  };
}); 