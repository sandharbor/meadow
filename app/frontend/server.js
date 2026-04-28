import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Serve static files from the dist directory
// In production build, dist files are in the same directory as server.js
// In development, dist is a subdirectory
const distPath = fs.existsSync(path.join(__dirname, 'index.html')) 
  ? __dirname 
  : path.join(__dirname, 'dist');
app.use(express.static(distPath));

// API routes to get server information
app.get('/api/server-info', (req, res) => {
  res.json({
    frontendPort: port,
    backendPort: process.env.BACKEND_PORT || null
  });
});

// API route to get backend port for frontend configuration
app.get('/api/backend-port', (req, res) => {
  const backendPort = process.env.BACKEND_PORT;
  if (backendPort) {
    res.json({ backendPort: parseInt(backendPort, 10) });
  } else {
    res.status(404).json({ error: 'Backend port not configured' });
  }
});

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

app.listen(port, () => {
  console.log(`Frontend server running on port ${port}`);
});
