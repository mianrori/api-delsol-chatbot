import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('chat interprets autonomous and additive category sales using protected persistent state across trimming',()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/salesCategoryIntentChat.mjs',import.meta.url))],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/SALES_CATEGORY_INTENT_CHAT_PASS/);
});
