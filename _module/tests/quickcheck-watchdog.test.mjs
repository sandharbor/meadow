import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quickcheck = await readFile(new URL("../scripts/quickcheck", import.meta.url), "utf8");
const watchdog = quickcheck.slice(
  quickcheck.indexOf("QUICKCHECK_TIMEOUT="),
  quickcheck.indexOf("# Parse flags"),
);

function runWithWatchdog(body, timeout = "30", deadline = 2000) {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", ["-c", `${watchdog}\n${body}`], {
      detached: true,
      env: { ...process.env, QUICKCHECK_WATCHDOG: "", QUICKCHECK_TIMEOUT: timeout },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    const guard = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* The group may already be gone. */ }
      reject(new Error("Watchdog left child processes holding the output pipes open."));
    }, deadline);
    child.once("error", error => { clearTimeout(guard); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(guard);
      resolve({ code, signal, output });
    });
  });
}

test("successful quickcheck closes captured output without waiting for its watchdog", async () => {
  const result = await runWithWatchdog("sleep 0.2; echo done; exit 0");
  assert.equal(result.code, 0);
  assert.equal(result.output, "done\n");
});

test("failed quickcheck preserves its exit code and closes captured output", async () => {
  const result = await runWithWatchdog("sleep 0.2; echo failed; exit 7");
  assert.equal(result.code, 7);
  assert.equal(result.output, "failed\n");
});

test("expired watchdog still terminates the quickcheck process group", async () => {
  const result = await runWithWatchdog("sleep 20", "1", 4000);
  assert.equal(result.signal, "SIGTERM");
  assert.match(result.output, /quickcheck exceeded 1s timeout/);
});
