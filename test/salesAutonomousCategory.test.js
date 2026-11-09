import test from 'node:test';
import assert from 'node:assert/strict';
import {getAutonomousCategorySalesIntent,getExplicitSalesRange} from '../src/services/ai/searchFilterIntent.service.js';
import {beginSearchSelectionTurn,recordSearchToolResult,preserveSearchSelection,captureSearchQueryContext} from '../src/services/ai/searchSelection.service.js';
import {getSearchResolutions,getSearchSelectionTurn,clearConversation} from '../src/state/conversation.store.js';
import {trimConversation} from '../src/services/ai/conversation.service.js';
import {getSalesRepository} from '../src/repositories/sales/sales.repository.js';
const user=text=>({role:'user',content:[{text}]}),assistant=text=>({role:'assistant',content:[{text}]});
const first={dateFrom:'01/01/2023',dateTo:'31/05/2023',groupBy:['month'],metrics:['totalAmount']};
const nike={...first,dateTo:'30/04/2023',customerIds:['SYNTHETIC-NIKE']};
const autonomous='Ventas del rubro librería durante 2023, por mes';
const followup='Filtra también por librería';
const guard=(s,name,input,history)=>{
 captureSearchQueryContext(s,name,input);
 return preserveSearchSelection({name,input,history,resolutionState:getSearchResolutions(s),selectionTurn:getSearchSelectionTurn(s)});
};
const append=(history,id,input)=>[...history,{role:'assistant',content:[{toolUse:{name:'get_sales',toolUseId:id,input}}]},{role:'user',content:[{toolResult:{toolUseId:id,status:'success',content:[{json:{data:[]}}]}}]}];

for(const trimmed of [false,true])for(const intent of ['autonomous','additive'])test(`${intent} category sales after all-locals then Nike; trimmed=${trimmed}`,async()=>{
 const s=`SYNTHETIC-${intent}-${trimmed}`;clearConversation(s);
 try{
  // Execute both antecedents through the real turn/guard/state lifecycle.
  let history=[user('¿Cuánto vendieron los locales de enero a mayo de 2023, por mes?')];
  beginSearchSelectionTurn(s,history[0].content[0].text);
  assert.deepEqual(guard(s,'get_sales',first,history),first);recordSearchToolResult(s,'get_sales',first,{data:[]});history=append(history,'first',first);
  history.push(user('Ventas de Nike de enero a abril de 2023'));beginSearchSelectionTurn(s,history.at(-1).content[0].text);
  assert.deepEqual(guard(s,'search_customers',{search:'Nike'},history),{search:'Nike'});
  recordSearchToolResult(s,'search_customers',{}, {status:'RESOLVED',customer:{codCliente:nike.customerIds[0]}});
  assert.deepEqual(guard(s,'get_sales',nike,history),nike);recordSearchToolResult(s,'get_sales',nike,{data:[]});history=append(history,'nike',nike);
  if(trimmed){for(let i=0;i<14;i++)history=trimConversation([...history,user(`Tema ${i}`),assistant('Respuesta')],10);assert.ok(!JSON.stringify(history).includes('toolUseId'));}
  const message=intent==='autonomous'?autonomous:followup;history.push(user(message));const saved=structuredClone(history);
  beginSearchSelectionTurn(s,message);
  if(intent==='autonomous'){
   assert.equal(getSearchResolutions(s).domains.search_customers.kind,'cleared');
   assert.deepEqual(getSearchResolutions(s).contexts.get_sales,{dateFrom:'01/01/2023',dateTo:'31/12/2023',groupBy:['month']});
   assert.throws(()=>guard(s,'search_categories',{search:'deportes'},history),{code:'SEARCH_SELECTION_REQUIRED'});
   assert.throws(()=>guard(s,'get_sales',nike,history),{code:'SEARCH_SELECTION_REQUIRED'});
  }else assert.equal(getSearchResolutions(s).domains.search_customers.kind,'selected');
  guard(s,'search_categories',{search:'librería'},history);
  recordSearchToolResult(s,'search_categories',{}, {status:'RESOLVED',category:{codRubro:'SYNTHETIC-LIBRARY'}});
  const proposal=intent==='autonomous'?{...nike,categoryIds:['MODEL-WRONG'],dayType:'weekend'}:{categoryIds:['MODEL-WRONG']};
  const before=structuredClone(proposal),expected={...nike,categoryIds:['SYNTHETIC-LIBRARY']};
  if(intent==='autonomous'){delete expected.customerIds;expected.dateTo='31/12/2023';}
  const args=guard(s,'get_sales',proposal,history);assert.deepEqual(args,expected);assert.deepEqual(proposal,before);assert.deepEqual(history,saved);
  const statements=[];await getSalesRepository({connection:{async execute(sql,binds){statements.push({sql,binds});return {rows:[]};}},...args});
  assert.equal(statements.length,1);assert.equal(/COD_CLIENTE IN/.test(statements[0].sql),intent==='additive');assert.match(statements[0].sql,/COD_RUBRO IN/);assert.match(statements[0].sql,/TO_CHAR\(FECHA, 'MM'\)/);assert.equal(statements[0].binds.dateTo,expected.dateTo);
  recordSearchToolResult(s,'get_sales',args,{data:[]});const state=getSearchResolutions(s);
  assert.deepEqual(state.contexts.get_sales,expected);assert.equal(state.domains.search_customers.kind,intent==='autonomous'?'cleared':'selected');assert.equal(state.domains.search_categories.kind,'selected');
  args.categoryIds.push('MUTATED');assert.deepEqual(getSearchResolutions(s).contexts.get_sales.categoryIds,['SYNTHETIC-LIBRARY']);
 }finally{clearConversation(s);}
});

test('autonomous grammar requires its own sales subject and complete period',()=>{
 assert.deepEqual(getAutonomousCategorySalesIntent(autonomous),{search:'libreria',dateFrom:'01/01/2023',dateTo:'31/12/2023',groupBy:['month']});
 for(const text of [followup,'Ahora por mes','Ventas del rubro librería','Filtra también por librería durante 2023, por mes','Todos los locales','2'])assert.equal(getAutonomousCategorySalesIntent(text),null,text);
 assert.deepEqual(getExplicitSalesRange('Ventas de Nike de enero a abril de 2023'),{dateFrom:'01/01/2023',dateTo:'30/04/2023'});
 assert.equal(getExplicitSalesRange('Filtra también por librería'),null);
 assert.equal(getExplicitSalesRange('Ventas de Nike de mayo a enero de 2023'),null);
});

for(const trimmed of [false,true])test(`explicit Nike period survives lookup-only ambiguity without a proposed sales call; trimmed=${trimmed}`,()=>{
 const s=`SYNTHETIC-PENDING-PERIOD-${trimmed}`;clearConversation(s);
 try{
  recordSearchToolResult(s,'get_sales',first,{data:[]});let history=append([user('Ventas anteriores')],'first',first);
  const question='Ventas de Nike de enero a abril de 2023';history.push(user(question));beginSearchSelectionTurn(s,question);
  guard(s,'search_customers',{search:'Nike'},history);
  recordSearchToolResult(s,'search_customers',{}, {status:'AMBIGUOUS',options:[{optionId:'1',codCliente:'SYNTHETIC-NIKE-1'},{optionId:'2',codCliente:'SYNTHETIC-NIKE-2'}]});
  assert.deepEqual(getSearchResolutions(s).contexts.get_sales,{...first,dateTo:'30/04/2023'});
  if(trimmed)for(let i=0;i<14;i++)history=trimConversation([...history,user(`Tema ${i}`),assistant('Respuesta')],10);
  history.push(user('2'));beginSearchSelectionTurn(s,'2');
  const args=guard(s,'get_sales',{...first,customerIds:['MODEL-WRONG'],groupBy:['year'],dayType:'weekend'},history);
  assert.deepEqual(args,{...nike,customerIds:['SYNTHETIC-NIKE-2']});recordSearchToolResult(s,'get_sales',args,{data:[]});assert.deepEqual(getSearchResolutions(s).contexts.get_sales,args);
 }finally{clearConversation(s);}
});

for(const trimmed of [false,true])test(`new category replaces stale category and day type through ambiguity and selection; trimmed=${trimmed}`,()=>{
 const s=`SYNTHETIC-AMBIGUOUS-${trimmed}`;clearConversation(s);
 try{
  recordSearchToolResult(s,'search_customers',{}, {status:'RESOLVED',customer:{codCliente:nike.customerIds[0]}});
  recordSearchToolResult(s,'search_categories',{}, {status:'RESOLVED',category:{codRubro:'SYNTHETIC-OLD'}});
  recordSearchToolResult(s,'get_sales',{...nike,dayType:'weekend',categoryIds:['SYNTHETIC-OLD']},{data:[]});
  let history=append([user('Ventas anteriores')],'old-with-day',{...nike,dayType:'weekend',categoryIds:['SYNTHETIC-OLD']});history.push(user(autonomous));beginSearchSelectionTurn(s,autonomous);
  guard(s,'search_categories',{search:'libreria'},history);
  recordSearchToolResult(s,'search_categories',{}, {status:'AMBIGUOUS',options:[{optionId:'1',codRubro:'SYNTHETIC-R1'},{optionId:'2',codRubro:'SYNTHETIC-R2'}]});
  const proposal={...nike,categoryIds:['SYNTHETIC-OLD'],dayType:'weekend'};
  assert.throws(()=>guard(s,'get_sales',proposal,history),{code:'SEARCH_SELECTION_REQUIRED'});
  if(trimmed)for(let i=0;i<14;i++)history=trimConversation([...history,user(`Tema ${i}`),assistant('Respuesta')],10);
  history.push(user('2'));beginSearchSelectionTurn(s,'2');
  const args=guard(s,'get_sales',{...proposal,dateTo:'30/04/2023'},history);
  assert.deepEqual(args,{dateFrom:'01/01/2023',dateTo:'31/12/2023',groupBy:['month'],metrics:['totalAmount'],categoryIds:['SYNTHETIC-R2']});
  recordSearchToolResult(s,'get_sales',args,{data:[]});assert.deepEqual(getSearchResolutions(s).contexts.get_sales,args);assert.equal(getSearchResolutions(s).domains.search_customers.kind,'cleared');
 }finally{clearConversation(s);}
});
