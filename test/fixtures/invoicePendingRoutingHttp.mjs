import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import express from 'express';
import * as store from '../../src/state/conversation.store.js';
import {protectPiiDeep,restorePiiDeep} from '../../src/services/ai/pii.service.js';
const sessionId='SYNTHETIC-PENDING',calls=[],sqlCalls=[];
let modelCalls=0,opened=0,closed=0,general=false,generalCalled=false;
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
async function load(path,overrides={}){
 const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
 await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
 await m.evaluate();return m.namespace;
}
const sessions=await load('../../src/services/sessions/oracleSession.service.js',{
 '../../database/oracle.database.js':{async connectWithProxy(username){assert.equal(username,'SERVER_IDENTITY');opened++;return {async close(){closed++;},async execute(sql,binds){
  sqlCalls.push({sql,binds});assert.match(sql,/VW_BOT_FACTURAS_SALDOS/);assert.doesNotMatch(sql,/VW_BOT_FACTURAS\b/);
  if(sql.includes('ROWNUM<=21'))return {rows:[{COD_CLIENTE:'SYNTHETIC-C',CUSTOMER_NAME:'Impacto',BUSINESS_NAME:'Sintética',TAX_ID:'SYNTHETIC-TAX'}]};
  assert.match(sql,/DEUDA > 0/);assert.equal(binds.customerIds0,'SYNTHETIC-C');
  if(!sql.includes('ROW_NUMBER()'))return {rows:[{TOTAL_ROWS:2,DISTINCT_INVOICE_PAIRS:1,DISTINCT_CUSTOMERS:1,DUPLICATE_ROWS:2}]};
  return {rows:[1,2].map(()=>({SERIE_FACTURA:'SYNTHETIC-SERIES',NRO_FACTURA:'SYNTHETIC-NUMBER',COD_CLIENTE:'SYNTHETIC-C',NOM_CLIENTE:'Impacto',VENCIMIENTO:'01/11/2026',DUE_DATE:new Date('2026-11-01'),COD_MONEDA:'M1',SIMBOLO_MONEDA:'PYG',DEUDA:'25.50'}))};
 }};}},
 '../../repositories/sessions/oracleSession.repository.js':{async getOracleSessionRepository(){return {username:'SERVER_IDENTITY',status:'ACTIVE'};},async touchOracleSessionRepository(){}},
});
const realExecutor=await load('../../src/services/ai/toolExecutor.service.js',{'../sessions/oracleSession.service.js':sessions});
const executor={async executeTool(request){calls.push(structuredClone(request));if(general&&request.name==='get_invoices')return {mode:'detail',page:5,totalRows:0,totalInvoices:0,totalPages:0,data:[]};return realExecutor.executeTool(request);}};
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;
 if(general&&generalCalled)return {output:{message:{role:'assistant',content:[{text:'Facturas generales consultadas.'}]}},stopReason:'end_turn'};
 generalCalled=general;
 const input=general?protectPiiDeep(sessionId,{customerIds:['SYNTHETIC-C'],dateFrom:'01/01/2023',dateTo:'31/12/2023',conceptIds:['RENT'],plate:'ABC123',page:5,mode:'detail'}):{customerIds:['FORGED'],dateFrom:'01/01/2023',conceptIds:['RENT'],plate:'ABC123',page:9,mode:'summary'};
 return {output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'wrong-'+modelCalls,name:'get_invoices',input}}]}},stopReason:'tool_use'};
}},ConverseCommand:class{constructor(input){this.input=input;}}};
const chat=await load('../../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':executor});
const controller=await load('../../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat,'../services/sessions/oracleSession.service.js':sessions});
const router=await load('../../src/routes/index.js',{'../controllers/chat.controller.js':controller});
const app=express();app.use(express.json());app.use('/chatbot/api',router.router);
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const seed=()=>{store.clearConversation(sessionId);store.setSearchResolutions(sessionId,{invoiceLastTool:'get_invoices',domains:{},contexts:protectPiiDeep(sessionId,{get_invoices:{customerIds:['SYNTHETIC-C'],conceptIds:['RENT'],plate:'ABC123',dateFrom:'01/01/2023',dateTo:'31/12/2023',mode:'summary',page:5},get_invoice_balances:{customerIds:[],debtStatus:'settled',dueStatus:'overdue'}})});};
const post=async message=>fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,username:'FORGED'})});
try{
 for(const message of ['¿Qué facturas pendientes de pago tiene Impacto?','facturas pendientes','pendientes de pago','cuánto debe','solo las pendientes','muestra las facturas pendientes ahora']){
  seed();
  if(message==='solo las pendientes'){
   store.clearConversation(sessionId);general=true;generalCalled=false;calls.length=0;
   const first=await post('Consulta facturas generales de 2023');assert.equal((await first.json()).success,true);
   assert.ok(calls.some(c=>c.name==='get_invoices'));general=false;
  }
  calls.length=0;const before=modelCalls;
  const response=await post(message);
  const body=await response.json();assert.equal(response.status,200);assert.equal(body.success,true);
  assert.ok(calls.every(c=>['get_invoice_balances','search_invoice_balance_customers'].includes(c.name)));
  const query=calls.find(c=>c.name==='get_invoice_balances');assert.ok(query,message);
  assert.deepEqual(query.arguments,{customerIds:['SYNTHETIC-C'],mode:'detail',debtStatus:'pending',page:1,rows:20});
  if(!message.endsWith('ahora'))assert.equal(modelCalls,before,'bounded pending requests bypass the model');
  for(const column of ['Serie','Número','Vencimiento','Moneda','Deuda'])assert.ok(body.response.includes(column),column);
  assert.equal((body.response.match(/SYNTHETIC-NUMBER/g)??[]).length,2,'duplicates preserved');
  assert.match(body.response,/históricos duplicados/);assert.match(body.response,/25,50/);
  const history=JSON.stringify(store.getConversation(sessionId));assert.ok(!history.includes('SYNTHETIC-C'));assert.ok(!history.includes('SYNTHETIC-NUMBER'));
  const blocks=store.getConversation(sessionId).flatMap(m=>m.content??[]);assert.equal(blocks.filter(b=>b.toolUse?.name==='get_invoices').length,message==='solo las pendientes'?1:0);
  assert.equal(opened,closed);
 }
 process.stdout.write('INVOICE_PENDING_HTTP_PASS');
}finally{store.clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
