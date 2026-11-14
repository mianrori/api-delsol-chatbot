import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveSearchSelection} from '../src/services/ai/searchSelection.service.js';
const user=text=>({role:'user',content:[{text}]});
const use=(name,id,input)=>({toolUse:{name,toolUseId:id,input}});
const response=(id,json)=>({toolResult:{toolUseId:id,status:'success',content:[{json}]}});
const base={dateFrom:'01/01/2023',dateTo:'31/01/2023',customerIds:['MODEL-C'],categoryIds:['MODEL-R'],groupBy:['month'],metrics:['totalAmount'],dayType:'business'};
const sources={search_customers:{status:'RESOLVED',customer:{codCliente:'VALID-C'}},search_categories:{status:'RESOLVED',category:{codRubro:'VALID-R'}}};
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v);}return value;};
for(const order of [['search_customers','search_categories'],['search_categories','search_customers']]){
 test('combined resolved IDs are independent: '+order.join(' then '),()=>{
  const history=[user('Ventas para este local y rubro'),{role:'assistant',content:[...order.map((name,i)=>use(name,String(i),{search:'Synthetic'})),use('get_sales','q',base)]}];
  const currentCalls=order.map(name=>({name,result:sources[name]}));
  const before=JSON.stringify({history,currentCalls,input:base});freeze(history);freeze(currentCalls);freeze(base);
  const r=preserveSearchSelection({name:'get_sales',input:base,history,currentCalls});
  assert.deepEqual(r,{...base,customerIds:['VALID-C'],categoryIds:['VALID-R']});
  assert.equal(JSON.stringify({history,currentCalls,input:base}),before);
  r.groupBy.push('year');r.metrics.push('purchaseCount');assert.deepEqual(base.groupBy,['month']);assert.deepEqual(base.metrics,['totalAmount']);
 });
 test('explicit change updates only the requested identity: '+order.join(' then '),()=>{
  const history=[user('Ventas con local y rubro'),{role:'assistant',content:order.map((name,i)=>use(name,'s'+i,{search:'Synthetic'}))},{role:'user',content:order.map((name,i)=>response('s'+i,sources[name]))},{role:'assistant',content:[use('get_sales','first',{...base,customerIds:['VALID-C'],categoryIds:['VALID-R']})]}];
  for(const [search,field,id] of [['search_customers','customerIds','NEW-C'],['search_categories','categoryIds','NEW-R']]){
   const text=search==='search_customers'?'Cambia el local':'Cambia el rubro';
   const result=search==='search_customers'?{status:'RESOLVED',customer:{codCliente:id}}:{status:'RESOLVED',category:{codRubro:id}};
   const messages=[...history,user(text),{role:'assistant',content:[use(search,'change',{search:'New exact'}),use('get_sales','q',base)]}];
   const before=JSON.stringify(messages);const r=preserveSearchSelection({name:'get_sales',input:base,history:messages,currentCalls:[{name:search,result}]});
   assert.deepEqual(r,{...base,customerIds:['VALID-C'],categoryIds:['VALID-R'],[field]:[id]});assert.equal(JSON.stringify(messages),before);
  }
  const messages=[...history,user('Cambia el período a febrero de 2023')];
  const r=preserveSearchSelection({name:'get_sales',input:{dateFrom:'01/02/2023',dateTo:'28/02/2023',customerIds:['MODEL-C'],categoryIds:['MODEL-R']},history:messages});
  assert.equal(r.dateFrom,'01/02/2023');assert.equal(r.dateTo,'28/02/2023');assert.deepEqual(r.customerIds,['VALID-C']);assert.deepEqual(r.categoryIds,['VALID-R']);
  messages.push({role:'assistant',content:[use('get_sales','february',r)]},{role:'user',content:[response('february',{data:[]})]},user('continúa'));
  const next=preserveSearchSelection({name:'get_sales',input:{customerIds:['MODEL-C'],categoryIds:['MODEL-R']},history:messages});
  assert.deepEqual(next,r);
 });
 test('a confirmed option survives resolution of the other domain: '+order.join(' then '),()=>{
  const [first,second]=order;
  const firstOptions=first==='search_customers'?[{optionId:'1',codCliente:'A'},{optionId:'2',codCliente:'SELECTED-C'}]:[{optionId:'1',codRubro:'A'},{optionId:'2',codRubro:'SELECTED-R'}];
  const history=[user('Busca y consulta'),{role:'assistant',content:[use(first,'s',{search:'Synthetic'}),use('get_sales','q',base)]},{role:'user',content:[response('s',{status:'AMBIGUOUS',options:firstOptions})]},user('opción 2'),user(first==='search_customers'?'Cambia el rubro':'Cambia el local'),{role:'assistant',content:[use(second,'change',{search:'Synthetic exact'}),use('get_sales','next',base)]}];
  const before=JSON.stringify(history);freeze(history);
  const r=preserveSearchSelection({name:'get_sales',input:base,history,currentCalls:[{name:second,result:sources[second]}]});
  assert.deepEqual(r,{...base,customerIds:[first==='search_customers'?'SELECTED-C':'VALID-C'],categoryIds:[first==='search_categories'?'SELECTED-R':'VALID-R']});assert.equal(JSON.stringify(history),before);
 });
}
