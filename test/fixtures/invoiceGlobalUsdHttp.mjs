import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import express from 'express';
import * as store from '../../src/state/conversation.store.js';import {restorePiiDeep,protectPiiDeep} from '../../src/services/ai/pii.service.js';import {trimConversation} from '../../src/services/ai/conversation.service.js';
for(const k of ['log','info','warn','error','debug'])console[k]=()=>{};
const scenario=process.argv[2],sessionId='GLOBAL-USD-OWNED';let opened=0,closed=0,modelCalls=0;const calls=[],queries=[];
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const sessions=await load('../../src/services/sessions/oracleSession.service.js',{
 '../../database/oracle.database.js':{async connectWithProxy(username){assert.equal(username,'SERVER-ONLY');opened++;return {async close(){closed++;},async execute(sql,binds){
  queries.push({sql,binds});assert.match(sql,/VW_BOT_FACTURAS_SALDOS/);assert.doesNotMatch(sql,/COD_CLIENTE IN|DUE_DATE [<>]= TO_DATE|WHERE DUE_DATE|AND DUE_DATE [<>=]/);
  if(sql.includes('ROWNUM<=201')){
   if(scenario==='denied')throw Object.assign(Error('PRIVATE_DENIED'),{errorNum:1031});
   if(scenario==='failure')throw Error('PRIVATE_DATABASE_ERROR');
   return {rows:scenario==='ambiguous'?[{COD_MONEDA:'CODE-X',SIMBOLO_MONEDA:'$'}]:[{COD_MONEDA:'CODE-X',SIMBOLO_MONEDA:'USD'},{COD_MONEDA:'CODE-X',SIMBOLO_MONEDA:'$'}]};
  }
  assert.match(sql,/AND DEUDA > 0/);
  if(sql.includes('LEFT JOIN ranked'))return {rows:[{TOTAL_ROWS:50,DUPLICATE_ROWS:2,TOTAL_GROUPS:0}]};
  assert.equal(binds.currencyCodes0,'CODE-X');
  if(!sql.includes('ROW_NUMBER()'))return {rows:[{TOTAL_ROWS:scenario==='empty'?0:41,DISTINCT_CUSTOMERS:3,DUPLICATE_ROWS:2}]};
  return {rows:scenario==='empty'?[]:Array.from({length:Math.max(0,Math.min(41,binds.maxRow)-binds.offset)},(_,i)=>({SERIE_FACTURA:i%2?'PRIVATE-S2':'PRIVATE-S1',NRO_FACTURA:'PRIVATE-N'+(i+binds.offset),COD_CLIENTE:'PRIVATE-C'+i%3,NOM_CLIENTE:'PRIVATE-NAME'+i%3,DUE_DATE:new Date('2030-01-01'),VENCIMIENTO:'01/01/2030',COD_MONEDA:'CODE-X',SIMBOLO_MONEDA:'$',DEUDA:i===0?'.01':'9007199254740993.01'}))};
 }};}},
 '../../repositories/sessions/oracleSession.repository.js':{async getOracleSessionRepository(){return {username:'SERVER-ONLY',status:'ACTIVE'};},async touchOracleSessionRepository(){}},
});
const executor=await load('../../src/services/ai/toolExecutor.service.js',{'../sessions/oracleSession.service.js':sessions});
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;if(scenario==='public-reasoning')return {stopReason:'end_turn',output:{message:{role:'assistant',content:[{reasoningContent:{reasoningText:{text:'PRIVATE_STRUCTURED'}}},{text:'<think>PRIVATE_TEXT</think>Respuesta pública.'}]}}};throw Error('UNEXPECTED_PROVIDER');}},ConverseCommand:class{}};
const chat=await load('../../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':{async executeTool(request){calls.push(structuredClone(request));return executor.executeTool(request);}}});
const controller=await load('../../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat,'../services/sessions/oracleSession.service.js':sessions});
const router=await load('../../src/routes/index.js',{'../controllers/chat.controller.js':controller});const app=express();app.use(express.json());app.use('/chatbot/api',router.router);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const post=async message=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,username:'FORGED'})});const body=await r.json();assert.equal(r.status,200);assert.equal(body.success,true);assert.deepEqual(body.actions,{});assert.doesNotMatch(body.response,/PRIVATE_DATABASE_ERROR|PRIVATE_DENIED|PRIVATE_STRUCTURED|PRIVATE_TEXT|<think>|₮|≈|aproximad/);return body;};
const crop=()=>{const h=store.getConversation(sessionId);for(let i=0;i<12;i++)h.push({role:'user',content:[{text:'Tema '+i}]},{role:'assistant',content:[{text:'Recibido.'}]});store.setConversation(sessionId,trimConversation(h,10));assert.ok(!JSON.stringify(store.getConversation(sessionId)).includes('toolUse'));};
try{
 if(scenario==='public-reasoning'){const body=await post('Saludo');assert.equal(body.response,'Respuesta pública.');assert.equal(modelCalls,1);}
 else{
  store.setSearchResolutions(sessionId,{domains:{search_invoice_balance_customers:{kind:'resolved',selected:{customerId:'STALE'}}},contexts:{get_invoice_balances:protectPiiDeep(sessionId,{customerIds:['STALE'],debtStatus:'settled',dueStatus:'overdue',dueDateTo:'01/01/2020',page:9})},invoiceLastTool:'get_invoice_balances'});
  const first=await post('Deudas pendientes total de todos los clientes por monedas hasta la fecha');assert.match(first.response,/duplicados.*total confiable/);
  assert.equal(calls.length,1);assert.equal(calls[0].name,'get_invoice_balances');assert.deepEqual(calls[0].arguments,{customerIds:[],debtStatus:'pending',mode:'summary',groupBy:[],orderBy:'group',page:1,rows:20});
  const before=store.getSearchResolutions(sessionId);crop();
  const detail=await post('Detalla las que son en dólares');assert.equal(calls[1].name,'resolve_invoice_balance_currency');
  if(['denied','ambiguous','failure'].includes(scenario)){
   assert.equal(calls.length,2);assert.doesNotMatch(detail.response,/\| Serie|Mostrando|siguiente página/);assert.deepEqual(store.getSearchResolutions(sessionId).contexts,before.contexts);
   assert.match(detail.response,scenario==='denied'?/no tiene permisos/:scenario==='failure'?/No se pudo completar/:/No pude identificar/);
  }else{
   assert.equal(calls[2].name,'get_invoice_balances');const expected={...calls[0].arguments,mode:'detail',orderBy:'dueDateAsc',currencyCodes:['CODE-X']};assert.deepEqual(calls[2].arguments,expected);
   const state=restorePiiDeep(sessionId,store.getSearchResolutions(sessionId));assert.deepEqual(state.contexts.get_invoice_balances,expected);assert.equal(state.invoiceBalanceCurrencyLabels['CODE-X'],'USD');
   if(scenario==='empty'){assert.match(detail.response,/No encontré/);assert.match(detail.response,/Mostrando 0 de 0/);}
   else{
    assert.match(detail.response,/USD/);assert.match(detail.response,/9\.007\.199\.254\.740\.993,01/);assert.match(detail.response,/Cliente/);assert.match(detail.response,/duplicados/);assert.equal(detail.response.split('\n').filter(l=>l.startsWith('| ')).length,22);
    let next=await post('Siguiente página');assert.equal(calls.at(-1).arguments.page,2);assert.deepEqual(calls.at(-1).arguments.customerIds,[]);assert.match(next.response,/Página 2 de 3/);
    crop();next=await post('Siguiente página');assert.equal(calls.at(-1).arguments.page,3);assert.match(next.response,/USD/);assert.match(next.response,/Página 3 de 3/);
    assert.equal(calls.at(-1).arguments.debtStatus,'pending');assert.deepEqual(calls.at(-1).arguments.currencyCodes,['CODE-X']);assert.equal(calls.at(-1).arguments.dueDateTo,undefined);assert.equal(calls.at(-1).arguments.customerIds.length,0);
    const history=JSON.stringify(store.getConversation(sessionId));for(const value of ['PRIVATE-NAME','PRIVATE-C','PRIVATE-N','PRIVATE-S'])assert.ok(!history.includes(value));
   }
  }
  assert.equal(modelCalls,0,'literal sequence and pages never need a provider');assert.equal(opened,closed);
 }
 process.stdout.write('GLOBAL_USD_HTTP_PASS');
}finally{store.clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
