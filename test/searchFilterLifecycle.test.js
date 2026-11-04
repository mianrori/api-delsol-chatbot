import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveSearchSelection,reenabledSearchFilters} from '../src/services/ai/searchSelection.service.js';
import {getSearchFilterActions,isExplicitSearchRequest} from '../src/services/ai/searchFilterIntent.service.js';
import {clearConversation,getRemovedSearchFilters,setSearchFilterRemoved,setConversation} from '../src/state/conversation.store.js';
const user=text=>({role:'user',content:[{text}]});
const use=(name,id,input)=>({toolUse:{name,toolUseId:id,input}});
const response=(id,json)=>({toolResult:{toolUseId:id,status:'success',content:[{json}]}});
const base={dateFrom:'01/01/2023',dateTo:'31/01/2023',customerIds:['VALID-C'],categoryIds:['VALID-R'],groupBy:['month'],metrics:['totalAmount'],dayType:'business'};
const start=()=>[user('Ventas con local y rubro'),{role:'assistant',content:[use('search_customers','c',{search:'Synthetic local'}),use('search_categories','r',{search:'Synthetic category'}),use('get_sales','initial',base)]},{role:'user',content:[response('c',{status:'RESOLVED',customer:{codCliente:'VALID-C'}}),response('r',{status:'RESOLVED',category:{codRubro:'VALID-R'}}),response('initial',{data:[]})]}];
const request=(history,text,input,currentCalls=[])=>{
 history.push(user(text));const before=JSON.stringify(history),r=preserveSearchSelection({name:'get_sales',input,history,currentCalls});assert.equal(JSON.stringify(history),before);
 const id='q'+history.length;history.push({role:'assistant',content:[use('get_sales',id,r)]},{role:'user',content:[response(id,{data:[]})]});return r;
};
for(const [text,field,other] of [['quita el filtro de rubro','categoryIds','customerIds'],['quita el filtro de local','customerIds','categoryIds']])test(text+' stays removed through period changes and contradictory proposals',()=>{
 const history=start(),r=request(history,text,{customerIds:['MODEL-C'],categoryIds:['MODEL-R']});
 const expected={...base};delete expected[field];assert.deepEqual(r,expected);
 const next=request(history,'Cambia el período a febrero de 2023',{dateFrom:'01/02/2023',dateTo:'28/02/2023',customerIds:['MODEL-C'],categoryIds:['MODEL-R']});
 assert.deepEqual(next,{...expected,dateFrom:'01/02/2023',dateTo:'28/02/2023'});assert.deepEqual(next[other],base[other]);
 assert.deepEqual(request(history,'continúa',{[field]:['MODEL-REINTRODUCTION']}),next);
});
for(const search of ['search_customers','search_categories'])test('remove both then explicitly add only '+search,()=>{
 const history=start();const removed=request(history,'retira ambos filtros',{customerIds:['MODEL-C'],categoryIds:['MODEL-R']});const expected={...base};delete expected.customerIds;delete expected.categoryIds;assert.deepEqual(removed,expected);
 const resolved=search==='search_customers'?{status:'RESOLVED',customer:{codCliente:'NEW-C'}}:{status:'RESOLVED',category:{codRubro:'NEW-R'}};
 const currentCalls=[{name:search,input:{search:'Synthetic old'},result:resolved}];
 assert.deepEqual(request(history,'continúa',{customerIds:['MODEL-C'],categoryIds:['MODEL-R']},currentCalls),expected,'Unrequested lookup cannot resurrect the filter');
 assert.throws(()=>preserveSearchSelection({name:search,input:{search:'Synthetic old'},history}),{code:'SEARCH_FILTER_REMOVED'});
 const text=search==='search_customers'?'Vuelve a añadir el local':'Vuelve a añadir el rubro',field=search==='search_customers'?'customerIds':'categoryIds';
 const result=request(history,text,{customerIds:['MODEL-C'],categoryIds:['MODEL-R']},currentCalls);
 assert.deepEqual(result,{...expected,[field]:[search==='search_customers'?'NEW-C':'NEW-R']});
});
test('remove and re-add in one explicit message requires a fresh resolution',()=>{
 const history=[...start(),user('Retira ambos filtros y vuelve a añadir el local')];
 assert.throws(()=>preserveSearchSelection({name:'get_sales',input:base,history}),{code:'SEARCH_SELECTION_REQUIRED'});
 const r=preserveSearchSelection({name:'get_sales',input:base,history,currentCalls:[{name:'search_customers',result:{status:'RESOLVED',customer:{codCliente:'NEW-C'}}}]});
 assert.deepEqual(r,{dateFrom:base.dateFrom,dateTo:base.dateTo,groupBy:['month'],metrics:['totalAmount'],dayType:'business',customerIds:['NEW-C']});
});
test('removal intent excludes negation, mere omission and breakdown wording',()=>{
 for(const text of ['no quites el filtro de local','conserva el rubro','Ventas por rubro'])assert.deepEqual(getSearchFilterActions(text),[]);
 assert.deepEqual(getSearchFilterActions('quita el filtro de rubro manteniendo el mismo período y el desglose por local'),[{search:'search_categories',action:'remove'}]);
 assert.deepEqual(preserveSearchSelection({name:'get_sales',input:{},history:start()}),base);
});

test('a previous label mentioned in a negation cannot re-enable its lookup',()=>{
 for(const text of ['No uses Synthetic local','Cambia el período sin Synthetic local','Busca ventas sin Synthetic local'])assert.equal(isExplicitSearchRequest(text,'search_customers',{search:'Synthetic local'}),false);
 assert.equal(isExplicitSearchRequest('Busca Synthetic local','search_customers',{search:'Synthetic local'}),true);
 const history=start();request(history,'quita el filtro de local',{});
 assert.equal(request(history,'opción 2',{customerIds:['MODEL-C']}).customerIds,undefined);
 assert.throws(()=>preserveSearchSelection({name:'get_sales',input:base,history:[...history,user('Vuelve a añadir el local')]}),{code:'SEARCH_SELECTION_REQUIRED'});
});
test('session removal markers survive trimmed history and clear with conversation reset',()=>{
 const session='SYNTHETIC-REMOVAL-SESSION';clearConversation(session);
 try{
  setSearchFilterRemoved(session,'search_categories',true);const markers=getRemovedSearchFilters(session);markers.clear();assert.ok(getRemovedSearchFilters(session).has('search_categories'));
  assert.equal(getRemovedSearchFilters('SYNTHETIC-OTHER-SESSION').size,0);
  const input={...base};delete input.categoryIds;const history=[user('quita el filtro de rubro'),{role:'assistant',content:[use('get_sales','removed',input)]},{role:'user',content:[response('removed',{data:[]})]},user('Cambia el período a febrero')];
  setConversation(session,history.slice(1));
  const result=preserveSearchSelection({name:'get_sales',input:{categoryIds:['MODEL-R'],dateFrom:'01/02/2023'},history:history.slice(1),removedFilters:getRemovedSearchFilters(session)});
  assert.equal(result.categoryIds,undefined);assert.deepEqual(result.customerIds,['VALID-C']);assert.equal(result.dateFrom,'01/02/2023');assert.deepEqual(reenabledSearchFilters('get_sales',result,getRemovedSearchFilters(session)),[]);
  clearConversation(session);assert.equal(getRemovedSearchFilters(session).size,0);
 }finally{clearConversation(session);}
});
