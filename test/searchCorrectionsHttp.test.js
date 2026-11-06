import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('candidate HTTP conversations retain pending selections and bind usage category filters',()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/searchCorrectionsHttp.mjs',import.meta.url))],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/SEARCH_CORRECTIONS_HTTP_PASS/);
});
