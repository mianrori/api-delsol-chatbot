import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as store from '../../src/state/conversation.store.js';
import {recordSearchToolResult} from '../../src/services/ai/searchSelection.service.js';
import {trimConversation} from '../../src/services/ai/conversation.service.js';
import {protectPiiDeep,restorePiiDeep} from '../../src/services/ai/pii.service.js';
import {getSales} from '../../src/services/sales/sales.service.js';
const originals=Object.fromEntries(['log','info','warn','error','debug'].map(k=>[k,console[k]]));for(const k of Object.keys(originals))console[k]=()=>{};
const [scenario,trimFlag]=process.argv.slice(2),trimmed=trimFlag==='true';assert.ok(['period','metrics'].includes(scenario));
const s='SYNTHETIC-NO-SOLO',both=['totalAmount','totalInvoices'];
const base={customerIds:['C1'],categoryIds:['R1'],dateFrom:'01/01/2023',dateTo:'31/01/2023',groupBy:['month'],dayType:'weekday'};
let plans=[],calls=[],queries=[],toolId=0;
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
const model={BedrockRuntimeClient:class{async send(){const input=plans.shift();return {stopReason:input?'tool_use':'end_turn',output:{message:{role:'assistant',content:input?[{toolUse:{name:'get_sales',toolUseId:'controlled-'+(++toolId),input:protectPiiDeep(s,input)}}]:[{text:'Consulta completada.'}]}}};}},ConverseCommand:class{}};
const connection={async execute(sql,binds){
 queries.push({sql,binds:structuredClone(binds)});
 if(sql.includes('AS SCOPE_ID'))return {rows:Object.values(binds).map(id=>({SCOPE_ID:id,SCOPE_NAME:sql.includes('VW_BOT_CLIENTES')?'Nike catálogo':'Librería'}))};
 const row=(month,amount,invoices)=>({MONTH:month,TOTAL_AMOUNT:amount,TOTAL_INVOICES:invoices,CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_ABBREVIATION:'PYG'});
 return {rows:binds.dateTo==='28/02/2023'?[row('01',120,4),row('02',130,5)]:[row('01',120,4)]};
}};
const executeTool=async request=>{assert.equal(request.name,'get_sales');const result=await getSales(request.arguments,connection,'SYNTHETIC');calls.push({args:structuredClone(request.arguments),result});return result;};
const url=new URL('../../src/services/ai/chat.service.js',import.meta.url),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?model:spec==='./toolExecutor.service.js'?{executeTool}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await chat.evaluate();
const turn=async(message,input)=>{plans=[input];calls=[];queries=[];const r=await chat.namespace.chatService({sessionId:s,message});assert.equal(plans.length,0);assert.equal(calls.length,1);return r.answer;};
const crop=()=>{let history=store.getConversation(s);for(let i=0;i<14;i++)history=trimConversation([...history,{role:'user',content:[{text:`Tema ${i}`}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);assert.ok(!history.some(m=>m.content?.some(b=>b.toolUse)));store.setConversation(s,history);};
const verify=(answer,metrics)=>{
 const expected={...base,dateTo:'28/02/2023',metrics};assert.deepEqual(calls[0].args,expected);
 const state=restorePiiDeep(s,store.getSearchResolutions(s));assert.deepEqual(state.salesMetrics,metrics);assert.deepEqual(state.contexts.get_sales,expected);assert.equal(state.domains.search_customers.kind,'selected');assert.equal(state.domains.search_categories.kind,'selected');
 const salesSql=queries.filter(q=>q.sql.includes('VW_BOT_VENTAS_LOCALES'));assert.equal(salesSql.length,1);assert.equal(salesSql[0].binds.dateFrom,expected.dateFrom);assert.equal(salesSql[0].binds.dateTo,expected.dateTo);assert.match(salesSql[0].sql,/TO_CHAR\(FECHA, 'MM'\)/);assert.match(salesSql[0].sql,/BETWEEN 0 AND 4/);assert.equal(/SUM\(CANTIDAD_FACTURAS\)/.test(salesSql[0].sql),metrics.includes('totalInvoices'));
 assert.match(answer,/01\/01\/2023 a 28\/02\/2023/);assert.match(answer,/Enero/);assert.match(answer,/Febrero/);assert.match(answer,/Alcance: local Nike catálogo; rubro Librería; días hábiles/);assert.match(answer,/Ventas totales/);
 assert.equal(answer.includes('Cantidad de facturas'),metrics.includes('totalInvoices'));
 for(const row of calls[0].result.data)assert.equal(Object.hasOwn(row,'totalInvoices'),metrics.includes('totalInvoices'));
};
try{
 store.clearConversation(s);
 recordSearchToolResult(s,'search_customers',{},protectPiiDeep(s,{status:'RESOLVED',customer:{codCliente:'C1'}}));recordSearchToolResult(s,'search_categories',{},protectPiiDeep(s,{status:'RESOLVED',category:{codRubro:'R1'}}));
 await turn('Ventas de enero de 2023 por mes en días hábiles',base);
 await turn('Muestra solo el importe',{metrics:both});assert.deepEqual(calls[0].args.metrics,['totalAmount']);
 if(trimmed)crop();
 const periodAnswer=await turn('No solo enero, también febrero',{dateTo:'28/02/2023',metrics:both});verify(periodAnswer,['totalAmount']);
 if(scenario==='metrics'){
  if(trimmed)crop();
  const bothAnswer=await turn('No solo el importe, también las facturas',{metrics:['totalAmount']});verify(bothAnswer,both);
 }
 process.stdout.write('SALES_METRICS_NO_SOLO_PASS');
}finally{store.clearConversation(s);for(const[k,v]of Object.entries(originals))console[k]=v;}
