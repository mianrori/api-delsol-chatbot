import test from 'node:test';
import assert from 'node:assert/strict';
import {getInvoiceBalances,searchInvoiceBalanceCustomers,normalizeInvoiceBalanceArgs} from '../src/services/invoices/invoiceBalances.service.js';
import {protectPiiDeep,protectPiiText,restorePiiDeep,restorePiiTextForUser} from '../src/services/ai/pii.service.js';
import {buildInvoiceBalanceResponse,resolveInvoiceBalancePage} from '../src/services/ai/invoiceBalancePresentation.service.js';
import {preserveSearchSelection,beginSearchSelectionTurn,recordSearchToolResult,recordInvoiceQueryContext} from '../src/services/ai/searchSelection.service.js';
import * as store from '../src/state/conversation.store.js';
import {clearPiiSession} from '../src/state/pii.store.js';
import {tools} from '../src/tools/index.js';

const fake=(...rows)=>({queries:[],async execute(sql,binds){this.queries.push({sql,binds});return {rows:rows.shift()??[]};}});
const totals=[{TOTAL_ROWS:4,DISTINCT_INVOICE_NUMBERS:3,DISTINCT_CUSTOMERS:1,UNKNOWN_BALANCE_ROWS:1,INVALID_DUE_DATE_ROWS:1}];
const row={NRO_FACTURA:'F-PRIVATE',COD_CLIENTE:'C-PRIVATE',NOM_CLIENTE:'TIENDA PRIVADA',RAZON_SOCIAL:'SOCIEDAD PRIVADA',RUC:'80001234-5',COD_MONEDA:'M1',SIMBOLO_MONEDA:'PYG',DEUDA:90,DUE_DATE:new Date('2026-10-01'),VENCIMIENTO:'01/10/2026',DUE_STATUS:'overdue',DAYS_OVERDUE:42,AGING_BAND:'31-60'};

test('detail keeps currencies/signs/null balances, global filtered totals and pagination distinct',async()=>{
 const c=fake(totals,[row,{...row,NRO_FACTURA:'F-NULL',DEUDA:null,DUE_DATE:null,VENCIMIENTO:'31/02/2026'}]);
 const r=await getInvoiceBalances({customerIds:['C1'],invoiceNumbers:["F'1"],sectors:['LOCAL'],currencies:['PYG'],dueDateFrom:'01/01/2026',dueDateTo:'31/12/2026',asOfDate:'12/11/2026',balanceStatus:'positive',dueStatus:'overdue',minDaysOverdue:30,maxDaysOverdue:90,page:2,rows:2},c);
 assert.equal(r.totalRows,4);assert.equal(r.totalPages,2);assert.equal(r.page,2);assert.equal(r.hasMore,false);assert.equal(r.returnedRows,2);assert.equal(r.data[1].debt,null);assert.equal(r.data[1].dueDate,null);assert.equal(r.data[1].dueDateRaw,undefined);
 assert.equal(r.monetaryAggregationAvailable,false);assert.equal(r.totalsByCurrency,undefined);assert.equal(r.data[0].debt,'90');
 for(const q of c.queries){assert.match(q.sql,/VW_BOT_FACTURAS_SALDOS/);assert.doesNotMatch(q.sql,/USER_CAN_CONSULT|VW_BOT_FACTURAS\b|\bUPDATE\b|\bDELETE\b|\bINSERT\b/);assert.equal(q.binds.invoiceNumbers0,"F'1");assert.ok(!q.sql.includes("F'1"));assert.equal(q.binds.asOfDate,'12/11/2026');assert.match(q.sql,/DUE_DATE <= TO_DATE\(:dueDateTo/);}
 assert.deepEqual(c.queries[1].binds,{...c.queries[0].binds,offset:2,maxRow:4});
 assert.match(c.queries[0].sql,/CASE WHEN REGEXP_LIKE[\s\S]+CASE WHEN SUBSTR[\s\S]+CASE WHEN SUBSTR[\s\S]+THEN TO_DATE/);
 assert.equal(r.queryContext.page,2);assert.equal(r.balanceBasis,'currentViewSnapshot');
 assert.equal(r.matchedCustomers,1);assert.equal(r.matchedInvoiceNumbers,3);
 assert.match(c.queries[0].sql,/COUNT\(DISTINCT COD_CLIENTE\)/);
});

for(const args of [{mode:'summary'},{mode:'summary',groupBy:['customer']},{mode:'summary',groupBy:['invoice']},{mode:'summary',groupBy:['sector']},{mode:'summary',groupBy:['dueMonth']},{mode:'summary',groupBy:['dueStatus']},{mode:'summary',groupBy:['agingBand']},{orderBy:'balanceDesc'},{orderBy:'balanceAsc'},{minBalance:1},{maxBalance:10}])test('unverified source identities block monetary aggregation/ranking '+JSON.stringify(args),async()=>{
 const c=fake([]);const r=await getInvoiceBalances(args,c);assert.equal(r.status,'REQUIRES_SOURCE_IDENTITY');assert.equal(r.data,undefined);assert.equal(c.queries.length,1);assert.match(c.queries[0].sql,/WHERE 1=0/);assert.doesNotMatch(c.queries[0].sql,/SUM|ORDER BY|USER_CAN_CONSULT/);
});

test('absence, authorized zero and out-of-range pages are not access denial',async()=>{
 const empty=await getInvoiceBalances({},fake([],[]));assert.equal(empty.totalRows,0);
 const zero=await getInvoiceBalances({},fake([{TOTAL_ROWS:1,CURRENCY_SYMBOL:'PYG',TOTAL_BALANCE:0}],[{...row,DEUDA:0}]));assert.equal(zero.data[0].debt,'0');assert.equal(zero.totalRows,1);
 const page=await getInvoiceBalances({page:3,rows:1},fake([{TOTAL_ROWS:1,CURRENCY_SYMBOL:'PYG'}],[]));assert.equal(page.totalRows,1);assert.equal(page.returnedRows,0);
 const denied=Object.assign(Error('denied'),{errorNum:1031});await assert.rejects(getInvoiceBalances({}, {execute:async()=>{throw denied;}}),e=>e===denied);
});

test('invalid or unsupported filters never execute SQL or silently broaden scope',async()=>{
 for(const args of [{username:'OTHER'},{plate:'ABC123'},{dateFrom:'01/01/2026'},{dueDateFrom:'31/02/2026'},{dueDateFrom:'2026-01-01'},{asOfDate:'00/01/2026'},{asOfDate:'01/01/0000'},
  {dueDateFrom:'02/01/2026',dueDateTo:'01/01/2026'},{customerIds:'C1'},{customerIds:['']},{invoiceNumbers:[1]},{mode:'bad'},{groupBy:['customer']},{mode:'summary',groupBy:['DEUDA) FROM X']},{mode:'summary',orderBy:'dueDateAsc'},{rows:101},{page:0},{minBalance:Infinity},{minBalance:2,maxBalance:1},{minDaysOverdue:-1},{minDaysOverdue:3,maxDaysOverdue:2}]){
  const c=fake();await assert.rejects(getInvoiceBalances(args,c),undefined,JSON.stringify(args));assert.equal(c.queries.length,0);
 }
 assert.equal(normalizeInvoiceBalanceArgs({asOfDate:'29/02/2024'}).asOfDate,'29/02/2024');
 assert.match(normalizeInvoiceBalanceArgs({}).asOfDate,/^\d{2}\/\d{2}\/\d{4}$/);
});

test('balance customer resolution stays on same view, is bounded, handles ambiguity and exact matches',async()=>{
 const c=fake([{COD_CLIENTE:'C1',CUSTOMER_NAME:'Tienda',PRIORITY:0},{COD_CLIENTE:'C2',CUSTOMER_NAME:'Otra Tienda',PRIORITY:1}]);
 const r=await searchInvoiceBalanceCustomers({query:'Tíenda'},c);assert.equal(r.status,'RESOLVED');assert.equal(r.customerId,'C1');assert.equal(c.queries[0].binds.query,'TIENDA');assert.match(c.queries[0].sql,/ROWNUM<=21/);assert.doesNotMatch(c.queries[0].sql,/VW_BOT_CLIENTES|USER_CAN_CONSULT/);
 const many=await searchInvoiceBalanceCustomers({query:'Tienda'},fake(Array.from({length:21},(_,i)=>({COD_CLIENTE:'C'+i,PRIORITY:0}))));assert.equal(many.status,'AMBIGUOUS');assert.equal(many.hasMore,true);assert.equal(many.options.length,20);
 const no=await searchInvoiceBalanceCustomers({query:'Nada'},fake([]));assert.equal(no.status,'NOT_FOUND');
 const invalid=fake();await assert.rejects(searchInvoiceBalanceCustomers({query:'!!!'},invalid));assert.equal(invalid.queries.length,0);
});

test('PII protects model results and argument arrays, restores only within matching session',async()=>{
 const id='BALANCE-PII';try{
  const r=await getInvoiceBalances({},fake(totals,[row]));const protectedR=protectPiiDeep(id,r,null,['get_invoice_balances']);
  for(const v of ['F-PRIVATE','C-PRIVATE','TIENDA PRIVADA','SOCIEDAD PRIVADA','80001234-5'])assert.ok(!JSON.stringify(protectedR).includes(v));
  assert.equal(protectedR.data[0].debt,'90');assert.equal(protectedR.totalsByCurrency,undefined);assert.deepEqual(restorePiiDeep(id,protectedR),r);
  const args=protectPiiDeep(id,{customerIds:['C-PRIVATE'],invoiceNumbers:['F-PRIVATE']});assert.match(args.customerIds[0],/^\[PII_CUSTOMER_ID_/);assert.match(args.invoiceNumbers[0],/^\[PII_INVOICE_NUMBER_/);assert.equal(restorePiiDeep('OTHER-BALANCE',args).customerIds[0],args.customerIds[0]);
  assert.doesNotMatch(protectPiiText(id,'Saldo de Tienda Secreta al 12/11/2026'),/Tienda Secreta/);
  assert.doesNotMatch(protectPiiText(id,'Cuánto debe Tienda Secreta'),/Tienda Secreta/);
  assert.match(protectPiiText(id,'Saldo de facturas vencidas'),/facturas vencidas/);
  assert.doesNotMatch(protectPiiText(id,'Saldo de la factura 001-001-1234567'),/001-001-1234567/);
 }finally{clearPiiSession(id);clearPiiSession('OTHER-BALANCE');}
});

test('presentation renders full detail and per-currency totals without internal IDs, guessing or PDFs; followup preserves scope',async()=>{
 const r=await getInvoiceBalances({rows:1,customerIds:['C1'],asOfDate:'12/11/2026'},fake(totals,[row]));
 const text=buildInvoiceBalanceResponse([{name:'get_invoice_balances',result:r}]);assert.match(text,/F-PRIVATE/);assert.match(text,/TIENDA PRIVADA/);assert.match(text,/PYG/);assert.match(text,/no se suman importes/);assert.match(text,/no reconstruyen un saldo histórico/);assert.doesNotMatch(text,/C-PRIVATE|Ver PDF/);
 const history=[{role:'assistant',content:[{toolUse:{name:'get_invoice_balances',toolUseId:'b',input:{}}}]},{role:'user',content:[{toolResult:{toolUseId:'b',status:'success',content:[{json:r}]}}]}];
 assert.deepEqual(resolveInvoiceBalancePage({message:'siguiente página',history}).input,{...r.queryContext,page:2});
 assert.equal(resolveInvoiceBalancePage({message:'saldo general',history}),null);
 assert.equal(resolveInvoiceBalancePage({message:'siguiente',history:[...history,{content:[{toolUse:{name:'get_invoices',toolUseId:'other'}}]}]}),null);
});

test('ambiguous balance customer cannot be bypassed by proposing an ID; numbered choice owns the customer',()=>{
 const result={status:'AMBIGUOUS',options:[{option:1,customerId:'C1'},{option:2,customerId:'C2'}]};
 const history=[{role:'assistant',content:[{toolUse:{name:'search_invoice_balance_customers',toolUseId:'s',input:{query:'A'}}}]},{role:'user',content:[{toolResult:{toolUseId:'s',status:'success',content:[{json:result}]}}]}];
 assert.throws(()=>preserveSearchSelection({name:'get_invoice_balances',input:{customerIds:['INVENTED']},history}),e=>e.code==='SEARCH_SELECTION_REQUIRED');
 assert.deepEqual(preserveSearchSelection({name:'get_invoice_balances',input:{customerIds:['INVENTED']},history:[...history,{role:'user',content:[{text:'2'}]}]}).customerIds,['C2']);
 assert.ok(tools.some(t=>t.toolSpec.name==='get_invoice_balances'));assert.ok(tools.some(t=>t.toolSpec.name==='search_invoice_balance_customers'));
});

test('protected balance selection survives trimmed history and an explicit all-customer request clears its old scope',()=>{
 const id='BALANCE-SELECTION';try{
  recordSearchToolResult(id,'search_invoice_balance_customers',{query:'[PII_SEARCH_TERM_1]'},{status:'AMBIGUOUS',options:[{option:1,customerId:'C1',customerName:'A'},{option:2,customerId:'C2',customerName:'B'}]});
  beginSearchSelectionTurn(id,'2');
  const input=preserveSearchSelection({name:'get_invoice_balances',input:{customerIds:['FORGED'],dueStatus:'overdue'},resolutionState:store.getSearchResolutions(id),selectionTurn:store.getSearchSelectionTurn(id)});
  assert.deepEqual(input.customerIds,['C2']);recordInvoiceQueryContext(id,'get_invoice_balances',input);
  beginSearchSelectionTurn(id,'saldo general del local Tienda');assert.equal(store.getSearchSelectionTurn(id).invoiceBalanceAll,false);
  const allText=protectPiiText(id,'saldos de todos los clientes');assert.equal(allText,'saldos de todos los clientes');beginSearchSelectionTurn(id,allText);
  const general=preserveSearchSelection({name:'get_invoice_balances',input:{mode:'summary'},resolutionState:store.getSearchResolutions(id),selectionTurn:store.getSearchSelectionTurn(id)});
  assert.deepEqual(general,{mode:'summary',customerIds:[]});
 }finally{store.clearConversation(id);clearPiiSession(id);}
});

test('large decimal balances preserve cents without binary floating point conversion',async()=>{
 const r=await getInvoiceBalances({},fake([{TOTAL_ROWS:1,DISTINCT_INVOICE_NUMBERS:1,DISTINCT_CUSTOMERS:1}],[{...row,DEUDA:'9999999999999999.99'}]));
 assert.equal(r.data[0].debt,'9999999999999999.99');
 const text=buildInvoiceBalanceResponse([{name:'get_invoice_balances',result:r}]);assert.ok(text.includes('9.999.999.999.999.999,99'));
});

test('monetary row ordering requires exactly one native currency code, never a shared symbol',async()=>{
 const c=fake([{TOTAL_ROWS:1}],[row]);const r=await getInvoiceBalances({currencyCodes:['M1'],orderBy:'balanceDesc'},c);
 assert.equal(r.data[0].currencyCode,'M1');assert.equal(r.data[0].debt,'90');assert.equal(c.queries[1].binds.currencyCodes0,'M1');
 assert.match(c.queries[1].sql,/COD_MONEDA IN \(:currencyCodes0\)/);assert.match(c.queries[1].sql,/ORDER BY COD_MONEDA, DEUDA DESC NULLS LAST/);
 for(const scope of [{currencies:['$']},{currencyCodes:['M1','M2']}])assert.equal((await getInvoiceBalances({...scope,orderBy:'balanceDesc'},fake([]))).status,'REQUIRES_SOURCE_IDENTITY');
 assert.equal((await getInvoiceBalances({currencyCodes:['M1'],mode:'summary',groupBy:['customer']},fake([]))).status,'REQUIRES_SOURCE_IDENTITY');
});

test('same displayed symbol never collapses two native currencies or sums their debts',async()=>{
 const r=await getInvoiceBalances({},fake([{TOTAL_ROWS:2}],[{...row,COD_MONEDA:'M1',SIMBOLO_MONEDA:'$',DEUDA:'10.01'},{...row,COD_MONEDA:'M2',SIMBOLO_MONEDA:'$',DEUDA:'20.02'}]));
 assert.deepEqual(r.data.map(x=>[x.currencyCode,x.currencySymbol,x.debt]),[['M1','$','10.01'],['M2','$','20.02']]);assert.equal(r.totalsByCurrency,undefined);
 const text=buildInvoiceBalanceResponse([{name:'get_invoice_balances',result:r}]);assert.match(text,/M1/);assert.match(text,/M2/);assert.ok(!text.includes('30,03'));
});
