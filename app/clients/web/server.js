import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the dist directory
// In production build, dist files are in the same directory as server.js
// In development, dist is a subdirectory
const distPath = fs.existsSync(path.join(__dirname, 'index.html')) 
  ? __dirname 
  : path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    port: port,
    uptime: process.uptime(),
    type: 'frontend'
  });
});

// Catch all handler - send back index.html for any non-API routes
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error('ERROR: Frontend build not found - index.html does not exist at:', indexPath);
    res.status(404).send('Frontend build not found');
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Frontend server running on IPv4 loopback port ${port}`);
});
