/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

// A real external classifier with filesystem coordination for observable user workflows.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

const controls = process.argv[2];
let stdin = '';
for await (const chunk of process.stdin) stdin += chunk;
const request = JSON.parse(stdin);
fs.mkdirSync(path.join(controls, 'started'), { recursive: true });
fs.writeFileSync(path.join(controls, 'started', `${process.pid}.json`), JSON.stringify(request));
while (fs.existsSync(path.join(controls, 'hold')) && !fs.existsSync(path.join(controls, 'release'))) await setTimeout(25);
if (fs.existsSync(path.join(controls, 'must-not-run'))) {
  process.stderr.write('Unexpected invocation: unchanged inputs should use the persistent cache.');
  process.exit(12);
}
if (fs.existsSync(path.join(controls, 'fail')) && request.nodes.some(node => node.name.toLowerCase().includes('inlink'))) {
  process.stderr.write('Intentional classifier failure for inlink nodes. Repair the external program and rerun.');
  process.exit(7);
}
process.stdout.write(JSON.stringify({ version: 1, results: request.nodes.map(node => ({ id: node.id, selected: node.name.toLowerCase().includes('inlink') })) }));
