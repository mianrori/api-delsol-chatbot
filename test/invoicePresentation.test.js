import test from 'node:test';import assert from 'node:assert/strict';
import {buildInvoiceBalanceResponse} from '../src/services/ai/invoiceBalancePresentation.service.js';
import {buildInvoiceDetailResponse,appendInvoiceAccessWarning,INVOICE_PARTIAL_PRESENTATION_MESSAGE} from '../src/services/ai/invoiceDetailPresentation.service.js';
import {invoiceCurrencyLabel} from '../src/services/ai/invoicePresentation.service.js';
const row={invoiceSeries:'A-01',invoiceNumber:'000123',customerId:'PRIVATE-C1',customerName:'Tienda Uno',businessName:'Sociedad Privada SA',taxId:'PRIVATE-RUC',sector:'Local',dueDate:'01/11/2026',dueStatus:'overdue',daysOverdue:700,currencyCode:'INTERNAL-M1',currencySymbol:'PYG',debt:'1234.50',debtState:'pending'};
const result=(changes={})=>({status:'OK_DETAIL_ONLY',mode:'detail',data:[{...row}],queryContext:{customerIds:['PRIVATE-C1'],debtStatus:'pending'},matchedCustomers:1,page:1,rows:20,totalRows:541,totalPages:28,returnedRows:1,hasMore:true,nextPage:2,duplicateRows:0,missingIdentityRows:0,unknownDebtRows:0,invalidDueDateRows:0,...changes});
const balance=(r,options={})=>buildInvoiceBalanceResponse([{name:'get_invoice_balances',result:r}],options);
const header=text=>text.split('\n').find(l=>l.startsWith('| '));
test('pending detail starts with the result, identifies one scoped customer once and shows useful columns',()=>{
 const r=result({data:Array.from({length:20},(_,i)=>({...row,invoiceNumber:'F'+i})),returnedRows:20}),before=structuredClone(r),text=balance(r);
 assert.ok(text.startsWith('Estas son las facturas pendientes de pago de Tienda Uno.'));assert.equal((text.match(/Tienda Uno/g)??[]).length,1);
 assert.equal(header(text),'| Serie | Número | Vencimiento | Moneda | Deuda |');assert.equal(text.split('\n').filter(l=>l.startsWith('| ')).length,22);
 assert.match(text,/1\.234,50/);assert.match(text,/Mostrando 20 de 541 registros\. Página 1 de 28\. Podés pedir la siguiente página\./);
 assert.doesNotMatch(text,/DEUDA|INTERNAL-M1|PRIVATE|RUC|Razón social|pares|clasificados|No se suman|histórico|facturas distintas/);assert.deepEqual(r,before);
});
test('a page showing one customer does not establish a single-customer result',()=>{
 const text=balance(result({matchedCustomers:2,queryContext:{debtStatus:'pending',customerIds:[]}}));assert.match(header(text),/Cliente/);assert.ok(!text.startsWith('Estas son las facturas pendientes de pago de Tienda Uno'));
});
test('missing customer identity never collapses rows with coincident names',()=>{
 assert.match(header(balance(result({data:[{...row,customerId:null}],matchedCustomers:1}))),/Cliente/);
});
test('settled debt shows due date without implying current arrears or payment date',()=>{
 const r=result({queryContext:{customerIds:['PRIVATE-C1'],debtStatus:'settled'},data:[{...row,debt:'0',debtState:'settled'}]});
 const text=balance(r,{message:'facturas pagadas y sus días de atraso'});assert.match(text,/facturas con deuda cancelada de Tienda Uno/);assert.match(text,/01\/11\/2026/);assert.match(text,/0,00/);
 assert.doesNotMatch(text,/Vencida|Días de atraso|700|fecha de pago|anulada/);assert.equal(header(text),'| Serie | Número | Vencimiento | Moneda | Deuda |');
});
test('current and historical debt are explained only when the question could confuse them',()=>{
 assert.doesNotMatch(balance(result()),/actual|histórico|fecha pasada/);
 assert.match(balance(result(),{message:'saldo al 31/12/2023'}),/es la actual; no reconstruye el saldo de una fecha pasada/);
 assert.match(balance(result(),{message:'¿cuándo se pagó esta factura?'}),/No tengo la fecha de pago/);
});
test('mixed debt states do not turn settled or unknown debt into current arrears',()=>{
 const text=balance(result({queryContext:{debtStatus:'all'},data:[row,{...row,invoiceNumber:'CERO',debt:'0',debtState:'settled'},{...row,invoiceNumber:'NULL',debt:null,debtState:'unknown'}],unknownDebtRows:1}),{message:'mostrar mora y vencidas'});
 assert.equal((text.match(/Vencida/g)??[]).length,1);assert.equal((text.match(/700/g)??[]).length,1);assert.match(text,/No informada/);assert.match(text,/no se consideran saldados/);
});
test('duplicate warnings are brief, conditional and retain every row without totals',()=>{
 const text=balance(result({data:[row,{...row}],duplicateRows:2,warning:'Hay registros históricos inconsistentes: se conserva el detalle sin deduplicar; no se calculan totales, rankings ni conteos de facturas.'}));
 assert.equal((text.match(/000123/g)??[]).length,2);assert.match(text,/Hay registros históricos duplicados; por eso no puedo calcular un total confiable\./);assert.equal((text.match(/total confiable/g)??[]).length,1);
 assert.doesNotMatch(balance(result()),/duplicados|total confiable|no se calculan/);
});
test('missing data warnings remain relevant and blocked summaries never render partial totals',()=>{
 const text=balance(result({status:'INCONSISTENT_HISTORY',mode:'summary',data:[{debt:'999999'}],missingCurrencyRows:1}));assert.match(text,/Falta identificar la moneda/);assert.doesNotMatch(text,/999999|\|/);
 assert.match(balance(result({invalidDueDateRows:1,data:[{...row,dueDate:null}]})),/no tienen un vencimiento válido/);
});
test('commercial currency labels use reported evidence without mapping internal codes or an isolated dollar sign',()=>{
 assert.equal(invoiceCurrencyLabel({currencyCode:'001',currencySymbol:'PYG'}),'Gs.');assert.equal(invoiceCurrencyLabel({currencyCode:'USD',currencySymbol:'$'}),'USD');
 assert.equal(invoiceCurrencyLabel({currencyCode:'INTERNAL-2',currencySymbol:'$'}),'$ (moneda no identificada)');assert.equal(invoiceCurrencyLabel({currencyCode:'INTERNAL-2'}),'Moneda no informada');
 assert.equal(invoiceCurrencyLabel({currencyCode:'EUR',currencySymbol:'€'}),'EUR');assert.equal(invoiceCurrencyLabel({currencyCode:'USD',currencySymbol:'Gs.'}),'Moneda no informada');
 const text=balance(result({data:[{...row,currencyCode:'M1',currencySymbol:'$'}]}));assert.doesNotMatch(text,/USD|M1|Guaran/);
});
test('a partial page in one currency does not assert absence in others',()=>{
 const text=balance(result());assert.match(text,/Gs\./);assert.doesNotMatch(text,/no hay.*(?:moneda|dólar)|solo.*Gs|única moneda|otras monedas/);
});
test('business identity and extra fields appear only when explicitly requested',()=>{
 const normal=balance(result());assert.doesNotMatch(normal,/Sociedad Privada|PRIVATE-RUC|Sector/);
 const requested=balance(result(),{message:'incluí razón social, RUC y sector'});assert.match(requested,/Razón social/);assert.match(requested,/Sociedad Privada/);assert.match(requested,/PRIVATE-RUC/);assert.match(requested,/Sector/);
});
test('clean summary preserves supplied calculations and uses commercial labels without technical grouping names',()=>{
 const r=result({status:'OK_SUMMARY',mode:'summary',monetaryAggregationAvailable:true,invoiceCount:3,queryContext:{groupBy:['invoice']},data:[{currencyCode:'PYG',invoiceSeries:'A',invoiceNumber:'1',invoiceCount:2,debt:'100.00',currencyRank:1},{currencyCode:'USD',invoiceSeries:'B',invoiceNumber:'1',invoiceCount:1,debt:'50.50',currencyRank:1}],totalRows:2,totalPages:1,hasMore:false});
 const before=structuredClone(r),text=balance(r);assert.match(text,/Gs\./);assert.match(text,/USD/);assert.match(text,/100,00/);assert.match(text,/50,50/);assert.match(header(text),/Serie \| Número \| Facturas \| Deuda/);assert.doesNotMatch(text,/Moneda \(código\)|invoice|serie\/número|Posición/);assert.deepEqual(r,before);
});
test('zero and out-of-range pages state only the absence actually established',()=>{
 const empty=balance(result({data:[],returnedRows:0,totalRows:0,totalPages:0,hasMore:false,queryContext:{debtStatus:'settled'}}));assert.ok(empty.startsWith('No encontré facturas con deuda cancelada'));assert.match(empty,/Mostrando 0 de 0 registros\./);assert.doesNotMatch(empty,/Página 1 de 0|siguiente|\|/);
 const outside=balance(result({data:[],page:99,hasMore:false}));assert.ok(outside.startsWith('No hay registros en esta página'));assert.doesNotMatch(outside,/No encontré facturas|siguiente página/);
});
test('settled summaries keep supplied groups without presenting current arrears',()=>{
 const r=result({status:'OK_SUMMARY',mode:'summary',queryContext:{debtStatus:'settled',groupBy:['dueStatus','agingBand']},data:[{currencyCode:'PYG',dueStatus:'overdue',agingBand:'31-60',debt:'0.00'}]});
 const before=structuredClone(r),text=balance(r);assert.match(text,/Anterior a la referencia/);assert.match(text,/Antigüedad del vencimiento/);assert.match(text,/31-60/);assert.match(text,/no indica mora actual ni la fecha de pago/);assert.doesNotMatch(text,/Vencida|Días de atraso/);assert.deepEqual(r,before);
 for(const agingBand of ['notDue','dueToday','undated']){const output=balance({...r,data:[{...r.data[0],agingBand}]});assert.doesNotMatch(output,/notDue|dueToday|undated/);assert.match(output,/referencia|No informado/);}
});
const invoice={invoiceNumber:'SER-0001',issueDate:'2026-11-01',dueDate:'2026-12-01',customer:{customerId:'C1',name:'Tienda Uno',businessName:'Sociedad Privada',taxId:'PRIVATE-RUC'},concept:{description:'Alquiler'},contract:{series:'NOT-INVOICE-SERIES',number:'99'},currencySymbol:'PYG',amount:0,cancelled:false,pdfUrl:'https://pdf.example.test/a (1).pdf'};
const detail=(changes={},options={})=>buildInvoiceDetailResponse([{name:'get_invoices',input:{customerIds:['C1']},result:{page:1,totalPages:28,totalRows:541,totalInvoices:400,hasMore:true,data:[invoice,{...invoice,invoiceNumber:'SER-0002',pdfUrl:null}],...changes}}],options);
test('general invoices retain full identifiers and authorized PDFs while reducing repeated identity and unused columns',()=>{
 const text=detail();assert.ok(text.startsWith('Estas son las facturas solicitadas de Tienda Uno.'));assert.equal((text.match(/Tienda Uno/g)??[]).length,1);
 assert.equal(header(text),'| Factura | Emisión | Concepto | Vencimiento | Moneda | Importe | PDF |');assert.match(text,/SER-0001/);assert.match(text,/Gs\./);assert.match(text,/\[Ver PDF\]\(<https:\/\/pdf.example.test\/a%20\(1\).pdf>\)/);
 assert.doesNotMatch(text,/NOT-INVOICE-SERIES|Razón social|PRIVATE-RUC|Matrícula|Anulada|400 facturas|facturas distintas/);assert.match(text,/Mostrando 2 de 541 registros/);
});
test('provided invoice series is retained but never inferred from contract references',()=>{
 const text=detail({data:[{...invoice,invoiceSeries:'FACT-SERIE'}]});assert.match(header(text),/Serie \| Número/);assert.match(text,/FACT-SERIE/);assert.doesNotMatch(text,/NOT-INVOICE-SERIES/);
});
test('general invoice extra fields are useful on explicit request and annulment stays separate',()=>{
 const text=detail({data:[{...invoice,cancelled:true,plate:'AB123',period:'11/2026'}]},{message:'mostrar contrato, matrícula, período, razón social y RUC'});for(const v of ['Contrato','Matrícula','Período','Razón social','RUC','Anulada','NOT-INVOICE-SERIES'])assert.ok(text.includes(v));
});
test('general first page alone does not hide the customer column for an unrestricted multi-client result',()=>{
 const text=buildInvoiceDetailResponse([{name:'get_invoices',input:{},result:{page:1,totalRows:100,totalPages:5,data:[invoice]}}]);assert.match(header(text),/Cliente/);assert.ok(!text.startsWith('Estas son las facturas solicitadas de Tienda Uno'));
});
test('partial access warning is brief and idempotent without changing the permission signal',()=>{
 const calls=[{name:'get_invoices',result:{hasRestrictedData:true}}],text=appendInvoiceAccessWarning('Resultado.',calls);assert.match(text,/tenés permiso para consultar/);assert.equal(appendInvoiceAccessWarning(text,calls),text);assert.equal((text.match(/Solo puedo mostrar/g)??[]).length,1);assert.equal(appendInvoiceAccessWarning('Resultado.',[]),'Resultado.');assert.ok(text.includes(INVOICE_PARTIAL_PRESENTATION_MESSAGE));
});
test('untrusted cells remain escaped and failed results never become tables',()=>{
 const text=balance(result({data:[{...row,customerName:'Local | <script>\nOtra fila'}]}));assert.match(text,/Local \\\| \\<script\\>/);assert.equal(text.split('\n').filter(l=>l.startsWith('| ')).length,3);
 assert.equal(balance(result({success:false,error:'PRIVATE'})),null);assert.equal(detail({success:false}),null);
});
