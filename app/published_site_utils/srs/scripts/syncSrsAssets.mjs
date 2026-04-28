import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const distDir = path.join(packageRoot, 'dist');
const backendTargetDir = path.resolve(packageRoot, '../../backend/src/html/published_site_utils/srs');

const requiredFiles = ['srs.js', 'srs.css'];

fs.mkdirSync(backendTargetDir, { recursive: true });

for (const filename of requiredFiles) {
  const sourcePath = path.join(distDir, filename);
  const targetPath = path.join(backendTargetDir, filename);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing build artifact: ${sourcePath}`);
  }
  fs.copyFileSync(sourcePath, targetPath);
}

console.log(`Synced SRS assets to ${backendTargetDir}`);
