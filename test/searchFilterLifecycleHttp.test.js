import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('HTTP filter lifecycle invalidates removed identities through period changes and explicit re-additions',()=>{
 const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/searchFilterLifecycleHttp.mjs',import.meta.url))],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/SEARCH_FILTER_LIFECYCLE_HTTP_PASS/);
});

test('HTTP targeted retry recreates the long chain and checks trimmed identities without other catalogs',()=>{
 const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/searchFilterLifecycleHttp.mjs',import.meta.url)),'--retry'],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/SEARCH_FILTER_LIFECYCLE_HTTP_PASS/);
});
