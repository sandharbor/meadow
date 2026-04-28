#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  console.log('Setting executable permissions after pack...');
  
  const appOutDir = context.appOutDir;
  const resourcesPath = path.join(appOutDir, 'Contents', 'Resources');
  
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
};
