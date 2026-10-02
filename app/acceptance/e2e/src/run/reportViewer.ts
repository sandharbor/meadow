/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Expect } from '@playwright/test';

/** A real report server and browser client isolated from the developer's running viewer. */
export async function startReportViewer(expect: Expect) {
  const port = async () => {
    const server = net.createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as net.AddressInfo;
    await new Promise<void>(resolve => server.close(() => resolve()));
    return address.port;
  };
  const [serverPort, clientPort] = await Promise.all([port(), port()]);
  const cwd = path.resolve(import.meta.dirname, '../../../report_viewer');
  const env = { ...process.env, REPORT_VIEWER_PORT: String(serverPort), REPORT_VIEWER_CLIENT_PORT: String(clientPort) };
  let logs = '';
  const children = [['--import', 'tsx', 'src/server/index.ts'], ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort']].map(args => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', bytes => { logs += String(bytes); });
    child.stderr?.on('data', bytes => { logs += String(bytes); });
    return child;
  });
  const url = `http://127.0.0.1:${clientPort}`;
  const stop = async () => {
    await Promise.all(children.map(child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      return new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGTERM'); });
    }));
  };
  try {
    for (const target of [`http://127.0.0.1:${serverPort}/api/concepts`, url]) await expect.poll(async () => {
      try { return (await fetch(target)).ok; } catch { return false; }
    }, { timeout: 15000 }).toBe(true);
  } catch (error) { await stop(); throw error; }
  return { url, logs: () => logs, stop };
}
