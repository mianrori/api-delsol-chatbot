import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("HTTP cancellation propagates through request lifecycle and preserves session responses", () => {
  const result = spawnSync(process.execPath, ["--experimental-vm-modules",
    fileURLToPath(new URL("./fixtures/chatLifecycle.mjs", import.meta.url))],
  { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Lifecycle integration passed/);
});
