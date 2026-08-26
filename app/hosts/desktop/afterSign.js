#!/usr/bin/env node

const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

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
  const signingIdentity = process.env.MEADOW_CODESIGN_IDENTITY
    || process.env.CSC_NAME
    || context.packager.platformSpecificBuildOptions?.identity;
  if (!signingIdentity) {
    throw new Error('A macOS code-signing identity is required for the Desktop Runtime Payload.');
  }
  const payloadRoot = path.join(resourcesPath, 'runtime-payload');
  const nodeBinary = path.join(payloadRoot, 'bin', 'node');
  const signingModulePath = path.resolve(
    __dirname,
    '../../runtime/payload/src/signRuntimePayload.mjs',
  );
  const { signRuntimePayload } = await import(pathToFileURL(signingModulePath).href);
  const manifest = signRuntimePayload({
    payloadRoot,
    identity: signingIdentity,
    entitlementsPath,
  });
  console.log(`Signed Runtime Payload ${manifest.identity}`);

  // Re-seal only the outer bundle. The shared Runtime Payload signer has
  // already signed its nested code and refreshed its content manifest.
  execFileSync('codesign', [
    '--force',
    '--options', 'runtime',
    '--timestamp',
    '--entitlements', entitlementsPath,
    '--sign', signingIdentity,
    appBundle,
  ], { stdio: 'inherit' });

  execFileSync(nodeBinary, ['--version'], { stdio: 'inherit' });
  console.log('Binary re-signing complete.');
};
