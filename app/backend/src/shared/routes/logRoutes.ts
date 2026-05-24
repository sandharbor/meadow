/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import express from 'express';
import fs from 'fs';
import { join } from 'path';

const router = express.Router();

// Get recent backend logs (optionally filtered by siteGuid)
router.get('/logs', (req, res) => {
  const sinceBytesRaw = typeof req.query.sinceBytes === 'string' ? req.query.sinceBytes : undefined;
  const limitLinesRaw = typeof req.query.limitLines === 'string' ? req.query.limitLines : undefined;
  const siteGuid = typeof req.query.siteGuid === 'string' ? req.query.siteGuid.trim() : undefined;
  const siteFilter = typeof req.query.siteFilter === 'string' ? req.query.siteFilter.trim() : undefined;

  const sinceBytes = sinceBytesRaw ? Number.parseInt(sinceBytesRaw, 10) : 0;
  const limitLines = limitLinesRaw ? Number.parseInt(limitLinesRaw, 10) : 500;

  const homedir = process.env.HOME || process.env.USERPROFILE || '';
  const logPath = join(homedir, 'Library', 'Logs', 'Meadow', 'meadow.log');

  if (!fs.existsSync(logPath)) {
    return res.json({
      lines: [],
      nextSinceBytes: 0,
      fileSize: 0,
      truncated: false,
      droppedLines: 0
    });
  }

  let fileSize = 0;
  try {
    fileSize = fs.statSync(logPath).size;
  } catch {
    return res.status(500).json({ error: 'Failed to stat meadow.log' });
  }

  const safeSince = Number.isFinite(sinceBytes) && sinceBytes >= 0 ? sinceBytes : 0;
  let start = safeSince > fileSize ? 0 : safeSince;

  const maxBytes = 2 * 1024 * 1024; // 2MB safety cap per request
  let truncated = false;
  if (fileSize - start > maxBytes) {
    truncated = true;
    start = Math.max(0, fileSize - maxBytes);
  }

  let chunk = '';
  try {
    const fd = fs.openSync(logPath, 'r');
    try {
      const bytesToRead = fileSize - start;
      const buffer = Buffer.alloc(bytesToRead);
      const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, start);
      chunk = buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return res.status(500).json({ error: 'Failed to read meadow.log' });
  }

  // If we started mid-file, drop the first partial line (until first newline)
  if (start > 0) {
    const firstNewline = chunk.indexOf('\n');
    if (firstNewline !== -1) {
      chunk = chunk.slice(firstNewline + 1);
    } else {
      chunk = '';
    }
  }

  const rawLines = chunk.split('\n').filter(l => l.trim().length > 0);
  const filterToken = siteFilter || (siteGuid ? `[site ${siteGuid}]` : undefined);
  const filteredLines = filterToken ? rawLines.filter(l => l.includes(filterToken)) : rawLines;

  const safeLimit = Number.isFinite(limitLines) ? Math.max(1, Math.min(limitLines, 5000)) : 500;
  let lines = filteredLines;
  let droppedLines = 0;
  if (lines.length > safeLimit) {
    droppedLines = lines.length - safeLimit;
    lines = lines.slice(lines.length - safeLimit);
  }

  res.json({
    lines,
    nextSinceBytes: fileSize,
    fileSize,
    truncated,
    droppedLines
  });
});

export default router;
