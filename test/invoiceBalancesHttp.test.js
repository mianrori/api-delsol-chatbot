import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('balance tools through HTTP, protected model exchange, ambiguity, pagination and proxy cleanup',()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoiceBalancesHttp.mjs',import.meta.url))],{encoding:'utf8',timeout:25000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_BALANCES_HTTP_PASS/);
});
