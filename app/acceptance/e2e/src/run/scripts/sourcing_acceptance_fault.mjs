/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

// Test-process preload: fail the real atomic rename after several acceptance
// documents have been installed. Production contains no fault-injection switch.
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const home = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
if (home) {
  const marker = path.join(home, 'cache/sourcing-acceptance-fault.json');
  const target = path.join(home, 'app/app_config.yaml');
  const rename = fs.renameSync;
  fs.renameSync = function (from, to) {
    if (String(to) === target && fs.existsSync(marker) && fs.existsSync(path.join(home, 'app/sourcing-transaction.json'))) {
      const { mode } = JSON.parse(fs.readFileSync(marker, 'utf8'));
      fs.unlinkSync(marker);
      if (mode === 'interrupt') process.kill(process.pid, 'SIGKILL');
      throw Object.assign(new Error('Injected sourcing acceptance storage failure'), { code: 'EIO' });
    }
    return rename(from, to);
  };
  syncBuiltinESMExports();
}
