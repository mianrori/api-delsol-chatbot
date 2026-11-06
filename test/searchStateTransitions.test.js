import test from 'node:test';
import assert from 'node:assert/strict';
import {beginSearchSelectionTurn,recordSearchToolResult,captureSearchQueryContext,preserveSearchSelection} from '../src/services/ai/searchSelection.service.js';
import {getSearchResolutions,getSearchSelectionTurn,clearConversation} from '../src/state/conversation.store.js';
import {trimConversation} from '../src/services/ai/conversation.service.js';
const s='SYNTHETIC-ATOMIC-TRANSITIONS';
const base={dateFrom:'01/01/2023',dateTo:'31/01/2023',customerIds:['[PII_CUSTOMER_ID_1]'],categoryIds:['[PII_CATEGORY_ID_1]'],groupBy:['month'],metrics:['totalAmount'],dayType:'business'};
const options=(key,prefix)=>[1,2].map(i=>({optionId:String(i),[key]:`[PII_${prefix}_${i}]`}));
const guard=(name,input,history)=>{captureSearchQueryContext(s,name,input);return preserveSearchSelection({name,input,history,resolutionState:getSearchResolutions(s),selectionTurn:getSearchSelectionTurn(s)});};
const seed=()=>{clearConversation(s);recordSearchToolResult(s,'search_customers',{}, {status:'RESOLVED',customer:{codCliente:base.customerIds[0]}});recordSearchToolResult(s,'search_categories',{}, {status:'RESOLVED',category:{codRubro:base.categoryIds[0]}});recordSearchToolResult(s,'get_sales',base,{data:[]});};
const historyAfterTrim=()=>{let h=[{role:'user',content:[{text:'Synthetic original lookup'}]}];for(let i=0;i<12;i++){beginSearchSelectionTurn(s,'continúa');h=trimConversation([...h,{role:'user',content:[{text:'continúa'}]},{role:'assistant',content:[{text:'Synthetic response'}]}]);}assert.ok(!h.some(m=>m.content?.some(b=>b.text==='Synthetic original lookup')));return h;};
for(const trimmed of [false,true]){
 test('foreign catalog and invalid choices preserve the entire durable state; trimmed='+trimmed,()=>{
  seed();try{
   recordSearchToolResult(s,'search_members',{}, {status:'AMBIGUOUS',options:options('documentNumber','DOCUMENT')});
   const h=trimmed?historyAfterTrim():[],before=getSearchResolutions(s),historySnapshot=structuredClone(h);
   beginSearchSelectionTurn(s,'opción 2');assert.deepEqual(getSearchResolutions(s),before);
   assert.deepEqual(guard('get_sales',{},h),base);assert.deepEqual(getSearchResolutions(s),before);assert.deepEqual(h,historySnapshot);
   beginSearchSelectionTurn(s,'Busca el local');guard('search_customers',{search:'Synthetic'},h);
   recordSearchToolResult(s,'search_customers',{}, {status:'AMBIGUOUS',options:options('codCliente','CUSTOMER_ID')});
   const pending=getSearchResolutions(s);beginSearchSelectionTurn(s,'opción 99');assert.deepEqual(getSearchResolutions(s),pending);
   assert.throws(()=>guard('get_sales',{customerIds:['MODEL']},h),{code:'SEARCH_SELECTION_REQUIRED'});assert.deepEqual(getSearchResolutions(s),pending);
   beginSearchSelectionTurn(s,'opción 2');const expected=structuredClone(pending);expected.domains.search_customers={...expected.domains.search_customers,kind:'selected',selected:options('codCliente','CUSTOMER_ID')[1]};
   assert.deepEqual(getSearchResolutions(s),expected);assert.deepEqual(getSearchResolutions(s).domains.search_categories,before.domains.search_categories);
  }finally{clearConversation(s);}
 });
 test('rejected lookup, arguments and result leave retired/confirmed state intact; trimmed='+trimmed,()=>{
  seed();try{
   beginSearchSelectionTurn(s,'quita el filtro de rubro');const h=trimmed?historyAfterTrim():[],before=getSearchResolutions(s),frozen=structuredClone(h);
   beginSearchSelectionTurn(s,'Busca opciones de local');assert.deepEqual(getSearchResolutions(s),before);
   assert.throws(()=>guard('search_categories',{search:'MODEL'},h),{code:'SEARCH_FILTER_REMOVED'});assert.deepEqual(getSearchResolutions(s),before);
   beginSearchSelectionTurn(s,'Vuelve a añadir el rubro');guard('search_categories',{search:'Synthetic'},h);assert.deepEqual(getSearchResolutions(s),before,'Dispatch alone is not a successful result');
   for(const input of [{},{search:null},{search:{}},{search:'Synthetic',categoryIds:['MODEL']}]){
    assert.throws(()=>guard('search_categories',input,h),{code:'SEARCH_ARGUMENTS_INVALID'});assert.deepEqual(getSearchResolutions(s),before);
   }
   assert.equal(recordSearchToolResult(s,'search_UNKNOWN',{}, {status:'RESOLVED'}),false);assert.deepEqual(getSearchResolutions(s),before);
   assert.equal(recordSearchToolResult(s,'search_members',{}, {status:'AMBIGUOUS',options:[{optionId:'1'}]}),false);assert.deepEqual(getSearchResolutions(s),before);
   for(const result of [{success:false,error:'SYNTHETIC_FAILURE'},{status:'ERROR'},{status:'RESOLVED',category:{}},{status:'RESOLVED',category:{codRubro:{untrusted:true}}},{status:'AMBIGUOUS',options:[{optionId:'1',codRubro:'A'},{optionId:'1',codRubro:'B'}]}]){
    assert.equal(recordSearchToolResult(s,'search_categories',{},result),false);assert.deepEqual(getSearchResolutions(s),before);
   }
   assert.deepEqual(h,frozen);assert.throws(()=>guard('get_sales',base,h),{code:'SEARCH_SELECTION_REQUIRED'});assert.deepEqual(getSearchResolutions(s),before);
   const valid={status:'AMBIGUOUS',options:options('codRubro','CATEGORY_ID')};assert.equal(recordSearchToolResult(s,'search_categories',{},valid),true);
   const expected=structuredClone(before);expected.choiceFocus='search_categories';expected.domains.search_categories={kind:'pending',result:{options:valid.options}};assert.deepEqual(getSearchResolutions(s),expected);
   beginSearchSelectionTurn(s,'opción 2');expected.domains.search_categories={...expected.domains.search_categories,kind:'selected',selected:valid.options[1]};assert.deepEqual(getSearchResolutions(s),expected);
  }finally{clearConversation(s);}
 });
}

test('a capped ambiguous result remains pending and only its displayed option can be selected',()=>{
 seed();try{
  beginSearchSelectionTurn(s,'Busca el local');guard('search_customers',{search:'Synthetic'},[]);
  const result={status:'AMBIGUOUS',hasMore:true,totalMatches:3,options:[options('codCliente','CUSTOMER_ID')[0]]};
  assert.equal(recordSearchToolResult(s,'search_customers',{},result),true);
  const before=getSearchResolutions(s);beginSearchSelectionTurn(s,'opción 2');assert.deepEqual(getSearchResolutions(s),before);
  beginSearchSelectionTurn(s,'opción 1');const expected=structuredClone(before);expected.domains.search_customers={...expected.domains.search_customers,kind:'selected',selected:result.options[0]};assert.deepEqual(getSearchResolutions(s),expected);
 }finally{clearConversation(s);}
});
