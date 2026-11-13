import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import express from 'express';
import * as store from '../../src/state/conversation.store.js';
import {protectPiiDeep} from '../../src/services/ai/pii.service.js';
import {trimConversation} from '../../src/services/ai/conversation.service.js';
import {ACCESS_DENIED_MESSAGE} from '../../src/services/ai/toolErrors.service.js';
import {INVOICE_BALANCE_FAILURE_MESSAGE} from '../../src/services/ai/invoiceBalanceResult.service.js';
import {resolveInvoiceBalancePage} from '../../src/services/ai/invoiceBalancePresentation.service.js';
const [scenario,trimmed]=process.argv.slice(2),sessionId='SYNTHETIC-SETTLED',customerId='SYNTHETIC-C',calls=[],queries=[],logs=[];
for(const k of ['log','info','warn','error','debug'])console[k]=(...values)=>logs.push(values);
let opened=0,closed=0,modelCalls=0,phase='pending';
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const sessions=await load('../../src/services/sessions/oracleSession.service.js',{
 '../../database/oracle.database.js':{async connectWithProxy(username){assert.equal(username,'SERVER_IDENTITY');opened++;return {async close(){closed++;},async execute(sql,binds){
  queries.push({sql,binds});assert.match(sql,/VW_BOT_FACTURAS_SALDOS/);assert.doesNotMatch(sql,/VW_BOT_FACTURAS\b|ANULADO/);
  if(sql.includes('ROWNUM<=21'))return {rows:(scenario==='ambiguous'?[customerId,'OTHER-C']:[customerId]).map(id=>({COD_CLIENTE:id,CUSTOMER_NAME:'Impacto',BUSINESS_NAME:'Sociedad sintética',TAX_ID:'SYNTHETIC-TAX'}))};
  assert.equal(binds.customerIds0,customerId);
  if(phase==='settled'){assert.match(sql,/AND DEUDA = 0/);assert.doesNotMatch(sql,/AND DEUDA > 0/);}else assert.match(sql,/AND DEUDA > 0/);
  if(phase==='settled'&&scenario==='denied')throw Object.assign(Error('PRIVATE_DENIED'),{errorNum:1031});
  const count=phase==='settled'&&scenario==='empty'?0:23;
  if(!sql.includes('ROW_NUMBER()'))return {rows:[{TOTAL_ROWS:count,DISTINCT_INVOICE_PAIRS:count,DISTINCT_CUSTOMERS:count?1:0}]};
  return {rows:Array.from({length:Math.max(0,Math.min(count,binds.maxRow)-binds.offset)},(_,i)=>({SERIE_FACTURA:'SYNTHETIC-SERIES',NRO_FACTURA:'SYNTHETIC-NUMBER-'+(binds.offset+i),COD_CLIENTE:customerId,NOM_CLIENTE:'Impacto',VENCIMIENTO:'01/11/2026',DUE_DATE:new Date('2026-11-01'),COD_MONEDA:'M1',SIMBOLO_MONEDA:'PYG',DEUDA:phase==='settled'?'0':'25.50'}))};
 }};}},
 '../../repositories/sessions/oracleSession.repository.js':{async getOracleSessionRepository(){return {username:'SERVER_IDENTITY',status:'ACTIVE'};},async touchOracleSessionRepository(){}},
});
const realExecutor=await load('../../src/services/ai/toolExecutor.service.js',{'../sessions/oracleSession.service.js':sessions});
const executor={async executeTool(request){calls.push(structuredClone(request));if(phase==='settled'&&scenario==='failed'&&request.name==='get_invoice_balances')return undefined;return realExecutor.executeTool(request);}};
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;assert.equal(scenario,'guard');return {output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'wrong-tool',name:'get_invoices',input:{customerIds:['FORGED'],cancelled:true,debtStatus:'pending',page:9}}}]}},stopReason:'tool_use'};}},ConverseCommand:class{constructor(input){this.input=input;}}};
const chat=await load('../../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':executor});
const controller=await load('../../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat,'../services/sessions/oracleSession.service.js':sessions});
const router=await load('../../src/routes/index.js',{'../controllers/chat.controller.js':controller});const app=express();app.use(express.json());app.use('/chatbot/api',router.router);
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const post=async message=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,username:'UNTRUSTED'})});const b=await r.json();assert.equal(r.status,200);assert.equal(b.success,true);return b;};
try{
 if(scenario!=='noContext'){
  store.setSearchResolutions(sessionId,{invoiceLastTool:'get_invoices',domains:{},contexts:protectPiiDeep(sessionId,{get_invoices:{customerIds:[customerId],dateFrom:'01/01/2023',conceptIds:['RENT'],plate:'ABC123',page:5}})});
  const pending=await post('facturas pendientes');assert.match(pending.response,/25,50/);assert.equal(calls.at(-1).arguments.debtStatus,'pending');
 }
 if(trimmed==='true'){
  const history=store.getConversation(sessionId);for(let i=0;i<12;i++)history.push({role:'user',content:[{text:'Tema independiente '+i}]},{role:'assistant',content:[{text:'Recibido.'}]});
  store.setConversation(sessionId,trimConversation(history,10));assert.ok(!JSON.stringify(store.getConversation(sessionId)).includes('get_invoice_balances'));
 }
 const previous=store.getSearchResolutions(sessionId);phase='settled';calls.length=0;queries.length=0;
 const literal='Mostrame las facturas de Impacto cuya deuda ya está cancelada';
 const message={paid:'facturas pagadas de Impacto',without:'facturas de Impacto sin deuda pendiente',followup:'ahora las canceladas',guard:'mostrame todas las facturas pagadas',noContext:'ahora las canceladas'}[scenario]??literal;
 const body=await post(message);assert.deepEqual(body.actions,{});assert.equal(opened,closed);
 assert.ok(calls.every(c=>['get_invoice_balances','search_invoice_balance_customers'].includes(c.name)));
 if(scenario==='noContext'){assert.equal(calls.length,0);assert.match(body.response,/Indica el cliente/);}
 else if(scenario==='ambiguous'){assert.equal(calls.length,1);assert.equal(calls[0].name,'search_invoice_balance_customers');assert.match(body.response,/Selecciona el cliente/);}
 else{
  const query=calls.find(c=>c.name==='get_invoice_balances');assert.deepEqual(query.arguments,{customerIds:[customerId],mode:'detail',debtStatus:'settled',page:1,rows:20});
  if(['denied','failed'].includes(scenario)){
   assert.equal(body.response,scenario==='denied'?ACCESS_DENIED_MESSAGE:INVOICE_BALANCE_FAILURE_MESSAGE);assert.deepEqual(store.getSearchResolutions(sessionId),previous);
   assert.equal(store.getInvoiceBalancePageState(sessionId).status,'error');
   assert.equal(resolveInvoiceBalancePage({message:'Siguiente página',history:[],pageState:store.getInvoiceBalancePageState(sessionId)}),null,'failure cannot resume stale pages after trimming');
  }else{
   assert.match(body.response,/Facturas con deuda cancelada/);assert.match(body.response,/No indica que la factura esté anulada/);
   const scope=store.getSearchResolutions(sessionId).contexts.get_invoice_balances;assert.equal(scope.debtStatus,'settled');assert.equal(scope.page,1);assert.equal(scope.dateFrom,undefined);assert.equal(scope.minDebt,undefined);
   if(scenario==='empty'){assert.match(body.response,/No se encontraron facturas con deuda cancelada/);assert.doesNotMatch(body.response,/SYNTHETIC-NUMBER/);}
   else{
    assert.equal((body.response.match(/SYNTHETIC-NUMBER-/g)??[]).length,20);assert.match(body.response,/Deuda cancelada/);assert.match(body.response,/0,00/);assert.doesNotMatch(body.response,/25,50/);
    if(trimmed==='true'){
     const history=store.getConversation(sessionId);for(let i=0;i<12;i++)history.push({role:'user',content:[{text:'Otro tema '+i}]},{role:'assistant',content:[{text:'Recibido.'}]});
     store.setConversation(sessionId,trimConversation(history,10));
     assert.ok(!JSON.stringify(store.getConversation(sessionId)).includes('get_invoice_balances'));
    }
    const second=await post('Siguiente página');assert.equal(calls.at(-1).arguments.debtStatus,'settled');assert.equal(calls.at(-1).arguments.page,2);assert.equal((second.response.match(/SYNTHETIC-NUMBER-/g)??[]).length,3);assert.match(second.response,/Página 2 de 2/);assert.doesNotMatch(second.response,/25,50/);
   }
  }
 }
 const history=JSON.stringify(store.getConversation(sessionId));for(const value of ['Impacto',customerId,'PRIVATE_DENIED'])assert.ok(!history.includes(value));
 assert.equal(modelCalls,scenario==='guard'?1:0);assert.equal(opened,closed);
 process.stdout.write('INVOICE_SETTLED_HTTP_PASS');
}finally{store.clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
