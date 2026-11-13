import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {preserveSearchSelection,recordSearchToolResult,recordInvoiceQueryContext} from '../src/services/ai/searchSelection.service.js';
import {getSearchResolutions,setSearchResolutions,clearConversation} from '../src/state/conversation.store.js';
import {stripInternalReasoning,publicAssistantText,SAFE_ASSISTANT_RESPONSE} from '../src/services/ai/assistantOutput.service.js';
const global={customerIds:[],debtStatus:'pending',mode:'summary',groupBy:[],page:1,rows:20};
const usd={...global,currencyCodes:['AUTHORIZED-USD'],mode:'detail',orderBy:'dueDateAsc'};
const lookup=id=>[
 {role:'assistant',content:[{toolUse:{toolUseId:'lookup-'+id,name:'search_invoice_balance_customers',input:{query:'Synthetic '+id}}}]},
 {role:'user',content:[{toolResult:{toolUseId:'lookup-'+id,status:'success',content:[{json:{status:'RESOLVED',customerId:id,customerName:'Synthetic '+id}}]}}]},
];
const history=[{role:'user',content:[{text:'facturas pendientes de Tienda Previa'}]},...lookup('OLD'),{role:'user',content:[{text:'Deudas pendientes total de todos los clientes por monedas hasta la fecha'}]},{role:'assistant',content:[{toolUse:{toolUseId:'global-query',name:'get_invoice_balances',input:global}}]},{role:'user',content:[{toolResult:{toolUseId:'global-query',status:'success',content:[{json:{status:'OK_SUMMARY',mode:'summary',data:[],queryContext:global}}]}}]},{role:'user',content:[{text:'Detalla las que son en dólares'}]}];
test('confirmed all-customer scope outranks old history and unsolicited IDs, even after trimming',()=>{
 for(const h of [history,[]])for(const proposal of [usd,{...usd,customerIds:['OLD']}]){
  const resolutionState={domains:{},contexts:{get_invoice_balances:global},invoiceLastTool:'get_invoice_balances'},before=structuredClone(resolutionState);
  const effective=preserveSearchSelection({name:'get_invoice_balances',input:proposal,history:h,resolutionState,selectionTurn:{invoiceBalanceGlobalInput:usd}});
  assert.deepEqual(effective,usd);assert.deepEqual(resolutionState,before);
  const next=preserveSearchSelection({name:'get_invoice_balances',input:{page:2},history:h,resolutionState:{...resolutionState,contexts:{get_invoice_balances:usd}},selectionTurn:{}});
  assert.deepEqual(next,{...usd,page:2});
 }
});
test('omitted customer filter does not mean an explicit all-customer selection',()=>{
 const {customerIds,...omitted}=global;
 for(const input of [{mode:'detail'},{mode:'detail',customerIds:[]}]){
  const effective=preserveSearchSelection({name:'get_invoice_balances',input,history:lookup('OLD'),resolutionState:{domains:{},contexts:{get_invoice_balances:omitted}},selectionTurn:{}});
  assert.deepEqual(effective.customerIds,['OLD']);assert.equal(Object.hasOwn(omitted,'customerIds'),false);
 }
});
test('validated customer change can supersede global across tool iterations and survive trimming',()=>{
 const id='P2-SCOPE';try{
  setSearchResolutions(id,{domains:{},invoiceLastTool:'get_invoice_balances',contexts:{get_invoice_balances:usd}});
  assert.equal(recordSearchToolResult(id,'search_invoice_balance_customers',{query:'Nueva'},{status:'RESOLVED',customerId:'NEW',customerName:'Nueva'}),true);
  const state=getSearchResolutions(id);assert.equal(state.invoiceBalanceCustomerChangePending,true);assert.deepEqual(state.contexts.get_invoice_balances,usd,'lookup alone must not overwrite the valid query');
  const input=preserveSearchSelection({name:'get_invoice_balances',input:{...usd,customerIds:[]},history:[...history,...lookup('NEW')],resolutionState:state,selectionTurn:{}});
  assert.deepEqual(input.customerIds,['NEW']);recordInvoiceQueryContext(id,'get_invoice_balances',input);
  const committed=getSearchResolutions(id);assert.equal(committed.invoiceBalanceCustomerChangePending,undefined);
  const next=preserveSearchSelection({name:'get_invoice_balances',input:{page:2},history:[],resolutionState:committed,selectionTurn:{}});assert.deepEqual(next.customerIds,['NEW']);assert.equal(next.page,2);
 }finally{clearConversation(id);}
});
test('failed or malformed lookup cannot retire confirmed global scope',()=>{
 const id='P2-LOOKUP';try{setSearchResolutions(id,{domains:{},contexts:{get_invoice_balances:usd}});assert.equal(recordSearchToolResult(id,'search_invoice_balance_customers',{}, {status:'RESOLVED',success:false,customerId:'FORGED'}),false);const state=getSearchResolutions(id);assert.equal(state.invoiceBalanceCustomerChangePending,undefined);const result=preserveSearchSelection({name:'get_invoice_balances',input:usd,history,resolutionState:state,selectionTurn:{}});assert.deepEqual(result.customerIds,[]);}finally{clearConversation(id);}
});
for(const input of ['<think','Respuesta.<think PRIVATE','Respuesta.<analysis\nPRIVATE','<thinking>PRIVATE','PRIVATE</think>Resultado.','PRIVATE_ONE</think>PRIVATE_TWO</analysis>Respuesta.','<think>PRIVATE</analysis>Resultado.','<think>PRIVATE</think','<|analysis','<|analysis|>PRIVATE','<|reasoning PRIVATE','<|analysis|>PRIVATE<|final','<thi'])test('ambiguous reasoning fails closed: '+JSON.stringify(input),()=>{
 assert.equal(stripInternalReasoning(input),SAFE_ASSISTANT_RESPONSE);assert.equal(stripInternalReasoning(stripInternalReasoning(input)),SAFE_ASSISTANT_RESPONSE);
});
test('complete nested blocks preserve only public text; split truncated markers and reasoning-only content do not',()=>{
 assert.equal(publicAssistantText({content:[{text:'<think>PRIVATE<analysis>PRIVATE</analysis>'},{text:'PRIVATE</think>Respuesta.'}]}),'Respuesta.');
 assert.equal(publicAssistantText({content:[{text:'<th'},{text:'ink>PRIVATE</think>Respuesta.'}]}),SAFE_ASSISTANT_RESPONSE);
 assert.equal(publicAssistantText({content:[{reasoningContent:{reasoningText:{text:'PRIVATE'}}}]}),SAFE_ASSISTANT_RESPONSE);
 assert.equal(stripInternalReasoning('<|analysis|>PRIVATE<|final|>Respuesta.'),'Respuesta.');assert.equal(stripInternalReasoning('Respuesta sin marcas.'),'Respuesta sin marcas.');
 assert.equal(stripInternalReasoning('<think note=">PRIVATE</think>PRIVATE_SUFFIX'),SAFE_ASSISTANT_RESPONSE);
});
for(const scenario of ['old-client-history','old-client-trimmed','old-client-change','reasoning-open','reasoning-eof','reasoning-unclosed','reasoning-orphans','reasoning-role','reasoning-split'])test('HTTP P2 regression: '+scenario,()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoiceGlobalUsdHttp.mjs',import.meta.url)),scenario],{encoding:'utf8',timeout:25000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/GLOBAL_USD_HTTP_PASS/);
});
