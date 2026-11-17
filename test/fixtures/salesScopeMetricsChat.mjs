import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as store from '../../src/state/conversation.store.js';
import {trimConversation} from '../../src/services/ai/conversation.service.js';
import {protectPiiDeep,restorePiiDeep} from '../../src/services/ai/pii.service.js';
import {getSales} from '../../src/services/sales/sales.service.js';
const originals=Object.fromEntries(['log','info','warn','error','debug'].map(k=>[k,console[k]]));for(const k of Object.keys(originals))console[k]=()=>{};
const s='SYNTHETIC-NAMES-METRICS',both=['totalAmount','totalInvoices'];
const customers={C1:'Nike catálogo',C2:'Otro local catálogo'},categories={R1:'Librería',R2:'Deportes'};
let plans=[],calls=[],queries=[];
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
const model={BedrockRuntimeClient:class{async send(){const next=plans.shift();return {stopReason:next?'tool_use':'end_turn',output:{message:{role:'assistant',content:next?[{toolUse:{name:next.name,toolUseId:'synthetic-'+Math.random(),input:next.name.startsWith('search_')?next.input:protectPiiDeep(s,next.input)}}]:[{text:'Consulta completada.'}]}}};}},ConverseCommand:class{}};
const connection={async execute(sql,binds){
 queries.push({sql,binds});
 if(sql.includes('AS SCOPE_ID'))return {rows:Object.values(binds).map(id=>({SCOPE_ID:id,SCOPE_NAME:(sql.includes('VW_BOT_CLIENTES')?customers:categories)[id]}))};
 return {rows:[{MONTH:'02',TOTAL_AMOUNT:120,TOTAL_INVOICES:4,CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_ABBREVIATION:'PYG'}]};
}};
const executeTool=async request=>{
 if(request.name==='search_customers')return request.arguments.search==='opciones'?{status:'AMBIGUOUS',options:Object.entries(customers).map(([codCliente,name],i)=>({optionId:String(i+1),codCliente,name}))}:{status:'RESOLVED',customer:{codCliente:'C1',name:customers.C1}};
 if(request.name==='search_categories'){const codRubro=request.arguments.search==='Deportes'?'R2':'R1';return {status:'RESOLVED',category:{codRubro,name:categories[codRubro]}};}
 assert.equal(request.name,'get_sales');const result=await getSales(request.arguments,connection,'SYNTHETIC');calls.push({args:structuredClone(request.arguments),result});return result;
};
const url=new URL('../../src/services/ai/chat.service.js',import.meta.url),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?model:spec==='./toolExecutor.service.js'?{executeTool}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await chat.evaluate();
const step=(name,input)=>({name,input}),sales=input=>step('get_sales',{metrics:['totalAmount'],customerName:'MODEL INVENTED',...input});
const turn=async(message,steps)=>{plans=[...steps];calls=[];queries=[];const r=await chat.namespace.chatService({sessionId:s,message});assert.equal(plans.length,0);return r.answer;};
const trim=()=>{let h=store.getConversation(s);for(let i=0;i<14;i++)h=trimConversation([...h,{role:'user',content:[{text:`Tema ${i}`}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);assert.ok(!h.some(m=>m.content?.some(b=>b.toolUse)));store.setConversation(s,h);};
const args=()=>calls.at(-1).args;
try{
 for(const trimmed of [false,true]){
  store.clearConversation(s);
  await turn('Ventas de Nike de enero a abril de 2023',[step('search_customers',{search:'Nike'}),sales({dateFrom:'01/01/2023',dateTo:'30/04/2023',groupBy:['month'],dayType:'weekday'})]);assert.deepEqual(args().metrics,both);
  if(trimmed)trim();
  let answer=await turn('Filtra también por librería',[step('search_categories',{search:'librería'}),sales({})]);
  assert.match(answer,/Alcance: local Nike catálogo; rubro Librería; días hábiles/);assert.match(answer,/Cantidad de facturas/);assert.doesNotMatch(answer,/MODEL INVENTED/);
  const scope={customerIds:['C1'],categoryIds:['R1'],dateFrom:'01/01/2023',dateTo:'30/04/2023',groupBy:['month'],dayType:'weekday'};for(const[k,v]of Object.entries(scope))assert.deepEqual(args()[k],v);
  answer=await turn('Muestra solo el importe',[sales({metrics:both})]);assert.deepEqual(args().metrics,['totalAmount']);assert.doesNotMatch(answer,/Cantidad de facturas/);
  trim();await turn('Cambia el período a febrero de 2023',[sales({dateFrom:'01/02/2023',dateTo:'28/02/2023',metrics:both})]);assert.deepEqual(args().metrics,['totalAmount']);assert.deepEqual(args().customerIds,['C1']);assert.deepEqual(args().categoryIds,['R1']);
  answer=await turn('Solo cantidad de facturas',[sales({})]);assert.deepEqual(args().metrics,['totalInvoices']);assert.match(answer,/Cantidad de facturas/);assert.doesNotMatch(answer,/Ventas totales/);
  await turn('Ambas métricas',[sales({})]);assert.deepEqual(args().metrics,both);
  await turn('Busca opciones de local',[step('search_customers',{search:'opciones'})]);trim();
  answer=await turn('2',[sales({})]);assert.deepEqual(args().customerIds,['C2']);assert.match(answer,/Otro local catálogo; rubro Librería/);assert.doesNotMatch(answer,/Nike catálogo/);
  answer=await turn('Cambia el rubro',[step('search_categories',{search:'Deportes'}),sales({})]);assert.deepEqual(args().categoryIds,['R2']);assert.match(answer,/Otro local catálogo; rubro Deportes/);assert.doesNotMatch(answer,/Librería/);
  answer=await turn('Todos los locales',[sales({customerIds:['C1']})]);assert.equal(args().customerIds,undefined);assert.match(answer,/todos los locales del rubro Deportes; días hábiles/);assert.doesNotMatch(answer,/Otro local catálogo|Nike catálogo/);
  answer=await turn('Todos los rubros',[]);assert.match(answer,/todos los locales; todos los rubros/);assert.doesNotMatch(answer,/Deportes/);
  const state=restorePiiDeep(s,store.getSearchResolutions(s));assert.deepEqual(state.contexts.get_sales.metrics,both);assert.equal(state.contexts.get_sales.dateFrom,'01/02/2023');assert.equal(state.contexts.get_sales.dateTo,'28/02/2023');assert.deepEqual(state.contexts.get_sales.groupBy,['month']);assert.equal(state.contexts.get_sales.dayType,'weekday');
 }
 process.stdout.write('SALES_SCOPE_METRICS_CHAT_PASS');
}finally{store.clearConversation(s);for(const[k,v]of Object.entries(originals))console[k]=v;}
