import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as store from '../../src/state/conversation.store.js';
import {recordSearchToolResult} from '../../src/services/ai/searchSelection.service.js';
import {trimConversation} from '../../src/services/ai/conversation.service.js';
import {protectPiiDeep,restorePiiDeep} from '../../src/services/ai/pii.service.js';
import {getSales} from '../../src/services/sales/sales.service.js';
import {resolveCategory} from '../../src/services/categories/category.resolver.js';
const [scenario,trimFlag]=process.argv.slice(2),trimmed=trimFlag==='true',s='SYNTHETIC-COMPARISON';
for(const k of ['log','info','warn','error','debug'])console[k]=()=>{};
let calls=[],queries=[],modelCalls=0;
const connection={async execute(sql,binds){
 queries.push({sql,binds:structuredClone(binds)});
 if(sql.includes('AS SCOPE_ID'))return {rows:Object.values(binds).map(id=>({SCOPE_ID:id,SCOPE_NAME:sql.includes('VW_BOT_CLIENTES')?'Local autorizado':'Ropa femenina autorizada'}))};
 if(sql.includes('VW_BOT_RUBROS_LOCALES'))return {rows:scenario==='not-found'?[]:(scenario==='ambiguous'?['R1','R2']:['R1']).map(id=>({COD_RUBRO:id,DESCRIPCION:'Ropa femenina autorizada '+id,EXACT_MATCH:0,EXACT_MATCH_COUNT:0,TOTAL_MATCHES:scenario==='ambiguous'?2:1,SIMILARITY:90}))};
 if(scenario==='no-sales')return {rows:[]};
 const early=binds.dateFrom.endsWith('2022');return {rows:[{MONTH:early?'01':'02',TOTAL_AMOUNT:early?0:120,TOTAL_INVOICES:early?0:4,CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_ABBREVIATION:'PYG'}]};
}};
const executeTool=async request=>{let result;if(request.name==='search_categories')result=await resolveCategory(request.arguments.search,connection);else{assert.equal(request.name,'get_sales');result=await getSales(request.arguments,connection,'SYNTHETIC');}calls.push({name:request.name,args:structuredClone(request.arguments),result});return result;};
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;throw Error('UNEXPECTED_MODEL_CALL');}},ConverseCommand:class{}};
const url=new URL('../../src/services/ai/chat.service.js',import.meta.url),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?sdk:spec==='./toolExecutor.service.js'?{executeTool}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await chat.evaluate();
const crop=()=>{let h=store.getConversation(s);for(let i=0;i<14;i++)h=trimConversation([...h,{role:'user',content:[{text:'Tema neutral'}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);assert.ok(!h.some(m=>m.content?.some(b=>b.toolUse)));store.setConversation(s,h);};
const turn=async message=>{calls=[];queries=[];return (await chat.namespace.chatService({sessionId:s,message})).answer;};
const prior={customerIds:['COLD'],categoryIds:['ROLD'],dayType:'weekday',dateFrom:'01/01/2023',dateTo:'30/04/2023',groupBy:['customer'],metrics:['totalAmount']};
try{
 store.clearConversation(s);
 if(scenario.includes('prior')||scenario==='followup'){
  recordSearchToolResult(s,'search_customers',{},protectPiiDeep(s,{status:'RESOLVED',customer:{codCliente:'COLD'}}));recordSearchToolResult(s,'search_categories',{},protectPiiDeep(s,{status:'RESOLVED',category:{codRubro:'ROLD'}}));recordSearchToolResult(s,'get_sales',protectPiiDeep(s,prior),{});
  const state=store.getSearchResolutions(s);state.salesMetrics=['totalAmount'];store.setSearchResolutions(s,state);
  store.setConversation(s,protectPiiDeep(s,[{role:'user',content:[{text:'Ventas previas'}]},{role:'assistant',content:[{toolUse:{name:'get_sales',toolUseId:'prior',input:prior}}]},{role:'user',content:[{toolResult:{toolUseId:'prior',status:'success',content:[{json:{data:[]}}]}}]}]));
 }
 if(trimmed)crop();
 const global=scenario.startsWith('global'),followup=scenario==='followup';
 let answer=await turn(followup?'Compara ese mismo rubro con 2022':global?'Compara las ventas mensuales de 2022 con las de 2023':'Compara las ventas mensuales del rubro ropa femenina de 2022 con las de 2023');
 if(scenario==='not-found'){assert.equal(calls.length,1);assert.equal(calls[0].result.status,'NOT_FOUND');assert.match(answer,/cat\u00e1logo autorizado/);assert.doesNotMatch(answer,/no se encontraron registros/i);assert.equal(store.getSearchResolutions(s).domains.search_categories.kind,'pending');}
 else{
  if(scenario==='ambiguous'){
   assert.equal(calls.length,1);assert.equal(calls[0].result.status,'AMBIGUOUS');assert.match(answer,/Selecciona un rubro/);assert.match(answer,/Ropa femenina autorizada R1/);assert.match(answer,/Ropa femenina autorizada R2/);
   assert.equal(store.getSearchResolutions(s).salesComparison.pending,true);if(trimmed)crop();answer=await turn('2');
  }
  const sales=calls.filter(c=>c.name==='get_sales');assert.equal(sales.length,2);
  const years=followup?['2023','2022']:['2022','2023'],metrics=followup?['totalAmount']:['totalAmount','totalInvoices'];
  for(const [i,c]of sales.entries()){
   const expected={...(followup?{customerIds:['COLD'],categoryIds:['ROLD'],dayType:'weekday'}:global?{}:{categoryIds:[scenario==='ambiguous'?'R2':'R1']}),dateFrom:'01/01/'+years[i],dateTo:(followup?'30/04/':'31/12/')+years[i],groupBy:['month'],metrics};assert.deepEqual(c.args,expected);
  }
  const state=restorePiiDeep(s,store.getSearchResolutions(s));assert.deepEqual(state.contexts.get_sales,sales[1].args);assert.equal(state.salesComparison.pending,false);assert.deepEqual(state.salesComparison.inputs,sales.map(c=>c.args));
  if(!followup){assert.equal(state.domains.search_customers.kind,'cleared');assert.equal(state.domains.search_categories.kind,global?'cleared':'selected');assert.equal(state.salesMetrics,undefined);}else assert.deepEqual(state.salesMetrics,['totalAmount']);
  assert.match(answer,global?/Alcance: todos los locales; todos los rubros/:followup?/Alcance: local Local autorizado; rubro Ropa femenina autorizada; d\u00edas h\u00e1biles/:/Alcance: todos los locales del rubro Ropa femenina autorizada/);
  for(const y of years){assert.ok(answer.includes('01/01/'+y));assert.ok(answer.includes((followup?'30/04/':'31/12/')+y));}
  if(scenario==='no-sales'){assert.match(answer,/No se encontraron registros para ninguno/);assert.doesNotMatch(answer,/no se encontr\u00f3 un rubro/i);}
  else{assert.match(answer,/Ventas 2022/);assert.equal(answer.includes('Facturas 2022'),!followup);assert.match(answer,/Sin registros/);assert.match(answer,/no se reemplaza por cero/);assert.match(answer,/\| Enero \|.* 0/);assert.equal((answer.match(/^\| (?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) /gm)??[]).length,followup?4:12);}
  const sql=queries.filter(q=>q.sql.includes('VW_BOT_VENTAS_LOCALES'));assert.equal(sql.length,2);for(const q of sql){assert.match(q.sql,/TO_CHAR\(FECHA, 'MM'\)/);assert.equal(q.sql.includes('COD_CLIENTE IN'),followup);assert.equal(q.sql.includes('COD_RUBRO IN'),!global);assert.equal(q.sql.includes('SUM(CANTIDAD_FACTURAS)'),!followup);}
 }
 assert.equal(modelCalls,0);process.stdout.write('MONTHLY_COMPARISON_PASS');
}finally{store.clearConversation(s);}
