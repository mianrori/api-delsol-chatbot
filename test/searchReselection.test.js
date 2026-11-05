import test from 'node:test';
import assert from 'node:assert/strict';
import {beginSearchSelectionTurn,recordSearchToolResult,preserveSearchSelection,captureSearchQueryContext} from '../src/services/ai/searchSelection.service.js';
import {getSearchResolutions,getSearchSelectionTurn,clearConversation} from '../src/state/conversation.store.js';
import {trimConversation} from '../src/services/ai/conversation.service.js';
const base={dateFrom:'01/01/2023',dateTo:'31/01/2023',groupBy:['month'],metrics:['totalAmount'],dayType:'business'};
const session='SYNTHETIC-RESELECTION';
const guard=(input,history=[])=>{captureSearchQueryContext(session,'get_sales',input);return preserveSearchSelection({name:'get_sales',input,history,resolutionState:getSearchResolutions(session),selectionTurn:getSearchSelectionTurn(session)});};
for(const trimmed of [false,true])for(const otherHasOptions of [false,true])for(const [name,key,field,other,otherKey,otherField] of [
 ['search_customers','codCliente','customerIds','search_categories','codRubro','categoryIds'],
 ['search_categories','codRubro','categoryIds','search_customers','codCliente','customerIds'],
])test(name+' reselects only focused displayed options with both confirmed; trimmed='+trimmed+'; other options='+otherHasOptions,()=>{
 clearConversation(session);try{
  if(otherHasOptions){recordSearchToolResult(session,other,{}, {status:'AMBIGUOUS',options:[{optionId:'1',[otherKey]:'[PII_OTHER_1]'},{optionId:'2',[otherKey]:'[PII_OTHER_2]'}]});beginSearchSelectionTurn(session,'opción 1');}else recordSearchToolResult(session,other,{},other==='search_customers'?{status:'RESOLVED',customer:{[otherKey]:'[PII_OTHER_1]'}}:{status:'RESOLVED',category:{[otherKey]:'[PII_OTHER_1]'}});
  const options=[1,2].map(i=>({optionId:String(i),[key]:`[PII_TARGET_${i}]`}));
  recordSearchToolResult(session,name,{}, {status:'AMBIGUOUS',options});beginSearchSelectionTurn(session,'opción 2');
  let args={...base,[field]:['[PII_TARGET_2]'],[otherField]:['[PII_OTHER_1]']};recordSearchToolResult(session,'get_sales',args,{data:[]});
  let history=[{role:'user',content:[{text:'Synthetic lookup'}]},{role:'assistant',content:[{toolUse:{name,toolUseId:'lookup',input:{search:'Synthetic'}}}]}];
  if(trimmed)for(let i=0;i<12;i++){beginSearchSelectionTurn(session,'continúa');history=trimConversation([...history,{role:'user',content:[{text:'continúa'}]},{role:'assistant',content:[{text:'Synthetic response'}]}]);assert.deepEqual(guard({customerIds:['MODEL-C'],categoryIds:['MODEL-R']},history),args);}
  if(trimmed)assert.ok(!history.some(m=>m.content?.some(b=>b.toolUse?.name===name)));
  for(const ordinal of ['1','2','1']){
   const before=getSearchResolutions(session),h=structuredClone(history);beginSearchSelectionTurn(session,'opción '+ordinal);history.push({role:'user',content:[{text:'opción '+ordinal}]});
   const expected=structuredClone(before);expected.domains[name]={...expected.domains[name],kind:'selected',selected:options[Number(ordinal)-1]};assert.deepEqual(getSearchResolutions(session),expected);
   args={...args,[field]:[options[Number(ordinal)-1][key]]};assert.deepEqual(guard({customerIds:['MODEL-C'],categoryIds:['MODEL-R']},history),args);assert.deepEqual(getSearchResolutions(session),expected);assert.deepEqual(history.slice(0,h.length),h);
   recordSearchToolResult(session,'get_sales',args,{data:[]});
  }
  const before=getSearchResolutions(session);beginSearchSelectionTurn(session,'opción 999');assert.deepEqual(getSearchResolutions(session),before);assert.throws(()=>guard({customerIds:['MODEL'],categoryIds:['MODEL']},history),{code:'SEARCH_SELECTION_REQUIRED'});assert.deepEqual(getSearchResolutions(session),before);
  recordSearchToolResult(session,'search_members',{}, {status:'AMBIGUOUS',options:[{optionId:'1',documentNumber:'[PII_DOCUMENT_1]'},{optionId:'2',documentNumber:'[PII_DOCUMENT_2]'}]});
  const foreign=getSearchResolutions(session);beginSearchSelectionTurn(session,'opción 2');assert.deepEqual(getSearchResolutions(session),foreign);assert.deepEqual(guard({customerIds:['MODEL'],categoryIds:['MODEL']},[]),args);assert.deepEqual(getSearchResolutions(session),foreign);
 }finally{clearConversation(session);}
});
