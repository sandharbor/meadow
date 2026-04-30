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
  
  const nodeWrapperSh = path.join(resourcesPath, 'node-wrapper.sh');
  const nodeBinary = path.join(resourcesPath, 'node');
  const workingGraphBin = path.join(resourcesPath, 'working_graph', 'working_graph_bin');
  const sourcePageSearchBin = path.join(resourcesPath, 'source_page_search_by_title', 'source_page_search_by_title_bin');
  const fastGitOpsBin = path.join(resourcesPath, 'fast_git_ops', 'fast_git_ops_bin');
  
  // Set executable permissions on all binaries
  const setExecutable = (filePath, name) => {
    if (fs.existsSync(filePath)) {
      fs.chmodSync(filePath, '755');
      console.log(`Set executable permissions on: ${name}`);
    }
  };
  
  try {
    setExecutable(nodeWrapperSh, 'node-wrapper.sh');
    setExecutable(nodeBinary, 'node');
    setExecutable(workingGraphBin, 'working_graph_bin');
    setExecutable(sourcePageSearchBin, 'source_page_search_by_title_bin');
    setExecutable(fastGitOpsBin, 'fast_git_ops_bin');
  } catch (error) {
    console.warn(`Warning: Could not set executable permissions: ${error.message}`);
  }

  // Publishing providers ship as compiled ES modules (import/export). For Node
  // to treat them as ESM, it has to find a package.json with "type":"module"
  // when walking up from a provider file. In dev that walk lands on
  // meadow/app/backend/package.json (which has "type":"module"); in the bundle
  // the equivalent walk runs out without finding one. A minimal package.json at
  // Resources/publishing_providers/ marks the whole tree as ESM. The same
  // directory also gets a node_modules symlink so providers can resolve npm
  // imports (express, yaml, @aws-sdk/*, etc.) through the backend's dep tree
  // without duplicating it.
  const providersDir = path.join(resourcesPath, 'publishing_providers');
  if (fs.existsSync(providersDir)) {
    const providersPkg = path.join(providersDir, 'package.json');
    if (!fs.existsSync(providersPkg)) {
      fs.writeFileSync(providersPkg, JSON.stringify({ type: 'module' }, null, 2) + '\n');
      console.log('Wrote publishing_providers/package.json (type: module)');
    }
    const nmLink = path.join(providersDir, 'node_modules');
    if (!fs.existsSync(nmLink)) {
      fs.symlinkSync('../backend/node_modules', nmLink);
      console.log('Linked publishing_providers/node_modules → ../backend/node_modules');
    }
  }
};
