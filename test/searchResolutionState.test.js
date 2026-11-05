import test from 'node:test';
import assert from 'node:assert/strict';
import {beginSearchSelectionTurn,recordSearchToolResult,preserveSearchSelection} from '../src/services/ai/searchSelection.service.js';
import {getSearchResolutions,setSearchResolutions,clearConversation} from '../src/state/conversation.store.js';
import {trimConversation} from '../src/services/ai/conversation.service.js';
const user=text=>({role:'user',content:[{text}]});
const use=(name,id,input)=>({role:'assistant',content:[{toolUse:{name,toolUseId:id,input}}]});
const response=(id,json,status='success')=>({role:'user',content:[{toolResult:{toolUseId:id,status,content:[{json}]}}]});
const guard=(sessionId,name,input,history=[])=>preserveSearchSelection({name,input,history,resolutionState:getSearchResolutions(sessionId),saveResolutionState:s=>setSearchResolutions(sessionId,s)});
const base={dateFrom:'01/01/2023',dateTo:'31/01/2023',groupBy:['month'],metrics:['totalAmount'],dayType:'business'};
for(const [search,field,key,label] of [['search_customers','customerIds','codCliente','local'],['search_categories','categoryIds','codRubro','rubro']])test(search+' persists pending/selected/removed through real trimming, topics and reset',()=>{
 const session='SYNTHETIC-'+search;clearConversation(session);
 try{
  beginSearchSelectionTurn(session,'Busca opciones');guard(session,search,{search:'Synthetic'});
  const result={status:'AMBIGUOUS',options:[{optionId:'1',[key]:'[PII_TEST_1]'},{optionId:'2',[key]:'[PII_TEST_2]'}]};
  recordSearchToolResult(session,search,{},result);
  let history=[user('Busca opciones'),use(search,'lookup',{search:'Synthetic'}),response('lookup',result)];
  const input={...base,[field]:['MODEL-ID']};
  assert.throws(()=>guard(session,'get_sales',input,history),{code:'SEARCH_SELECTION_REQUIRED'});
  for(let i=0;i<12;i++){
   beginSearchSelectionTurn(session,'continúa');history.push(user('continúa'));
   assert.throws(()=>guard(session,'get_sales',{[field]:['MODEL-ID'],dateFrom:'01/01/2000'},history),{code:'SEARCH_SELECTION_REQUIRED'});
   history.push(use('get_sales','q'+i,input),response('q'+i,{error:'SEARCH_SELECTION_REQUIRED'},'error'));history=trimConversation(history);
  }
  assert.ok(!history.some(m=>m.content?.some(b=>b.toolUse?.name===search)));
  beginSearchSelectionTurn(session,'Otra consulta de vehículos');assert.deepEqual(guard(session,'get_member_vehicles',{plate:'SYNTHETIC'}),{plate:'SYNTHETIC'});
  beginSearchSelectionTurn(session,'opción 2');history.push(user('opción 2'));
  const selected=guard(session,'get_sales',{[field]:['MODEL-ID']},history);
  assert.deepEqual(selected,{...base,[field]:['[PII_TEST_2]']});recordSearchToolResult(session,'get_sales',selected,{data:[]});
  assert.equal(getSearchResolutions(session).domains[search].kind,'selected');
  beginSearchSelectionTurn(session,'continúa');assert.deepEqual(guard(session,'get_sales',{[field]:['MODEL-ID']}),selected);
  beginSearchSelectionTurn(session,'quita el filtro de '+label);
  assert.deepEqual(guard(session,'get_sales',{[field]:['MODEL-ID']}),base);
  assert.equal(getSearchResolutions(session).domains[search].kind,'cleared');
  beginSearchSelectionTurn(session,'Cambia el período');assert.equal(guard(session,'get_sales',{[field]:['MODEL-ID'],dateFrom:'01/02/2023'})[field],undefined);
  assert.throws(()=>guard(session,search,{search:'Synthetic'}),{code:'SEARCH_SELECTION_REQUIRED'});
  beginSearchSelectionTurn(session,'Vuelve a añadir el '+label);assert.throws(()=>guard(session,'get_sales',input),{code:'SEARCH_SELECTION_REQUIRED'});
  guard(session,search,{search:'Synthetic new'});recordSearchToolResult(session,search,{},search==='search_customers'?{status:'RESOLVED',customer:{[key]:'[PII_TEST_3]'}}:{status:'RESOLVED',category:{[key]:'[PII_TEST_3]'}});
  assert.deepEqual(guard(session,'get_sales',input)[field],['[PII_TEST_3]']);
  clearConversation(session);assert.deepEqual(getSearchResolutions(session),{domains:{},contexts:{}});
  assert.throws(()=>guard(session,'get_sales',input),{code:'SEARCH_SELECTION_REQUIRED'});
 }finally{clearConversation(session);}
});
test('persistent resolutions are deeply isolated across sessions and reject missing evidence',()=>{
 const a='SYNTHETIC-A',b='SYNTHETIC-B';clearConversation(a);clearConversation(b);
 try{
  beginSearchSelectionTurn(a,'Busca local');recordSearchToolResult(a,'search_customers',{}, {status:'RESOLVED',customer:{codCliente:'[PII_CUSTOMER_ID_1]'}});
  const snapshot=getSearchResolutions(a);snapshot.domains.search_customers.selected.codCliente='MODEL';
  assert.equal(guard(a,'get_sales',{customerIds:['MODEL']}).customerIds[0],'[PII_CUSTOMER_ID_1]');
  assert.throws(()=>guard(b,'get_sales',{customerIds:['MODEL']}),{code:'SEARCH_SELECTION_REQUIRED'});
  assert.throws(()=>guard(b,'get_sales',{categoryIds:['MODEL']}),{code:'SEARCH_SELECTION_REQUIRED'});
  clearConversation(b);assert.equal(getSearchResolutions(a).domains.search_customers.kind,'selected');
 }finally{clearConversation(a);clearConversation(b);}
});

test('two pending domains cannot share one numeric choice; removing one permits only the other',()=>{
 const s='SYNTHETIC-COMBINED';clearConversation(s);
 try{
  beginSearchSelectionTurn(s,'Busca local y rubro');
  for(const [name,key] of [['search_customers','codCliente'],['search_categories','codRubro']]){
   guard(s,name,{search:'Synthetic'});recordSearchToolResult(s,name,{}, {status:'AMBIGUOUS',options:[{optionId:'1',[key]:'[PII_TEST_1]'},{optionId:'2',[key]:'[PII_TEST_2]'}]});
  }
  beginSearchSelectionTurn(s,'opción 2');assert.throws(()=>guard(s,'get_sales',base),{code:'SEARCH_SELECTION_REQUIRED'});
  assert.ok(Object.values(getSearchResolutions(s).domains).every(d=>d.kind==='pending'));
  beginSearchSelectionTurn(s,'quita el filtro de local');beginSearchSelectionTurn(s,'opción 2');
  const selected=guard(s,'get_sales',{...base,customerIds:['MODEL-C'],categoryIds:['MODEL-R']});
  assert.equal(selected.customerIds,undefined);assert.deepEqual(selected.categoryIds,['[PII_TEST_2]']);
  recordSearchToolResult(s,'get_sales',selected,{data:[{privateBusinessRow:'MUST_NOT_BE_STORED'}]});
  assert.ok(!JSON.stringify(getSearchResolutions(s)).includes('MUST_NOT_BE_STORED'));
  clearConversation(s);assert.throws(()=>guard(s,'get_sales',{customerIds:['MODEL-C'],categoryIds:['MODEL-R']}),{code:'SEARCH_SELECTION_REQUIRED'});
 }finally{clearConversation(s);}
});

test('a negative new-search mention and a different catalog choice cannot replace a persistent identity',()=>{
 const s='SYNTHETIC-TOPICS';clearConversation(s);
 try{
  beginSearchSelectionTurn(s,'Busca local');recordSearchToolResult(s,'search_customers',{}, {status:'AMBIGUOUS',options:[{optionId:'2',codCliente:'[PII_CUSTOMER_ID_2]'}]});
  recordSearchToolResult(s,'search_members',{}, {status:'AMBIGUOUS',options:[{optionId:'2',documentNumber:'SYNTHETIC'}]});
  beginSearchSelectionTurn(s,'opción 2');assert.equal(getSearchResolutions(s).domains.search_customers.kind,'pending');
  beginSearchSelectionTurn(s,'No hagas una nueva búsqueda');assert.throws(()=>guard(s,'search_customers',{search:'MODEL'}),{code:'SEARCH_SELECTION_REQUIRED'});
  beginSearchSelectionTurn(s,'Busca el local');guard(s,'search_customers',{search:'Synthetic'});recordSearchToolResult(s,'search_customers',{}, {status:'RESOLVED',customer:{codCliente:'[PII_CUSTOMER_ID_3]'}});
  beginSearchSelectionTurn(s,'No realices nueva búsqueda');assert.throws(()=>guard(s,'search_customers',{search:'MODEL'}),{code:'SEARCH_SELECTION_REQUIRED'});
  assert.deepEqual(guard(s,'get_sales',{customerIds:['MODEL']}).customerIds,['[PII_CUSTOMER_ID_3]']);
 }finally{clearConversation(s);}
});

test('fresh pending query context outranks old successful history when selecting before trimming',()=>{
 const s='SYNTHETIC-NEW-PERIOD';clearConversation(s);
 try{
  beginSearchSelectionTurn(s,'Busca local');recordSearchToolResult(s,'search_customers',{}, {status:'RESOLVED',customer:{codCliente:'[PII_CUSTOMER_ID_1]'}});
  const old={...base,customerIds:['[PII_CUSTOMER_ID_1]']};recordSearchToolResult(s,'get_sales',old,{data:[]});
  const history=[user('Ventas enero'),use('get_sales','old',old),response('old',{data:[]})];
  beginSearchSelectionTurn(s,'Cambia el local');guard(s,'search_customers',{search:'Synthetic'});recordSearchToolResult(s,'search_customers',{}, {status:'AMBIGUOUS',options:[{optionId:'2',codCliente:'[PII_CUSTOMER_ID_2]'}]});
  const next={...old,dateFrom:'01/02/2023',dateTo:'28/02/2023'};
  assert.throws(()=>guard(s,'get_sales',next,history),{code:'SEARCH_SELECTION_REQUIRED'});
  beginSearchSelectionTurn(s,'opción 2');history.push(user('opción 2'));
  assert.deepEqual(guard(s,'get_sales',{dateFrom:'01/01/2000',customerIds:['MODEL']},history),{...next,customerIds:['[PII_CUSTOMER_ID_2]']});
 }finally{clearConversation(s);}
});
