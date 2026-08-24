#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  console.log('Setting executable permissions after pack...');

  // On macOS, electron-builder sets context.appOutDir to the directory
  // *containing* Meadow.app, not the .app itself, so resourcesPath has to
  // descend into Meadow.app first.
  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename;
  const appBundle = path.join(appOutDir, `${productFilename}.app`);
  const resourcesPath = path.join(appBundle, 'Contents', 'Resources');
  
  const payloadRoot = path.join(resourcesPath, 'runtime-payload');
  const nodeBinary = path.join(payloadRoot, 'bin', 'node');
  const meadowCli = path.join(resourcesPath, 'cli', 'meadow');
  const supervisor = path.join(payloadRoot, 'supervisor', 'meadow-runtime-supervisor.cjs');
  const workingGraphBin = path.join(payloadRoot, 'native', 'working_graph_bin');
  const sourcePageSearchBin = path.join(payloadRoot, 'native', 'source_page_search_by_title_bin');
  const fastGitOpsBin = path.join(payloadRoot, 'native', 'fast_git_ops_bin');
  
  // Set executable permissions on all binaries
  const setExecutable = (filePath, name) => {
    if (fs.existsSync(filePath)) {
      fs.chmodSync(filePath, '755');
      console.log(`Set executable permissions on: ${name}`);
    }
  };
  
  try {
    setExecutable(nodeBinary, 'node');
    setExecutable(supervisor, 'Runtime Supervisor');
    setExecutable(meadowCli, 'meadow CLI launcher');
    setExecutable(workingGraphBin, 'working_graph_bin');
    setExecutable(sourcePageSearchBin, 'source_page_search_by_title_bin');
    setExecutable(fastGitOpsBin, 'fast_git_ops_bin');
  } catch (error) {
    console.warn(`Warning: Could not set executable permissions: ${error.message}`);
  }

};
