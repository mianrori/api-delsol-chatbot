import express from 'express';
﻿import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
import * as store from '../../src/state/conversation.store.js';import {protectPiiDeep,restorePiiDeep} from '../../src/services/ai/pii.service.js';import {trimConversation} from '../../src/services/ai/conversation.service.js';
import {getInvoices} from '../../src/services/invoices/invoices.service.js';import {searchInvoiceConcepts} from '../../src/services/invoices/searchInvoiceConcepts.service.js';import {searchInvoiceCustomers} from '../../src/services/invoices/searchInvoiceCustomers.service.js';
import config from '../../config.js';
import {INVOICE_PARTIAL_PRESENTATION_MESSAGE as INVOICE_PARTIAL_ACCESS_MESSAGE} from '../../src/services/ai/invoiceDetailPresentation.service.js';
config.urlEndPointDePdf='https://pdf.example.test';
process.env.NODE_ENV='development';
for(const k of ['log','info','warn','error','debug'])console[k]=()=>{};
const [scenario,trimFlag]=process.argv.slice(2),trimmed=trimFlag==='true',sessionId='SYNTHETIC-NAMED-INVOICE';let calls=[],queries=[],modelCalls=0;
const conceptAmbiguous=['concept-ambiguous','both-ambiguous','wrong-choice'].includes(scenario),customerAmbiguous=['customer-ambiguous','both-ambiguous'].includes(scenario);

let stage='initial';const attempts=[];
const connection={async execute(sql,binds){queries.push({sql,binds:structuredClone(binds)});
 if(sql.includes('VW_BOT_CONCEPTOS'))return {rows:[{COD_CONCEPTO:'K1',DESCRIPCION:'ARRENDAMIENTO MINIMO'}]};
 if(sql.includes('FROM DUAL'))return {rows:[{HAS_RESTRICTED_DATA:stage==='initial'&&scenario.startsWith('customer-')?1:0}]};
 if(sql.includes('MATCH_PRIORITY')&&stage==='initial'&&scenario.startsWith('customer-'))return {rows:[]};
 if(sql.includes('MATCH_PRIORITY'))return {rows:[{COD_CLIENTE:'C1',NOM_CLIENTE:'IMPACTO',MATCH_PRIORITY:4}]};
 if(sql.includes('COUNT(*) AS TOTAL_ROWS'))return {rows:[{TOTAL_ROWS:stage==='initial'||scenario==='followup'||scenario==='denied'||scenario==='empty'?0:1,TOTAL_INVOICES:stage==='initial'||scenario==='followup'||scenario==='denied'||scenario==='empty'?0:1,HAS_RESTRICTED_DATA:stage==='initial'||scenario==='followup'||scenario==='denied'||scenario==='mixed'?1:0}]};
 if(stage==='initial'||scenario==='followup'||scenario==='denied'||scenario==='empty')return {rows:[]};
 return {rows:[{NRO_FACTURA:'ALLOWED-PLATE',NOM_CLIENTE:'OTHER AUTHORIZED CUSTOMER',DES_CONCEPTO:'OTHER AUTHORIZED CONCEPT',IMPORTE:20,MATRICULA:'ANX123',PDF:'allowed.pdf'}]};
}};
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});const synthetic=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;throw Error('MODEL_MUST_NOT_SWAP_EXPLICIT_ROLES');}},ConverseCommand:class{}};
const executeTool=async req=>{assert.equal(req.context.sessionId,sessionId);attempts.push({name:req.name,args:structuredClone(req.arguments)});let result;
 if(req.name==='search_invoice_concepts')result=await searchInvoiceConcepts(req.arguments,connection);
 else if(req.name==='search_invoice_customers')result=await searchInvoiceCustomers(req.arguments,connection);
 else{assert.equal(req.name,'get_invoices');result=await getInvoices(req.arguments,connection);}
 calls.push({name:req.name,args:structuredClone(req.arguments),result});return result;};
const url=new URL('../../src/services/ai/chat.service.js',import.meta.url),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?sdk:spec==='./toolExecutor.service.js'?{executeTool}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await chat.evaluate();
let turn=async message=>(await chat.namespace.chatService({sessionId,message})).answer;
let server;
if(process.argv[4]==='http'){
 async function load(path,overrides){const url=new URL(path,import.meta.url),module=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await module.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await module.evaluate();return module.namespace;}
 const controller=await load('../../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat.namespace,'../services/sessions/oracleSession.service.js':{async getValidOracleSession(id){assert.equal(id,sessionId);return {username:'SYNTHETIC'};}}});
 const router=await load('../../src/routes/index.js',{'../controllers/chat.controller.js':controller});const app=express();app.use(express.json());app.use('/chatbot/api',router.router);server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 turn=async message=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,username:'IGNORED'})});const body=await response.json();assert.equal(response.status,200);assert.equal(body.success,true);assert.deepEqual(Object.keys(body).sort(),['actions','env','response','success']);if(/no tiene permisos/.test(body.response))assert.deepEqual(body.actions,{});return body.response;};
}
const crop=()=>{let h=store.getConversation(sessionId);for(let i=0;i<14;i++)h=trimConversation([...h,{role:'user',content:[{text:'Tema neutral'}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);assert.ok(!h.some(m=>m.content?.some(b=>b.toolUse)));store.setConversation(sessionId,h);};

try{
 store.clearConversation(sessionId);
 const first=await turn('facturas de arrendamiento m\u00ednimo del 2023 del local impacto');assert.match(first,/no tiene permisos/);
 if(!scenario.startsWith('customer-'))assert.deepEqual(attempts.at(-1).args,{customerIds:['C1'],conceptIds:['K1'],dateFrom:'01/01/2023',dateTo:'31/12/2023',mode:'detail',page:1,rows:20});
 if(trimmed)crop();stage='plate';const n=attempts.length;
 const answer=await turn(['followup','customer-followup'].includes(scenario)?'filtra tambi\u00e9n por matr\u00edcula anx123':'facturas de la matr\u00edcula anx123');
 if(scenario==='customer-followup'){assert.equal(attempts.length,n);assert.match(answer,/no tiene permisos/);assert.doesNotMatch(answer,/Ver PDF|ALLOWED-PLATE/);assert.equal(store.getSearchResolutions(sessionId).invoiceNamedRequest.phase,'denied');assert.equal(modelCalls,0);process.stdout.write('INVOICE_PLATE_SCOPE_PASS');}else{
 assert.equal(attempts.length,n+1);assert.equal(attempts.at(-1).name,'get_invoices');
 const expected=scenario==='followup'?{customerIds:['C1'],conceptIds:['K1'],dateFrom:'01/01/2023',dateTo:'31/12/2023',mode:'detail',page:1,rows:20,plate:'anx123'}:{plate:'anx123',mode:'detail',page:1,rows:20};
 assert.deepEqual(attempts.at(-1).args,expected);
 const metadata=restorePiiDeep(sessionId,store.getSearchResolutions(sessionId).contexts.get_invoices);assert.deepEqual(metadata,expected);
 if(scenario==='followup'||scenario==='denied'){assert.match(answer,/no tiene permisos/);assert.doesNotMatch(answer,/No se encontraron|ALLOWED-PLATE|Ver PDF/);}
 else if(scenario==='empty'){assert.match(answer,/No encontr\u00e9/);assert.doesNotMatch(answer,/no tiene permisos/);}
 else{assert.match(answer,/ALLOWED-PLATE/);assert.doesNotMatch(answer,/no tiene permisos|IMPACTO/);assert.match(answer,/Ver PDF/);}
 if(scenario==='mixed'){
  assert.ok(answer.includes(INVOICE_PARTIAL_ACCESS_MESSAGE));
  const result=calls.at(-1).result;
  assert.equal(result.hasRestrictedData,true);assert.equal(result.totalRows,1);assert.equal(result.totalInvoices,1);assert.equal(result.totalPages,1);assert.equal(result.hasMore,false);
  assert.equal(result.data.length,1);assert.equal(result.data[0].pdfUrl,'https://pdf.example.test/allowed.pdf');
 }
 if(scenario!=='followup'){
  assert.equal(store.getSearchResolutions(sessionId).invoiceNamedRequest,undefined);
  for(const q of queries.filter(q=>q.binds.plate)){assert.equal(q.binds.customerId0,undefined);assert.equal(q.binds.conceptId0,undefined);assert.equal(q.binds.dateFrom,undefined);assert.equal(q.binds.dateTo,undefined);assert.equal(q.binds.plate,'ANX123');assert.match(q.sql,/USER_CAN_CONSULT/);}
 }
 assert.equal(modelCalls,0);process.stdout.write('INVOICE_PLATE_SCOPE_PASS');
 }
}finally{store.clearConversation(sessionId);if(server)await new Promise(resolve=>server.close(resolve));}
