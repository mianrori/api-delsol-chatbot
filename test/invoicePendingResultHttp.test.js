import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

for(const branch of ['named','followup'])for(const outcome of ['undefined','throw','error','denied','deniedResult','empty','data','malformed']){
 test(`pending HTTP ${branch}: ${outcome} result and previous valid context`,()=>{
  const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoicePendingResultHttp.mjs',import.meta.url)),branch,outcome],{encoding:'utf8',timeout:15000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_PENDING_RESULT_HTTP_PASS/);
 });
}
