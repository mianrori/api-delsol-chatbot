import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('chat renders authorized names and effective metric preferences through trimming, reselection and removal',()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/salesScopeMetricsChat.mjs',import.meta.url))],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/SALES_SCOPE_METRICS_CHAT_PASS/);
});
