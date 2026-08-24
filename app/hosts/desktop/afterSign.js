#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

exports.default = async function(context) {
  // Only run on macOS
  if (process.platform !== 'darwin') {
    return;
  }

  console.log('Re-signing binaries with proper entitlements after electron-builder signing...');
  
  const appOutDir = context.appOutDir;
  const resourcesPath = path.join(appOutDir, 'Contents', 'Resources');
  const entitlementsPath = path.join(__dirname, 'entitlements.mac.plist');
  
  const nodeBinary = path.join(resourcesPath, 'node');
  const workingGraphBin = path.join(resourcesPath, 'working_graph', 'working_graph_bin');
  const sourcePageSearchBin = path.join(resourcesPath, 'source_page_search_by_title', 'source_page_search_by_title_bin');
  const fastGitOpsBin = path.join(resourcesPath, 'fast_git_ops', 'fast_git_ops_bin');
  
  // Re-sign binaries with entitlements that allow JIT and loading external libraries
  const signBinary = (binaryPath, name) => {
    if (!fs.existsSync(binaryPath)) {
      console.log(`Skipping ${name}: not found`);
      return;
    }
    
    try {
      // Sign with the same identity and entitlements as the main app
      // The --force flag replaces the existing signature
      // --options runtime enables hardened runtime
      const cmd = `codesign --force --options runtime --entitlements "${entitlementsPath}" --sign "Developer ID Application: Sand Harbor Software, LLC (3Y93X67X8P)" "${binaryPath}"`;
      console.log(`Re-signing ${name} with JIT entitlements...`);
      execSync(cmd, { stdio: 'inherit' });
      console.log(`Successfully re-signed: ${name}`);
    } catch (error) {
      console.error(`Warning: Failed to sign ${name}: ${error.message}`);
    }
  };
  
  // Re-sign all bundled binaries with proper entitlements
  signBinary(nodeBinary, 'node');
  signBinary(workingGraphBin, 'working_graph_bin');
  signBinary(sourcePageSearchBin, 'source_page_search_by_title_bin');
  signBinary(fastGitOpsBin, 'fast_git_ops_bin');
  
  console.log('Binary re-signing complete.');
};
