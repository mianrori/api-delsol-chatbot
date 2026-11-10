import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import express from 'express';
import config from '../../config.js';import * as store from '../../src/state/conversation.store.js';import {protectPiiDeep} from '../../src/services/ai/pii.service.js';import {getInvoices} from '../../src/services/invoices/invoices.service.js';
for(const k of ['log','info','warn','error','debug'])console[k]=()=>{};
const s='SYNTHETIC-INVOICE-HTTP';config.urlEndPointDePdf='https://pdf.example.test/base///';
const accessCase=process.argv[2];
let plans=[],queries=[],calls=[],validated=[],modelCalls=0;
const initial={plate:'ab \t-123',customerIds:['C1'],conceptIds:['K1'],dateFrom:'01/01/2023',dateTo:'31/12/2023',period:'01/2023',cancelled:false,mode:'detail',page:1,rows:2};
const connection={async execute(sql,binds){queries.push({sql,binds:{...binds}});if(sql.includes('COUNT(*) AS TOTAL_ROWS'))return {rows:[{TOTAL_ROWS:3,TOTAL_INVOICES:2}]};return {rows:binds.offset===0?[{NRO_FACTURA:'F1',PDF:'/a.pdf',MATRICULA:'AB 123',IMPORTE:10},{NRO_FACTURA:'F2',PDF:null,MATRICULA:'AB123',IMPORTE:0}]:[{NRO_FACTURA:'F2',PDF:'b (2).pdf',MATRICULA:'AB123',IMPORTE:20}]};}};
const sessions={async getValidOracleSession(id){validated.push(id);if(id!==s)throw Object.assign(Error('invalid'),{code:'ORACLE_SESSION_NOT_FOUND'});return {username:'SYNTHETIC'};}};
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;const input=plans.shift();assert.ok(input,'unexpected model request');return {stopReason:'tool_use',output:{message:{role:'assistant',content:[{toolUse:{name:'get_invoices',toolUseId:'invoice-'+modelCalls,input:protectPiiDeep(s,input)}}]}}};}},ConverseCommand:class{}};
const chat=await load('../../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':{async executeTool(req){assert.equal(req.context.sessionId,s);const result=await getInvoices(req.arguments,connection);calls.push({args:structuredClone(req.arguments),result});return result;}}});
const controller=await load('../../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat,'../services/sessions/oracleSession.service.js':sessions});
const router=await load('../../src/routes/index.js',{'../controllers/chat.controller.js':controller});const app=express();app.use(express.json());app.use('/chatbot/api',router.router);const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});
const url='http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat';const post=async body=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
try{
 if(accessCase){
  const original=connection.execute.bind(connection);
  connection.execute=async(sql,binds)=>{
   const r=await original(sql,binds);
   if(sql.includes('COUNT(*) AS TOTAL_ROWS'))return {rows:[{TOTAL_ROWS:accessCase==='denied'?0:3,TOTAL_INVOICES:accessCase==='denied'?0:2,HAS_RESTRICTED_DATA:1}]};
   return accessCase==='denied'?{rows:[]}:r;
  };
  plans=[initial];const r=await post({sessionId:s,message:'Facturas de la matr\u00edcula ab 123 de 2023',username:'IGNORED'});
  assert.equal(r.status,200);assert.equal(r.body.success,true);assert.equal(modelCalls,1);
  if(accessCase==='denied'){
   assert.match(r.body.response,/no tiene permisos/);assert.doesNotMatch(r.body.response,/No se encontraron|Ver PDF|F1|F2/);assert.deepEqual(r.body.actions,{});
  }else{
   assert.match(r.body.response,/No est\u00e1 autorizado a consultar parte/);assert.match(r.body.response,/Ver PDF/);assert.equal(r.body.actions.invoicePagination.totalRows,3);assert.equal(r.body.actions.invoicePagination.nextPage,2);
  }
  for(const q of queries){assert.equal(q.binds.plate,'AB123');assert.equal(q.binds.customerId0,'C1');assert.equal(q.binds.conceptId0,'K1');assert.equal(q.binds.dateFrom,'01/01/2023');assert.equal(q.binds.dateTo,'31/12/2023');}
  process.stdout.write('INVOICE_HTTP_PASS');
 }else{
 const denied=await post({sessionId:'BAD',message:'Facturas',username:'IGNORED'});assert.equal(denied.status,404);assert.equal(calls.length,0);
 plans=[initial];const first=await post({sessionId:s,message:'Facturas de la matr\u00edcula ab 123 de 2023',username:'IGNORED'});assert.equal(first.status,200);assert.equal(first.body.success,true);assert.equal(first.body.actions.invoicePagination.nextPage,2);assert.equal(first.body.actions.invoicePagination.totalRows,3);assert.equal(first.body.actions.invoicePagination.totalInvoices,2);assert.match(first.body.response,/\[Ver PDF\]\(<https:\/\/pdf.example.test\/base\/a.pdf>\)/);assert.equal(first.body.response.split('\n').filter(l=>/^\| F[12] /.test(l)).length,2);
 plans=[{page:2}];const next=await post({sessionId:s,message:'Siguiente p\u00e1gina'});assert.equal(next.status,200);assert.deepEqual(calls[1].args,{...initial,page:2});assert.equal(next.body.actions.invoicePagination.hasMore,false);assert.match(next.body.response,/b%20\(2\).pdf/);assert.doesNotMatch(next.body.response,/base\/a.pdf/);assert.equal(next.body.response.split('\n').filter(l=>/^\| F2 /.test(l)).length,1);
 for(const q of queries){assert.equal(q.binds.plate,'AB123');assert.equal(q.binds.customerId0,'C1');assert.equal(q.binds.conceptId0,'K1');assert.equal(q.binds.period,'01/2023');assert.equal(q.binds.cancelled,'N');assert.match(q.sql,/NVL\(USER_CAN_CONSULT, 'S'\) <> 'N'/);}
 assert.equal(modelCalls,2);assert.ok(validated.includes(s));assert.ok(validated.includes('BAD'));process.stdout.write('INVOICE_HTTP_PASS');
 }
}finally{store.clearConversation(s);await new Promise(resolve=>server.close(resolve));}
