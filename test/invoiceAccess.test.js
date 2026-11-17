import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getInvoices} from '../src/services/invoices/invoices.service.js';
import {hasRestrictedInvoiceCustomerRepository} from '../src/repositories/invoices/invoiceCustomers.repository.js';
import {buildInvoiceDetailResponse,appendInvoiceAccessWarning,INVOICE_PARTIAL_PRESENTATION_MESSAGE as INVOICE_PARTIAL_ACCESS_MESSAGE} from '../src/services/ai/invoiceDetailPresentation.service.js';
import {INVOICE_ACCESS_DENIED_MESSAGE} from '../src/utils/invoiceAccess.js';
const fake=(...results)=>({queries:[],async execute(sql,binds){this.queries.push({sql,binds});return {rows:results.shift()??[]};}});
const filters={customerIds:['C1'],conceptIds:['K1'],dateFrom:'01/01/2023',dateTo:'31/12/2023',invoiceNumber:'F1',plate:'ab -123',period:'01/2023',cancelled:false,page:2,rows:1};

// Compare complete predicates, not just column presence: the probe must neither
// inherit the authorized predicate nor lose a filter (including normalized plate).
for(const mode of ['detail','summary'])for(const plate of ['anx123',' AN-X 123\t','an\nx-123'])test(`${mode}: authorized and restricted scopes are identical for ${JSON.stringify(plate)}`,async()=>{
 const c=mode==='detail'
  ?fake([{TOTAL_ROWS:1,TOTAL_INVOICES:1,HAS_RESTRICTED_DATA:1}],[{NRO_FACTURA:'ALLOWED',IMPORTE:20}])
  :fake([{TOTAL_AMOUNT:20,INVOICE_COUNT:1,CURRENCY_SYMBOL:'PYG'}],[{HAS_RESTRICTED_DATA:1}]);
 const result=await getInvoices({...filters,mode,plate},c);
 assert.equal(result.hasRestrictedData,true);
 const probe=c.queries.find(q=>q.sql.includes('CASE WHEN EXISTS ('));
 const restricted=probe.sql.split('SELECT 1 FROM VW_BOT_FACTURAS WHERE ')[1].split(') THEN 1 ELSE 0 END')[0].trim();
 const authorized=c.queries[0].sql.split("WHERE NVL(USER_CAN_CONSULT, 'S') <> 'N'")[1].split(mode==='detail'?') totals':'GROUP BY')[0].trim();
 assert.equal(restricted.replace(/^USER_CAN_CONSULT = 'N'/,'').trim(),authorized);
 assert.doesNotMatch(restricted,/NVL\(USER_CAN_CONSULT|COUNT\(|PDF|IMPORTE|NOM_CLIENTE|ROW_NUMBER|:offset|:maxRow/);
 for(const q of c.queries)assert.equal(q.binds.plate,'ANX123');
 if(mode==='summary'){
  assert.deepEqual(c.queries[0].binds,c.queries[1].binds);
  assert.equal(result.totalAmount,20);assert.equal(result.invoiceCount,1);
 }
});

test('invoice service uses the exact denial wording and never builds a PDF for denied-only scope',async()=>{
 await assert.rejects(getInvoices({plate:'an-x 123'},fake([{TOTAL_ROWS:0,TOTAL_INVOICES:0,HAS_RESTRICTED_DATA:1}],[])),e=>{
  assert.equal(e.code,'ACCESS_DENIED');assert.equal(e.message,'El usuario no tiene permisos para consultar esta información.');assert.equal(e.message,INVOICE_ACCESS_DENIED_MESSAGE);return true;
 });
});

test('restricted existence probe keeps every filter and reveals only a bit, never denied rows/counts',async()=>{
 const c=fake([{TOTAL_ROWS:2,TOTAL_INVOICES:2,HAS_RESTRICTED_DATA:1}],[{NRO_FACTURA:'ALLOWED',IMPORTE:10}]);
 const r=await getInvoices(filters,c);assert.equal(r.hasRestrictedData,true);assert.equal(r.data.length,1);assert.equal(r.totalRows,2);assert.equal(r.page,2);
 const [count,detail]=c.queries;assert.equal(c.queries.length,2);const restricted=count.sql.split('CASE WHEN EXISTS (')[1].split(') THEN 1 ELSE 0 END')[0];
 assert.match(restricted,/SELECT 1 FROM VW_BOT_FACTURAS/);assert.match(restricted,/USER_CAN_CONSULT = 'N'/);
 for(const key of ['COD_CLIENTE','COD_CONCEPTO','FECHA_EMISION','NRO_FACTURA','MATRICULA','PERIODO','ANULADO'])assert.ok(restricted.includes(key));
 for(const key of Object.keys(count.binds))assert.deepEqual(count.binds[key],detail.binds[key]);assert.equal(count.binds.plate,'AB123');
 assert.match(detail.sql,/NVL\(USER_CAN_CONSULT, 'S'\) <> 'N'/);assert.equal(detail.binds.offset,1);assert.equal(detail.binds.maxRow,2);
 assert.doesNotMatch(JSON.stringify(r),/HAS_RESTRICTED_DATA|USER_CAN_CONSULT/);
});

test('all denied is ACCESS_DENIED; absence and out-of-range authorized pages retain distinct behavior',async()=>{
 await assert.rejects(getInvoices({},fake([{TOTAL_ROWS:0,TOTAL_INVOICES:0,HAS_RESTRICTED_DATA:1}],[])),e=>e.code==='ACCESS_DENIED');
 const empty=await getInvoices({},fake([{TOTAL_ROWS:0,TOTAL_INVOICES:0}],[]));assert.equal(empty.totalRows,0);assert.equal(empty.hasRestrictedData,undefined);
 const page=await getInvoices({page:3},fake([{TOTAL_ROWS:1,TOTAL_INVOICES:1,HAS_RESTRICTED_DATA:1}],[]));assert.equal(page.page,3);assert.equal(page.totalRows,1);
});

test('summary denies only when all matching rows are restricted; authorized zero/null-currency totals remain valid',async()=>{
 await assert.rejects(getInvoices({mode:'summary'},fake([],[{HAS_RESTRICTED_DATA:1}])),e=>e.code==='ACCESS_DENIED');
 const c=fake([{TOTAL_AMOUNT:0,INVOICE_COUNT:1,CURRENCY_SYMBOL:null}],[{HAS_RESTRICTED_DATA:1}]);const r=await getInvoices({mode:'summary',...filters},c);
 assert.equal(r.totalAmount,0);assert.equal(r.hasRestrictedData,true);assert.equal(c.queries[1].binds.customerId0,'C1');assert.match(c.queries[1].sql,/SELECT 1 FROM VW_BOT_FACTURAS/);
 const grouped=await getInvoices({mode:'summary',groupBy:['month']},fake([{MONTH:'01/2023',TOTAL_AMOUNT:10}],[{HAS_RESTRICTED_DATA:1}]));assert.equal(grouped.data.length,1);
});

test('restricted customer lookup returns only a bit and preserves dates and bound identity',async()=>{
 const c=fake([{HAS_RESTRICTED_DATA:1}]);assert.equal(await hasRestrictedInvoiceCustomerRepository({connection:c,query:'Ejemplo',dateFrom:filters.dateFrom,dateTo:filters.dateTo}),true);
 const {sql,binds}=c.queries[0];assert.match(sql,/USER_CAN_CONSULT = 'N'/);assert.match(sql,/FECHA_EMISION < TO_DATE\(:dateTo, 'DD\/MM\/YYYY'\) \+ 1/);assert.equal(binds.queryNormalized,'EJEMPLO');assert.equal(binds.dateFrom,filters.dateFrom);assert.doesNotMatch(sql,/SELECT (?:DISTINCT )?COD_CLIENTE|UTL_MATCH/);
});

test('partial detail renders allowed rows and PDF links with deterministic nonduplicated warning',()=>{
 const calls=[{name:'get_invoices',result:{page:1,totalPages:1,totalRows:1,totalInvoices:1,hasRestrictedData:true,data:[{invoiceNumber:'ALLOWED',pdfUrl:'https://pdf.example.test/allowed',amount:10}]}}];
 const text=buildInvoiceDetailResponse(calls);assert.match(text,/ALLOWED/);assert.match(text,/Ver PDF/);assert.ok(text.includes(INVOICE_PARTIAL_ACCESS_MESSAGE));assert.equal(appendInvoiceAccessWarning(text,calls),text);
 assert.equal(appendInvoiceAccessWarning('Summary',calls),'Summary\n\n'+INVOICE_PARTIAL_ACCESS_MESSAGE);assert.equal(appendInvoiceAccessWarning('Empty',[]),'Empty');
});

for(const scenario of ['customer-denied','invoice-denied','mixed-access'])test('chat '+scenario+' preserves authorization wording without model invocation',()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoiceNamedRequest.mjs',import.meta.url)),scenario,'false'],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_NAMED_PASS/);
});

for(const scenario of ['denied','mixed'])test('HTTP authorization '+scenario+' preserves the response contract and session-scoped filters',()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoicePlatePdfHttp.mjs',import.meta.url)),scenario],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_HTTP_PASS/);
});
