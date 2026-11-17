import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveSearchSelection} from '../src/services/ai/searchSelection.service.js';
const user=text=>({role:'user',content:[{text}]});
const use=(name,id,input)=>({role:'assistant',content:[{toolUse:{name,toolUseId:id,input}}]});
const result=(id,json)=>({role:'user',content:[{toolResult:{toolUseId:id,status:'success',content:[{json}]}}]});
const base={documentNumber:'SYNTHETIC-A',dateFrom:'01/01/2023',dateTo:'31/05/2023',mode:'detail',page:1,rows:2};
const options=[{optionId:'1',documentNumber:'SYNTHETIC-A'},{optionId:'2',documentNumber:'SYNTHETIC-B'}];
const history=()=>[user('Synthetic lookup'),use('search_members','s',{search:'Synthetic'}),use('get_member_purchases','q',base),result('s',{status:'AMBIGUOUS',options})];
test('continúa and repeated non-selections keep the original ambiguity pending',()=>{
 const messages=history();for(const text of ['continúa','muéstrame las compras','opción 9','continúa']){
  messages.push(user(text));assert.throws(()=>preserveSearchSelection({name:'get_member_purchases',input:{documentNumber:'SYNTHETIC-A'},history:messages}),{code:'SEARCH_SELECTION_REQUIRED'});
  messages.push(use('get_member_purchases','retry-'+messages.length,{documentNumber:'SYNTHETIC-A',dateFrom:'01/01/2000'}));
 }
 messages.push(user('opción 2'));assert.deepEqual(preserveSearchSelection({name:'get_member_purchases',input:{},history:messages}),{...base,documentNumber:'SYNTHETIC-B'});
 messages.push(user('continúa'));assert.equal(preserveSearchSelection({name:'get_member_purchases',input:{documentNumber:'SYNTHETIC-A'},history:messages}).documentNumber,'SYNTHETIC-B');
});
test('only a new unequivocal lookup releases a pending identity and its actual ID is enforced',()=>{
 const messages=[...history(),user('Busca de nuevo'),use('search_members','new',{search:'Synthetic exact'})];
 assert.throws(()=>preserveSearchSelection({name:'get_member_purchases',input:base,history:messages,currentCalls:[{name:'search_members',result:{status:'NOT_FOUND',options:[]}}]}),{code:'SEARCH_SELECTION_REQUIRED'});
 const resolved={status:'RESOLVED',member:{documentNumber:'SYNTHETIC-C'}};
 assert.deepEqual(preserveSearchSelection({name:'get_member_purchases',input:{},history:messages,currentCalls:[{name:'search_members',result:resolved}]}),{...base,documentNumber:'SYNTHETIC-C'});
 messages.push(result('new',resolved),user('continúa'));assert.equal(preserveSearchSelection({name:'get_member_purchases',input:{documentNumber:'SYNTHETIC-A'},history:messages}).documentNumber,'SYNTHETIC-C');
});
test('get_soles_usage retains member, dates, movement and destination when selecting a category',()=>{
 const original={documentNumber:'SYNTHETIC-M',dateFrom:'01/01/2023',dateTo:'31/05/2023',movementTypes:['SYNTHETIC'],destinations:[{destinationType:'LOCAL',destinationCode:'SYNTHETIC-D'}],categoryIds:['SYNTHETIC-R1'],mode:'detail',page:2,pageSize:1};
 const messages=[user('Usos con rubro'),use('search_categories','c',{search:'Synthetic'}),use('get_soles_usage','usage',original),result('c',{status:'AMBIGUOUS',options:[{optionId:'1',codRubro:'SYNTHETIC-R1'},{optionId:'2',codRubro:'SYNTHETIC-R2'}]}),user('continúa')];
 assert.throws(()=>preserveSearchSelection({name:'get_soles_usage',input:{},history:messages}),{code:'SEARCH_SELECTION_REQUIRED'});
 messages.push(user('opción 2'));assert.deepEqual(preserveSearchSelection({name:'get_soles_usage',input:{},history:messages}),{...original,categoryIds:['SYNTHETIC-R2']});
});
test('tool iterations do not erase an ambiguous result in the current user turn',()=>{
 const messages=history();assert.throws(()=>preserveSearchSelection({name:'get_member_purchases',input:base,history:messages}),{code:'SEARCH_SELECTION_REQUIRED'});
 assert.deepEqual(preserveSearchSelection({name:'get_sales',input:{metrics:['totalAmount']},history:messages}),{metrics:['totalAmount']});
});
