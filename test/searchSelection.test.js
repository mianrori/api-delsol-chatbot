import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveSearchSelection} from '../src/services/ai/searchSelection.service.js';
import {tools} from '../src/tools/index.js';
const rows=[
 ['search_customers','get_sales',[{codCliente:'A'},{codCliente:'B'}],{customerIds:['B']}],
 ['search_categories','get_sales',[{codRubro:'A'},{codRubro:'B'}],{categoryIds:['B']}],
 ['search_categories','get_soles_usage',[{codRubro:'A'},{codRubro:'B'}],{categoryIds:['B']}],
 ['search_members','get_member_purchases',[{documentNumber:'A'},{documentNumber:'B'}],{documentNumber:'B'}],
 ['search_invoice_customers','get_invoices',[{customerId:'A'},{customerId:'B'}],{customerIds:['B']}],
 ['search_invoice_concepts','get_invoices',[{conceptId:'A'},{conceptId:'B'}],{conceptIds:['B']}],
 ['search_soles_types','get_member_soles',[{typeId:1},{typeId:2}],{typeIds:[2]}],
 ['search_soles_usage_destinations','get_soles_usage',[{destinationType:'LOCAL',destinationCode:'A'},{destinationType:'SOCIO',destinationCode:'A'}],{destinations:[{destinationType:'SOCIO',destinationCode:'A'}]}],
 ['search_soles_usage_movement_types','get_soles_usage',[{movementType:'A'},{movementType:'B'}],{movementTypes:['B']}],
];
for(const [search,name,values,selected] of rows){
 const options=values.map((v,i)=>({optionId:String(i+1),...v}));
 test(search+' uses the actual consumer schema for selected identifiers',()=>{
  const props=tools.find(t=>t.toolSpec.name===name).toolSpec.inputSchema.json.properties;
  for(const key of Object.keys(selected))assert.ok(Object.hasOwn(props,key),key);
 });
 test(search+' blocks arbitrary same-turn selection and missing filters',()=>{
  for(const status of ['AMBIGUOUS','NOT_FOUND','LISTED'])assert.throws(()=>preserveSearchSelection({name,input:{},currentCalls:[{name:search,result:{status,options}}]}),{code:'SEARCH_SELECTION_REQUIRED'});
 });
 test(search+' selects only the displayed option and conserves the original filters',()=>{
  const original={dateFrom:'01/01/2023',dateTo:'31/01/2023',page:2,rows:3,mode:'summary',categoryIds:['R'],customerIds:['C']};
  const history=[{role:'user',content:[{text:'Synthetic lookup with filters'}]},{role:'assistant',content:[{toolUse:{name:search,toolUseId:'s',input:{query:'Synthetic',dateFrom:original.dateFrom,dateTo:original.dateTo}}},{toolUse:{name,toolUseId:'q',input:original}}]},{role:'user',content:[{toolResult:{toolUseId:'s',status:'success',content:[{json:{status:'AMBIGUOUS',options}}]}}]},{role:'user',content:[{text:'opción 2'}]}];
  const r=preserveSearchSelection({name,input:{dateFrom:'01/02/2023'},history});assert.deepEqual(r,{...original,...selected});
  history.at(-1).content[0].text='opción 3';assert.throws(()=>preserveSearchSelection({name,input:{},history}),{code:'SEARCH_SELECTION_REQUIRED'});
 });
}
test('an unrelated new request is not bound to an older ambiguous lookup',()=>{
 assert.deepEqual(preserveSearchSelection({name:'get_sales',input:{metrics:['totalAmount']},history:[{role:'user',content:[{text:'Otra consulta de ventas'}]}]}),{metrics:['totalAmount']});
});
test('one number cannot silently select from two different ambiguous catalogs',()=>{
 const history=[{role:'user',content:[{text:'Synthetic two lookups'}]},{role:'assistant',content:['search_customers','search_categories'].map((name,i)=>({toolUse:{name,toolUseId:String(i),input:{search:'Synthetic'}}}))},{role:'user',content:['0','1'].map(toolUseId=>({toolResult:{toolUseId,status:'success',content:[{json:{status:'AMBIGUOUS',options:[{optionId:'2',codCliente:'C',codRubro:'R'}]}}]}}))},{role:'user',content:[{text:'opción 2'}]}];
 assert.throws(()=>preserveSearchSelection({name:'get_sales',input:{},history}),{code:'SEARCH_SELECTION_REQUIRED'});
});
