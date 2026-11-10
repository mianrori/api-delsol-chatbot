import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
import * as store from '../../src/state/conversation.store.js';import {protectPiiDeep,restorePiiDeep} from '../../src/services/ai/pii.service.js';import {trimConversation} from '../../src/services/ai/conversation.service.js';
import {getInvoices} from '../../src/services/invoices/invoices.service.js';import {searchInvoiceConcepts} from '../../src/services/invoices/searchInvoiceConcepts.service.js';import {searchInvoiceCustomers} from '../../src/services/invoices/searchInvoiceCustomers.service.js';
for(const k of ['log','info','warn','error','debug'])console[k]=()=>{};
const [scenario,trimFlag]=process.argv.slice(2),trimmed=trimFlag==='true',sessionId='SYNTHETIC-NAMED-INVOICE';let calls=[],queries=[],modelCalls=0;
const conceptAmbiguous=['concept-ambiguous','both-ambiguous','wrong-choice'].includes(scenario),customerAmbiguous=['customer-ambiguous','both-ambiguous'].includes(scenario);
const connection={async execute(sql,binds){queries.push({sql,binds:structuredClone(binds)});
 if(sql.includes('FROM DUAL')&&sql.includes('HAS_RESTRICTED_DATA'))return {rows:[{HAS_RESTRICTED_DATA:scenario==='customer-denied'?1:0}]};
 if(sql.includes('VW_BOT_CONCEPTOS'))return {rows:scenario==='concept-missing'?[]:(conceptAmbiguous?['K1','K2']:['K1']).map(id=>({COD_CONCEPTO:id,DESCRIPCION:'ARRENDAMIENTO MINIMO '+id}))};
 if(sql.includes('MATCH_PRIORITY'))return {rows:['customer-missing','customer-denied'].includes(scenario)?[]:(customerAmbiguous?['C1','C2']:['C1']).map(id=>({COD_CLIENTE:id,NOM_CLIENTE:'IMPACTO '+id,RAZON_SOCIAL:'IMPACTO LEGAL '+id,MATCH_PRIORITY:4}))};
 if(sql.includes('COUNT(*) AS TOTAL_ROWS'))return {rows:[{TOTAL_ROWS:scenario==='invoice-denied'?0:1,TOTAL_INVOICES:scenario==='invoice-denied'?0:1,HAS_RESTRICTED_DATA:['invoice-denied','mixed-access'].includes(scenario)?1:0}]};
 if(scenario==='invoice-denied')return {rows:[]};
 return {rows:[{NRO_FACTURA:'SYNTHETIC-F1',COD_CLIENTE:binds.customerId0,NOM_CLIENTE:'IMPACTO',COD_CONCEPTO:binds.conceptId0,DES_CONCEPTO:'ARRENDAMIENTO MINIMO',IMPORTE:100,FECHA_EMISION:'2023-01-02'}]};
}};
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});const synthetic=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;throw Error('MODEL_MUST_NOT_SWAP_EXPLICIT_ROLES');}},ConverseCommand:class{}};
const executeTool=async req=>{assert.equal(req.context.sessionId,sessionId);let result;
 if(req.name==='search_invoice_concepts')result=await searchInvoiceConcepts(req.arguments,connection);
 else if(req.name==='search_invoice_customers')result=await searchInvoiceCustomers(req.arguments,connection);
 else{assert.equal(req.name,'get_invoices');result=await getInvoices(req.arguments,connection);}
 calls.push({name:req.name,args:structuredClone(req.arguments),result});return result;};
const url=new URL('../../src/services/ai/chat.service.js',import.meta.url),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?sdk:spec==='./toolExecutor.service.js'?{executeTool}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await chat.evaluate();
const turn=async message=>(await chat.namespace.chatService({sessionId,message})).answer;
const crop=()=>{let h=store.getConversation(sessionId);for(let i=0;i<14;i++)h=trimConversation([...h,{role:'user',content:[{text:'Tema neutral'}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);assert.ok(!h.some(m=>m.content?.some(b=>b.toolUse)));store.setConversation(sessionId,h);};
try{
 store.clearConversation(sessionId);
 if(scenario==='prior')store.setConversation(sessionId,protectPiiDeep(sessionId,[{role:'user',content:[{text:'Facturas anteriores'}]},{role:'assistant',content:[{toolUse:{name:'get_invoices',toolUseId:'old',input:{customerIds:['OLD'],conceptIds:['OLDK'],dateFrom:'01/01/2024',dateTo:'31/12/2024',plate:'OLD123',cancelled:true,mode:'detail'}}}]},{role:'user',content:[{toolResult:{toolUseId:'old',status:'success',content:[{json:{page:1,data:[]}}]}}]}]));
 let answer=await turn('facturas de arrendamiento m\u00ednimo del 2023 del local impacto');
 assert.equal(calls[0].name,'search_invoice_concepts');assert.equal(calls[0].args.query,'arrendamiento m\u00ednimo');
 if(['customer-denied','invoice-denied'].includes(scenario)){assert.match(answer,/no tiene permisos/);assert.doesNotMatch(answer,/no se encontr|SYNTHETIC-F1|Ver PDF/i);assert.equal(calls.length,scenario==='customer-denied'?1:2);}
 else if(scenario==='concept-missing'){assert.match(answer,/concepto de facturaci\u00f3n/);assert.equal(calls.length,1);}
 else if(scenario==='wrong-choice'){assert.match(answer,/Selecciona el concepto/);const n=calls.length;answer=await turn('99');assert.equal(calls.length,n);assert.match(answer,/Selecciona el concepto/);}
 else{
  if(conceptAmbiguous){assert.match(answer,/Selecciona el concepto/);assert.equal(calls.length,1);if(trimmed)crop();answer=await turn('2');}
  const customer=calls.find(c=>c.name==='search_invoice_customers');assert.deepEqual(customer.args,{query:'impacto',dateFrom:'01/01/2023',dateTo:'31/12/2023'});
  if(scenario==='customer-missing'){assert.match(answer,/cliente\/local/);assert.ok(!calls.some(c=>c.name==='get_invoices'));}
  else{
   if(customerAmbiguous){assert.match(answer,/Selecciona el cliente\/local/);assert.ok(!calls.some(c=>c.name==='get_invoices'));if(trimmed)crop();answer=await turn('2');}
   const invoice=calls.find(c=>c.name==='get_invoices');assert.ok(invoice);assert.deepEqual(invoice.args,{customerIds:[customerAmbiguous?'C2':'C1'],conceptIds:[conceptAmbiguous?'K2':'K1'],dateFrom:'01/01/2023',dateTo:'31/12/2023',mode:'detail',page:1,rows:20});
   assert.match(answer,/IMPACTO/);assert.match(answer,/ARRENDAMIENTO MINIMO/);assert.doesNotMatch(answer,/cliente \*\*arrendamiento|identificador m\u00e1s preciso/i);
   if(scenario==='mixed-access')assert.match(answer,/No est\u00e1 autorizado a consultar parte/);
   const metadata=restorePiiDeep(sessionId,store.getSearchResolutions(sessionId).invoiceNamedRequest);assert.equal(metadata.phase,'complete');assert.deepEqual(metadata.input,invoice.args);assert.ok(!JSON.stringify(metadata).includes('SYNTHETIC-F1'));
   const sql=queries.filter(q=>q.sql.includes('VW_BOT_FACTURAS')&&!q.sql.includes('MATCH_PRIORITY'));assert.equal(sql.length,2);for(const q of sql){assert.equal(q.binds.dateFrom,'01/01/2023');assert.equal(q.binds.dateTo,'31/12/2023');assert.equal(q.binds.customerId0,invoice.args.customerIds[0]);assert.equal(q.binds.conceptId0,invoice.args.conceptIds[0]);assert.equal(q.binds.plate,undefined);assert.match(q.sql,/USER_CAN_CONSULT/);}
  }
 }
 assert.equal(modelCalls,0);process.stdout.write('INVOICE_NAMED_PASS');
}finally{store.clearConversation(sessionId);}
