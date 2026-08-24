#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function(context) {
  // Only run on macOS
  if (process.platform !== 'darwin') {
    return;
  }
  if (process.env.MEADOW_LOCAL_QA_UNSIGNED === '1') {
    console.log('Skipping binary re-signing for the unsigned local QA application.');
    return;
  }

  console.log('Re-signing binaries with proper entitlements after electron-builder signing...');
  
  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename;
  const appBundle = path.join(appOutDir, `${productFilename}.app`);
  const resourcesPath = path.join(appBundle, 'Contents', 'Resources');
  const entitlementsPath = path.join(__dirname, 'entitlements.mac.plist');
  const signingIdentity = 'Developer ID Application: Sand Harbor Software, LLC (3Y93X67X8P)';
  
  const payloadRoot = path.join(resourcesPath, 'runtime-payload');
  const nodeBinary = path.join(payloadRoot, 'bin', 'node');
  const workingGraphBin = path.join(payloadRoot, 'native', 'working_graph_bin');
  const sourcePageSearchBin = path.join(payloadRoot, 'native', 'source_page_search_by_title_bin');
  const fastGitOpsBin = path.join(payloadRoot, 'native', 'fast_git_ops_bin');
  
  // Re-sign binaries with entitlements that allow JIT and loading external libraries
  const signBinary = (binaryPath, name) => {
    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Required packaged binary was not found: ${name} (${binaryPath})`);
    }

    console.log(`Re-signing ${name} with JIT entitlements...`);
    execFileSync('codesign', [
      '--force',
      '--options', 'runtime',
      '--entitlements', entitlementsPath,
      '--sign', signingIdentity,
      binaryPath,
    ], { stdio: 'inherit' });
    console.log(`Successfully re-signed: ${name}`);
  };
  
  // Re-sign all bundled binaries with proper entitlements
  signBinary(nodeBinary, 'node');
  signBinary(workingGraphBin, 'working_graph_bin');
  signBinary(sourcePageSearchBin, 'source_page_search_by_title_bin');
  signBinary(fastGitOpsBin, 'fast_git_ops_bin');

  // Re-seal the outer bundle after replacing signatures on nested binaries.
  execFileSync('codesign', [
    '--force',
    '--deep',
    '--options', 'runtime',
    '--entitlements', entitlementsPath,
    '--sign', signingIdentity,
    appBundle,
  ], { stdio: 'inherit' });

  execFileSync(nodeBinary, ['--version'], { stdio: 'inherit' });
  console.log('Binary re-signing complete.');
};
