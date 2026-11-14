import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import express from 'express';
import * as store from '../../src/state/conversation.store.js';
import {protectPiiDeep} from '../../src/services/ai/pii.service.js';
import {resolveInvoiceBalancePage} from '../../src/services/ai/invoiceBalancePresentation.service.js';
import {ACCESS_DENIED_MESSAGE} from '../../src/services/ai/toolErrors.service.js';
import {INVOICE_BALANCE_FAILURE_MESSAGE} from '../../src/services/ai/invoiceBalanceResult.service.js';
const [branch,outcome]=process.argv.slice(2),sessionId='SYNTHETIC-PENDING-RESULT',calls=[],logs=[];
for(const key of ['log','info','warn','error','debug'])console[key]=(...values)=>logs.push(values);
const expectedCustomer=branch==='named'?'NEW-C':'SYNTHETIC-C';let opened=0,closed=0,modelCalls=0;
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
async function load(path,overrides={}){
 const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
 await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
 await m.evaluate();return m.namespace;
}
const sessions=await load('../../src/services/sessions/oracleSession.service.js',{
 '../../database/oracle.database.js':{async connectWithProxy(username){assert.equal(username,'SERVER_IDENTITY');opened++;return {async close(){closed++;},async execute(sql,binds){
  assert.match(sql,/VW_BOT_FACTURAS_SALDOS/);assert.doesNotMatch(sql,/VW_BOT_FACTURAS\b/);
  if(sql.includes('ROWNUM<=21'))return {rows:[{COD_CLIENTE:'NEW-C',CUSTOMER_NAME:'Cliente sintético nuevo',BUSINESS_NAME:'Sociedad sintética',TAX_ID:'SYNTHETIC-TAX'}]};
  assert.match(sql,/DEUDA > 0/);assert.equal(binds.customerIds0,expectedCustomer);
  if(['throw','denied'].includes(outcome))throw Object.assign(Error('PRIVATE_DATABASE_ERROR'),outcome==='denied'?{errorNum:1031}:{});
  if(!sql.includes('ROW_NUMBER()'))return {rows:[{TOTAL_ROWS:outcome==='empty'?0:1,DISTINCT_INVOICE_PAIRS:outcome==='empty'?0:1,DISTINCT_CUSTOMERS:outcome==='empty'?0:1}]};
  return {rows:outcome==='empty'?[]:[{SERIE_FACTURA:'SYNTHETIC-SERIES',NRO_FACTURA:'SYNTHETIC-NUMBER',COD_CLIENTE:expectedCustomer,NOM_CLIENTE:'Cliente sintético nuevo',VENCIMIENTO:'01/11/2026',DUE_DATE:new Date('2026-11-01'),COD_MONEDA:'M1',DEUDA:'25.50'}]};
 }};}},
 '../../repositories/sessions/oracleSession.repository.js':{async getOracleSessionRepository(){return {username:'SERVER_IDENTITY',status:'ACTIVE'};},async touchOracleSessionRepository(){}},
});
const realExecutor=await load('../../src/services/ai/toolExecutor.service.js',{'../sessions/oracleSession.service.js':sessions});
const poison={status:'OK_DETAIL_ONLY',mode:'detail',data:[{invoiceNumber:'MUST_NOT_PRESENT',debt:'999.99'}],hasMore:true,nextPage:99,page:98,totalRows:999,queryContext:{customerIds:['FORGED']},actions:{pdf:{available:true}}};
const executor={async executeTool(request){
 calls.push(structuredClone(request));
 if(request.name==='get_invoice_balances'){
  if(outcome==='undefined')return undefined;
  if(outcome==='error')return {...poison,success:false,error:'PRIVATE_RETURNED_ERROR'};
  if(outcome==='deniedResult')return {...poison,status:'ACCESS_DENIED',error:'PRIVATE_RETURNED_ERROR'};
  if(outcome==='malformed')return {...poison,status:'UNEXPECTED_STATUS'};
 }
 return realExecutor.executeTool(request);
}};
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;throw Error('MODEL_MUST_NOT_RUN');}},ConverseCommand:class{constructor(input){this.input=input;}}};
const chat=await load('../../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':executor});
const controller=await load('../../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat,'../services/sessions/oracleSession.service.js':sessions});
const router=await load('../../src/routes/index.js',{'../controllers/chat.controller.js':controller});
const app=express();app.use(express.json());app.use('/chatbot/api',router.router);
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
try{
 const previous={invoiceLastTool:'get_invoices',domains:protectPiiDeep(sessionId,{search_invoice_balance_customers:{kind:'resolved',selected:{customerId:'OLD-C'},call:{input:{query:'Anterior'}},result:{options:[]}}}),contexts:protectPiiDeep(sessionId,{
  get_invoices:{customerIds:['SYNTHETIC-C'],dateFrom:'01/01/2023',dateTo:'31/12/2023',conceptIds:['RENT'],plate:'ABC123',page:5,mode:'detail'},
  get_invoice_balances:{customerIds:['OLD-C'],debtStatus:'all',dueStatus:'overdue',asOfDate:'12/11/2026',mode:'detail',page:3,rows:2},
 })};
 store.setSearchResolutions(sessionId,previous);
 store.setConversation(sessionId,[{role:'assistant',content:[{toolUse:{toolUseId:'previous-valid',name:'get_invoice_balances',input:previous.contexts.get_invoice_balances}}]},{role:'user',content:[{toolResult:{toolUseId:'previous-valid',status:'success',content:[{json:{queryContext:previous.contexts.get_invoice_balances,hasMore:true,nextPage:4,data:[]}}]}}]}]);
 const message=branch==='named'?'¿Qué facturas pendientes de pago tiene Impacto?':'solo las pendientes';
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,username:'UNTRUSTED'})});
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.success,true);assert.deepEqual(body.actions,{});
 assert.equal(modelCalls,0);assert.equal(opened,closed);
 assert.ok(calls.every(c=>['search_invoice_balance_customers','get_invoice_balances'].includes(c.name)));
 const query=calls.find(c=>c.name==='get_invoice_balances');assert.deepEqual(query.arguments,{customerIds:[expectedCustomer],mode:'detail',debtStatus:'pending',page:1,rows:20});
 const history=store.getConversation(sessionId),blocks=history.flatMap(m=>m.content??[]);
 const current=blocks.filter(b=>b.toolUse?.name==='get_invoice_balances').at(-1).toolUse;
 const result=blocks.find(b=>b.toolResult?.toolUseId===current.toolUseId).toolResult;
 const valid=['data','empty'].includes(outcome);
 if(!valid){
  assert.equal(body.response,['denied','deniedResult'].includes(outcome)?ACCESS_DENIED_MESSAGE:INVOICE_BALANCE_FAILURE_MESSAGE);
  assert.deepEqual(store.getSearchResolutions(sessionId),previous,'failed attempt preserves valid scope and resolver identity');
  assert.equal(result.status,'error','failed attempt is not recorded as a completed tool');
  const error=result.content.find(c=>c.json).json;assert.equal(error.success,false);
  for(const key of ['data','page','hasMore','nextPage','queryContext','actions'])assert.equal(error[key],undefined);
  assert.equal(resolveInvoiceBalancePage({message:'Siguiente página',history}),null,'failed tool cannot generate a next page');
  assert.doesNotMatch(body.response,/realizada|No se encontraron|Página|Serie de factura/);
 }else{
  assert.equal(result.status,'success');const state=store.getSearchResolutions(sessionId);
  assert.equal(state.invoiceLastTool,'get_invoice_balances');assert.equal(state.contexts.get_invoice_balances.debtStatus,'pending');
  assert.equal(state.contexts.get_invoice_balances.page,1);assert.equal(state.contexts.get_invoice_balances.dateFrom,undefined);
  if(outcome==='empty')assert.match(body.response,/No encontré facturas pendientes de pago/);
  else{assert.match(body.response,/SYNTHETIC-NUMBER/);assert.match(body.response,/25,50/);}
 }
 for(const value of ['PRIVATE_DATABASE_ERROR','PRIVATE_RETURNED_ERROR','MUST_NOT_PRESENT']){
  assert.ok(!body.response.includes(value));assert.ok(!JSON.stringify(history).includes(value));assert.ok(!JSON.stringify(logs).includes(value));
 }
 assert.ok(!JSON.stringify(history).includes(expectedCustomer),'customer IDs stay protected');
 process.stdout.write('INVOICE_PENDING_RESULT_HTTP_PASS');
}finally{store.clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
