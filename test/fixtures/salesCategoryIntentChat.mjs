import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as store from '../../src/state/conversation.store.js';
import {trimConversation} from '../../src/services/ai/conversation.service.js';
import {protectPiiDeep,restorePiiDeep} from '../../src/services/ai/pii.service.js';
const originals=Object.fromEntries(['log','info','warn','error','debug'].map(k=>[k,console[k]]));for(const k of Object.keys(originals))console[k]=()=>{};
const s='SYNTHETIC-CHAT-INTENT',first={dateFrom:'01/01/2023',dateTo:'31/05/2023',groupBy:['month'],metrics:['totalAmount']};
const nike={...first,dateTo:'30/04/2023',customerIds:['SYNTHETIC-NIKE']};
let plans=[],calls=[],prompts=[],ambiguousCustomers=false;
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
const model={BedrockRuntimeClient:class{async send(command){
 prompts.push(command.input.system);const next=plans.shift();return {stopReason:next?'tool_use':'end_turn',output:{message:{role:'assistant',content:next?[{toolUse:{name:next.name,toolUseId:'synthetic-'+prompts.length,input:next.name==='search_categories'?next.input:protectPiiDeep(s,next.input)}}]:[{text:'Consulta completada.'}]}}};
}},ConverseCommand:class{constructor(input){this.input=input;}}};
const executeTool=async request=>{
 calls.push(structuredClone({name:request.name,args:request.arguments}));
 if(request.name==='search_customers')return ambiguousCustomers?{status:'AMBIGUOUS',options:[{optionId:'1',codCliente:'SYNTHETIC-NIKE-1'},{optionId:'2',codCliente:'SYNTHETIC-NIKE-2'}]}:{status:'RESOLVED',customer:{codCliente:'SYNTHETIC-NIKE'}};
 if(request.name==='search_categories')return {status:'RESOLVED',category:{codRubro:'SYNTHETIC-LIBRARY'}};
 assert.equal(request.name,'get_sales');return {data:[]};
};
const url=new URL('../../src/services/ai/chat.service.js',import.meta.url),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?model:spec==='./toolExecutor.service.js'?{executeTool}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
await chat.evaluate();
const turn=async(message,steps)=>{plans=[...steps];calls=[];prompts=[];await chat.namespace.chatService({sessionId:s,message});assert.equal(plans.length,0);};
try{
 await turn('¿Cuánto vendieron los locales de enero a mayo de 2023, por mes?',[{name:'get_sales',input:first}]);assert.deepEqual(calls.at(-1).args,first);
 await turn('Ventas de Nike de enero a abril de 2023',[{name:'search_customers',input:{search:'Nike'}},{name:'get_sales',input:nike}]);assert.deepEqual(calls.at(-1).args,nike);
 const priorHistory=structuredClone(store.getConversation(s)),priorState=store.getSearchResolutions(s);
 for(const trimmed of [false,true])for(const autonomous of [true,false]){
  let history=structuredClone(priorHistory);store.setSearchResolutions(s,priorState);
  if(trimmed){for(let i=0;i<14;i++)history=trimConversation([...history,{role:'user',content:[{text:`Tema ${i}`}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);assert.ok(!history.some(m=>m.content?.some(b=>b.toolUse)));}
  store.setConversation(s,history);
  const input=autonomous?{...nike,categoryIds:['SYNTHETIC-LIBRARY'],dateFrom:'01/01/2024',dateTo:'31/12/2024',groupBy:['year'],dayType:'weekend'}:{categoryIds:['SYNTHETIC-LIBRARY']};
  await turn(autonomous?'Ventas del rubro librería durante 2023, por mes':'Filtra también por librería',[{name:'search_categories',input:{search:'librería'}},{name:'get_sales',input}]);
  const expected={...nike,categoryIds:['SYNTHETIC-LIBRARY']};if(autonomous){delete expected.customerIds;expected.dateTo='31/12/2023';}
  assert.deepEqual(calls.at(-1).args,expected);
  const state=store.getSearchResolutions(s);assert.deepEqual(restorePiiDeep(s,state.contexts.get_sales),expected);assert.equal(state.domains.search_customers.kind,autonomous?'cleared':'selected');assert.equal(state.domains.search_categories.kind,'selected');
  const prompt=JSON.stringify(prompts[0]);assert.match(prompt,/Estado de filtros de ventas/);assert.ok(!prompt.includes('SYNTHETIC-NIKE'));assert.match(prompt,autonomous?/31\/12\/2023/:/30\/04\/2023/);
 }
 store.clearConversation(s);await turn('Ventas globales de enero a mayo de 2023 por mes',[{name:'get_sales',input:first}]);
 ambiguousCustomers=true;await turn('Ventas de Nike de enero a abril de 2023',[{name:'search_customers',input:{search:'Nike'}}]);
 assert.equal(store.getSearchResolutions(s).contexts.get_sales.dateTo,'30/04/2023');
 await turn('2',[{name:'get_sales',input:{...first,customerIds:['MODEL-WRONG'],dayType:'weekend'}}]);
 assert.deepEqual(calls.at(-1).args,{...nike,customerIds:['SYNTHETIC-NIKE-2']});
 process.stdout.write('SALES_CATEGORY_INTENT_CHAT_PASS');
}finally{store.clearConversation(s);for(const[k,v]of Object.entries(originals))console[k]=v;}
