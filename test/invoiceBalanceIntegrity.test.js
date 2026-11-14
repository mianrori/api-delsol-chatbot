import test from 'node:test';
import assert from 'node:assert/strict';
import {getInvoiceBalances} from '../src/services/invoices/invoiceBalances.service.js';
import {buildInvoiceBalanceResponse} from '../src/services/ai/invoiceBalancePresentation.service.js';
import {protectPiiDeep,restorePiiDeep} from '../src/services/ai/pii.service.js';
import {clearPiiSession} from '../src/state/pii.store.js';
const fake=(...rows)=>({queries:[],async execute(sql,binds){this.queries.push({sql,binds});return {rows:rows.shift()??[]};}});

for(const debts of [['10','10'],['10','20']])test('duplicate identity blocks equal or conflicting debts '+debts.join('/'),async()=>{
 const c=fake([{TOTAL_ROWS:2,DUPLICATE_ROWS:2}]);
 const r=await getInvoiceBalances({mode:'summary',groupBy:['customer']},c);
 assert.equal(r.status,'INCONSISTENT_HISTORY');assert.equal(r.data,undefined);assert.equal(r.invoiceCount,null);
 assert.match(buildInvoiceBalanceResponse([{name:'get_invoice_balances',result:r}]),/históricos duplicados/);
 const d=await getInvoiceBalances({},fake([{TOTAL_ROWS:2,DUPLICATE_ROWS:2}],debts.map(DEUDA=>({SERIE_FACTURA:'S1',NRO_FACTURA:'1',DEUDA}))));
 assert.equal(d.data.length,2);assert.deepEqual(d.data.map(x=>x.debt),debts);assert.equal(d.invoiceCount,null);assert.ok(d.warning);
 assert.doesNotMatch(c.queries[0].sql,/SUM\s*\(\s*DISTINCT|\b(?:MAX|MIN)\s*\(/i);
});

test('clean different series with equal numbers and equal debts count and sum both, each currency separately',async()=>{
 const rows=[{TOTAL_ROWS:3,DUPLICATE_ROWS:0,TOTAL_GROUPS:2,RN:1,COD_MONEDA:'A',DEUDA:'20.00',INVOICE_COUNT:2,CURRENCY_RANK:1},
 {TOTAL_ROWS:3,DUPLICATE_ROWS:0,TOTAL_GROUPS:2,RN:2,COD_MONEDA:'B',DEUDA:'10.00',INVOICE_COUNT:1,CURRENCY_RANK:1}];
 const c=fake(rows),r=await getInvoiceBalances({mode:'summary',invoices:[{invoiceSeries:'S1',invoiceNumber:'1'},{invoiceSeries:'S2',invoiceNumber:'1'}]},c);
 assert.equal(r.status,'OK_SUMMARY');assert.equal(r.invoiceCount,3);assert.deepEqual(r.data.map(x=>[x.currencyCode,x.debt,x.invoiceCount]),[['A','20.00',2],['B','10.00',1]]);
 assert.match(c.queries[0].sql,/GROUP BY COD_MONEDA/);assert.match(c.queries[0].sql,/PARTITION BY COD_MONEDA ORDER BY/);
 assert.match(c.queries[0].sql,/PARTITION BY SERIE_FACTURA,NRO_FACTURA/);
 assert.ok(c.queries[0].sql.indexOf('AS IDENTITY_COPIES')<c.queries[0].sql.indexOf('filtered AS'));
 assert.match(c.queries[0].sql,/NOT EXISTS \(SELECT 1 FROM integrity/);assert.equal(c.queries.length,1);
});

for(const field of ['MISSING_IDENTITY_ROWS','MISSING_CURRENCY_ROWS','UNKNOWN_DEBT_ROWS'])test('incomplete scope leaves calculations unset '+field,async()=>{
 const r=await getInvoiceBalances({mode:'summary'},fake([{TOTAL_ROWS:1,[field]:1}]));assert.equal(r.status,'INCONSISTENT_HISTORY');assert.equal(r.invoiceCount,null);assert.equal(r.data,undefined);
});

test('out of range clean summary preserves global group count and no false data',async()=>{
 const r=await getInvoiceBalances({mode:'summary',page:4,rows:1},fake([{TOTAL_ROWS:2,TOTAL_GROUPS:2,RN:null}]));
 assert.equal(r.totalRows,2);assert.equal(r.totalPages,2);assert.deepEqual(r.data,[]);
});

test('summary amount bounds require one currency; no comparisons across currencies',async()=>{
 const c=fake([]),r=await getInvoiceBalances({mode:'summary',minDebt:10},c);
 assert.equal(r.status,'REQUIRES_SOURCE_IDENTITY');assert.match(c.queries[0].sql,/WHERE 1=0/);
});

test('clean summary identities protected and restored for invoice ranking presentation',async()=>{
 const id='INTEGRITY-PII';try{
 const r=await getInvoiceBalances({mode:'summary',groupBy:['invoice']},fake([{TOTAL_ROWS:1,TOTAL_GROUPS:1,RN:1,COD_MONEDA:'M1',DIM0:'SECRET-SERIES',DIM1:'SECRET-INVOICE',DEUDA:'12.34',INVOICE_COUNT:1,CURRENCY_RANK:1}]));
 const p=protectPiiDeep(id,r);assert.ok(!JSON.stringify(p).includes('SECRET-'));assert.deepEqual(restorePiiDeep(id,p),r);
 const text=buildInvoiceBalanceResponse([{name:'get_invoice_balances',result:r}]);assert.ok(text.includes('| SECRET-SERIES | SECRET-INVOICE |'));assert.ok(text.includes('12,34'));
 }finally{clearPiiSession(id);}
});
