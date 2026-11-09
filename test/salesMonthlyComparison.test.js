import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const trimmed of [false,true])for(const scenario of ['global-fresh','global-prior','category-fresh','category-prior','ambiguous','not-found','no-sales','followup'])test(`monthly comparison ${scenario}; trimmed=${trimmed}`,()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/salesMonthlyComparison.mjs',import.meta.url)),scenario,String(trimmed)],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/MONTHLY_COMPARISON_PASS/);
});
