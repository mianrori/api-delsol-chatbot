import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Oracle cleanup errors log only correlation and safe codes and preserve primary results/errors',()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/oracleSessionClose.mjs',import.meta.url))],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/Oracle close privacy tests passed/);
});
