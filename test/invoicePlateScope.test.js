import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {getInvoicePlateRequest} from '../src/services/ai/invoicePlateRequest.service.js';
import {beginSearchSelectionTurn,preserveSearchSelection,recordInvoiceQueryContext} from '../src/services/ai/searchSelection.service.js';
import * as store from '../src/state/conversation.store.js';

test('complete plate request owns its scope and additive wording preserves it',()=>{
 assert.deepEqual(getInvoicePlateRequest('facturas de la matr\u00edcula anx123'),{autonomous:true,input:{plate:'ANX123',mode:'detail',page:1,rows:20}});
 assert.deepEqual(getInvoicePlateRequest('facturas de la matricula an-x 123 del 2024').input,{plate:'ANX123',dateFrom:'01/01/2024',dateTo:'31/12/2024',mode:'detail',page:1,rows:20});
 assert.equal(getInvoicePlateRequest('filtra tambi\u00e9n por matr\u00edcula anx123').autonomous,false);
 for(const text of ['facturas de arrendamiento minimo del 2023 del local impacto','siguiente pagina','facturas de la matricula anterior','filtra por concepto'])assert.equal(getInvoicePlateRequest(text),null);
});

for(const scenario of ['allowed','denied','empty','followup'])for(const trimmed of [false,true])test(`denied named query then plate ${scenario}; history trimmed=${trimmed}`,()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoicePlateScope.mjs',import.meta.url)),scenario,String(trimmed)],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_PLATE_SCOPE_PASS/);
});

test('autonomous scope rejects stale model filters; later pagination uses only persisted effective scope',()=>{
 const id='SYNTHETIC-PLATE-GUARD';try{
  beginSearchSelectionTurn(id,'facturas de la matricula anx123');
  const input=preserveSearchSelection({name:'get_invoices',input:{plate:'WRONG',customerIds:['OLD'],conceptIds:['OLD'],dateFrom:'01/01/2023',cancelled:true},history:[{role:'user',content:[{text:'facturas de la matricula anx123'}]}],resolutionState:store.getSearchResolutions(id),selectionTurn:store.getSearchSelectionTurn(id)});
  assert.deepEqual(input,{plate:'ANX123',mode:'detail',page:1,rows:20});recordInvoiceQueryContext(id,'get_invoices',input);
  beginSearchSelectionTurn(id,'siguiente pagina');const next=preserveSearchSelection({name:'get_invoices',input:{page:2},resolutionState:store.getSearchResolutions(id),selectionTurn:store.getSearchSelectionTurn(id)});assert.deepEqual(next,{...input,page:2});
 }finally{store.clearConversation(id);}
});

for(const scenario of ['allowed','denied','empty','followup'])for(const trimmed of [false,true])test('HTTP denied then plate '+scenario+'; trimmed='+trimmed,()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoicePlateScope.mjs',import.meta.url)),scenario,String(trimmed),'http'],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_PLATE_SCOPE_PASS/);
});
