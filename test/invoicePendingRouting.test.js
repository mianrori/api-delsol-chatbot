import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isPendingInvoiceRequest,pendingInvoiceInput,executePendingInvoiceRequest} from '../src/services/ai/invoicePendingRequest.service.js';
import {preserveSearchSelection,beginSearchSelectionTurn,recordSearchToolResult} from '../src/services/ai/searchSelection.service.js';
import * as store from '../src/state/conversation.store.js';

test('pending expressions and original question are balance intents',()=>{
 for(const text of ['facturas pendientes','pendientes de pago','cuánto debe','solo las pendientes','¿Qué facturas pendientes de pago tiene Impacto?'])assert.equal(isPendingInvoiceRequest(text),true,text);
 for(const text of ['facturas de Impacto','facturas canceladas','ventas pendientes'])assert.equal(isPendingInvoiceRequest(text),false,text);
});
test('billing customer survives without incompatible or stale balance scope',()=>{
 const state={invoiceLastTool:'get_invoices',domains:{search_invoice_balance_customers:{kind:'resolved',selected:{customerId:'OLD'}}},contexts:{get_invoices:{customerIds:['CONFIRMED'],conceptIds:['RENT'],plate:'ABC123',dateFrom:'01/01/2023',dateTo:'31/12/2023',mode:'summary',page:5},get_invoice_balances:{customerIds:['OLD'],debtStatus:'settled',dueStatus:'overdue',invoiceNumbers:['OLD']}}};
 const expected={customerIds:['CONFIRMED'],mode:'detail',debtStatus:'pending',page:1,rows:20};
 assert.deepEqual(pendingInvoiceInput(state),expected);
 assert.deepEqual(preserveSearchSelection({name:'get_invoice_balances',input:expected,resolutionState:state,selectionTurn:{pendingInvoice:true}}),expected);
 assert.throws(()=>pendingInvoiceInput({...state,domains:{search_invoice_customers:{kind:'pending'}}}),{code:'SEARCH_SELECTION_REQUIRED'});
});
test('pending routing through HTTP inspects executed tools, arguments, SQL and presentation',()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoicePendingRoutingHttp.mjs',import.meta.url))],{encoding:'utf8',timeout:25000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_PENDING_HTTP_PASS/);
});
test('unresolved billing customer blocks widening; a fresh pending customer supersedes it',async()=>{
 const id='PENDING-UNRESOLVED';
 try{
  recordSearchToolResult(id,'search_invoice_customers',{query:'old',dateFrom:'01/01/2023'},{status:'AMBIGUOUS',options:[{option:1,customerId:'A'},{option:2,customerId:'B'}]});
  assert.throws(()=>pendingInvoiceInput(store.getSearchResolutions(id)),{code:'SEARCH_SELECTION_REQUIRED'});
  const state=store.getSearchResolutions(id);state.invoiceNamedRequest={phase:'customerPending'};store.setSearchResolutions(id,state);
  beginSearchSelectionTurn(id,'facturas pendientes');assert.equal(store.getSearchResolutions(id).invoiceNamedRequest,undefined);
  const called=[];
  await executePendingInvoiceRequest({sessionId:id,message:'¿Qué facturas pendientes de pago tiene Impacto?',execute:async(name,input)=>{called.push({name,input});return name.startsWith('search_')?{status:'RESOLVED',customerId:'NEW'}:{data:[]};}});
  assert.equal(called[1].name,'get_invoice_balances');assert.deepEqual(called[1].input.customerIds,['NEW']);
 }finally{store.clearConversation(id);}
});
