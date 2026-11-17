import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getSalesMetricIntent} from '../src/services/ai/salesMetrics.service.js';

test('no-solo intent requires an explicit metric, not a period, local or grouping',()=>{
 for(const message of ['No solo enero, también febrero','No solo Nike, también otro local','No solo por mes','No quiero solo enero'])assert.equal(getSalesMetricIntent(message),null,message);
 for(const message of ['No solo el importe, también las facturas','No solo las facturas, también el monto','No muestres solo el importe','No solo importe'])assert.deepEqual(getSalesMetricIntent(message),['totalAmount','totalInvoices'],message);
});

for(const trimmed of [false,true])for(const scenario of ['period','metrics'])test(`no-solo ${scenario} final arguments, preference and presentation; trimmed=${trimmed}`,()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/salesMetricsNoSolo.mjs',import.meta.url)),scenario,String(trimmed)],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/SALES_METRICS_NO_SOLO_PASS/);
});
