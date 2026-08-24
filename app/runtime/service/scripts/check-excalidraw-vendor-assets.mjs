import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GZIP_HEADER_OS_OFFSET = 9;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

const sourcePath = path.join(__dirname, '..', 'src', 'areas', 'bundle', 'generation', 'html', 'shared', 'excalidraw-vendor.js');
const gzipPath = `${sourcePath}.gz`;
const metadataPath = `${gzipPath}.meta.json`;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJson(filePath, failures) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`Unable to read ${filePath}: ${String(error)}`);
    return null;
  }
}

function gunzip(filePath, bytes, failures) {
  try {
    return zlib.gunzipSync(bytes);
  } catch (error) {
    failures.push(`Unable to decompress ${filePath}: ${String(error)}`);
    return null;
  }
}

function gzipHeaderOsByte(bytes) {
  if (bytes.length <= GZIP_HEADER_OS_OFFSET) {
    return null;
  }
  return bytes[GZIP_HEADER_OS_OFFSET].toString(16).padStart(2, '0');
}

const failures = [];
for (const requiredPath of [sourcePath, gzipPath, metadataPath]) {
  if (!fs.existsSync(requiredPath)) {
    failures.push(`Missing required Excalidraw vendor artifact: ${requiredPath}`);
  }
}

if (failures.length === 0) {
  const sourceBytes = fs.readFileSync(sourcePath);
  const gzipBytes = fs.readFileSync(gzipPath);
  const uncompressedGzipBytes = gunzip(gzipPath, gzipBytes, failures);
  const actualGzipHeaderOsByte = gzipHeaderOsByte(gzipBytes);
  const metadata = readJson(metadataPath, failures);

  if (uncompressedGzipBytes && !uncompressedGzipBytes.equals(sourceBytes)) {
    failures.push(`${gzipPath} does not decompress to ${sourcePath}`);
  }

  if (actualGzipHeaderOsByte !== 'ff') {
    failures.push(`Invalid gzip header OS byte in ${gzipPath}: expected "ff", got ${JSON.stringify(actualGzipHeaderOsByte)}`);
  }

  if (metadata) {
    const expectedSourceSha256 = sha256(sourceBytes);
    const expectedGzipSha256 = sha256(gzipBytes);
    const expectedMetadata = {
      version: 1,
      source: path.basename(sourcePath),
      sourceSha256: expectedSourceSha256,
      gzip: path.basename(gzipPath),
      gzipSha256: expectedGzipSha256,
      gzipAlgorithm: 'gzip',
      gzipLevel: zlib.constants.Z_BEST_COMPRESSION,
      gzipHeaderOsByte: 'ff',
    };

    for (const [key, expectedValue] of Object.entries(expectedMetadata)) {
      if (metadata[key] !== expectedValue) {
        failures.push(`Invalid ${key} in ${metadataPath}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(metadata[key])}`);
      }
    }

    if (typeof metadata.sourceSha256 !== 'string' || !SHA256_HEX_RE.test(metadata.sourceSha256)) {
      failures.push(`Invalid sourceSha256 format in ${metadataPath}`);
    }
    if (typeof metadata.gzipSha256 !== 'string' || !SHA256_HEX_RE.test(metadata.gzipSha256)) {
      failures.push(`Invalid gzipSha256 format in ${metadataPath}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Excalidraw vendor artifacts are out of date:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('Run: node scripts/build-excalidraw-vendor.mjs --gzip-only');
  process.exit(1);
}

console.log('Excalidraw vendor gzip artifact is current.');
