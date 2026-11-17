import test from 'node:test';
import assert from 'node:assert/strict';
import {isExclusiveLocalRemoval,getSalesLocalRemovalChange} from '../src/services/ai/searchFilterIntent.service.js';
import {beginSearchSelectionTurn,recordSearchToolResult,preserveSearchSelection} from '../src/services/ai/searchSelection.service.js';
import {getSearchResolutions,getSearchSelectionTurn,clearConversation} from '../src/state/conversation.store.js';
import {trimConversation} from '../src/services/ai/conversation.service.js';
import {getSalesRepository} from '../src/repositories/sales/sales.repository.js';
const user=text=>({role:'user',content:[{text}]}),assistant=text=>({role:'assistant',content:[{text}]});
const original={customerIds:['SYNTHETIC-LOCAL'],categoryIds:['SYNTHETIC-RUBRO'],dateFrom:'01/01/2023',dateTo:'31/12/2023',groupBy:['month'],metrics:['totalAmount']};
const proposal={customerIds:['MODEL-LOCAL'],categoryIds:['MODEL-RUBRO'],dateFrom:'01/01/2024',dateTo:'31/12/2024',groupBy:['year'],metrics:['totalInvoices'],dayType:'weekend'};
const seed=s=>{
 clearConversation(s);recordSearchToolResult(s,'search_customers',{}, {status:'RESOLVED',customer:{codCliente:original.customerIds[0]}});recordSearchToolResult(s,'search_categories',{}, {status:'RESOLVED',category:{codRubro:original.categoryIds[0]}});recordSearchToolResult(s,'get_sales',original,{data:[]});
};
const guard=(s,input,history)=>preserveSearchSelection({name:'get_sales',input,history,resolutionState:getSearchResolutions(s),selectionTurn:getSearchSelectionTurn(s)});
const historyFor=trimmed=>{
 const initial=[user('Consulta sintética 2023 por mes'),{role:'assistant',content:[{toolUse:{name:'get_sales',toolUseId:'original',input:structuredClone(original)}}]},{role:'user',content:[{toolResult:{toolUseId:'original',status:'success',content:[{json:{data:[]}}]}}]}];
 if(!trimmed)return initial;
 let history=initial;for(let i=0;i<14;i++)history=trimConversation([...history,user(`Tema sintético ${i}`),assistant('Respuesta sintética')],10);
 assert.ok(!JSON.stringify(history).includes('toolUseId'));return history;
};

for(const trimmed of [false,true])test(`pure local removal freezes all other effective arguments and state after contradictory model proposal; trimmed=${trimmed}`,async()=>{
 const s=`SYNTHETIC-PURE-${trimmed}`;seed(s);
 try{
  const history=[...historyFor(trimmed),user('Todos los locales')],beforeHistory=structuredClone(history),beforeProposal=structuredClone(proposal);
  beginSearchSelectionTurn(s,'Todos los locales');const before=getSearchResolutions(s);assert.equal(before.domains.search_customers.kind,'cleared');
  const result=guard(s,proposal,history),expected=structuredClone(original);delete expected.customerIds;
  assert.deepEqual(result,expected);assert.deepEqual(getSearchResolutions(s),before);assert.deepEqual(history,beforeHistory);assert.deepEqual(proposal,beforeProposal);
  const queries=[];await getSalesRepository({connection:{async execute(sql,binds){queries.push({sql,binds:structuredClone(binds)});return {rows:[]};}},...result});
  assert.equal(queries[0].binds.dateFrom,original.dateFrom);assert.equal(queries[0].binds.dateTo,original.dateTo);assert.match(queries[0].sql,/TO_CHAR\(FECHA, 'MM'\)/);assert.doesNotMatch(queries[0].sql,/COD_CLIENTE IN|BETWEEN 0 AND 4|IN \(5, 6\)/);assert.match(queries[0].sql,/COD_RUBRO IN/);assert.ok(Object.values(queries[0].binds).includes(original.categoryIds[0]));
  recordSearchToolResult(s,'get_sales',result,{data:[]});const after=getSearchResolutions(s);assert.equal(after.domains.search_customers.kind,'cleared');assert.deepEqual(after.domains.search_categories,before.domains.search_categories);assert.deepEqual(after.contexts.get_sales,expected);
  result.categoryIds[0]='MUTATED';assert.equal(getSearchResolutions(s).contexts.get_sales.categoryIds[0],original.categoryIds[0]);
 }finally{clearConversation(s);}
});

for(const trimmed of [false,true])test(`explicit period and grouping changes remain allowed with and after local removal; trimmed=${trimmed}`,()=>{
 const s=`SYNTHETIC-CHANGE-${trimmed}`;seed(s);
 try{
  let history=historyFor(trimmed);const combined='Todos los locales, durante 2024, por año';beginSearchSelectionTurn(s,combined);
  const changed=guard(s,{...proposal,dateFrom:'01/01/2026',dateTo:'31/12/2026',groupBy:['day']},[...history,user(combined)]);assert.equal(changed.customerIds,undefined);assert.deepEqual(changed.categoryIds,original.categoryIds);assert.equal(changed.dateFrom,'01/01/2024');assert.equal(changed.dateTo,'31/12/2024');assert.deepEqual(changed.groupBy,['year']);assert.deepEqual(changed.metrics,original.metrics);assert.equal(changed.dayType,undefined);
  recordSearchToolResult(s,'get_sales',changed,{data:[]});
  const later='Cambia el período a 2025 y agrupa por mes';beginSearchSelectionTurn(s,later);const final=guard(s,{dateFrom:'01/01/2025',dateTo:'31/12/2025',groupBy:['month']},[...history,user(later)]);
  assert.equal(final.customerIds,undefined);assert.deepEqual(final.categoryIds,original.categoryIds);assert.equal(final.dateFrom,'01/01/2025');assert.equal(final.dateTo,'31/12/2025');assert.deepEqual(final.groupBy,['month']);assert.equal(getSearchResolutions(s).domains.search_customers.kind,'cleared');
 }finally{clearConversation(s);}
});

test('pure-removal grammar never absorbs additional user changes',()=>{
 for(const message of ['Todos los locales','Ahora todos los locales.','Quita el filtro de local','Retira el filtro de local conservando los demás filtros'])assert.equal(isExclusiveLocalRemoval(message),true,message);
 for(const message of ['Todos los locales, durante 2024, por año','Todos los locales por día','Todos los locales y solo fines de semana','Todos los rubros','Consulta todos los locales de 2024'])assert.equal(isExclusiveLocalRemoval(message),false,message);
 assert.deepEqual(getSalesLocalRemovalChange('Todos los locales, durante 2024, por año'),{dateFrom:'01/01/2024',dateTo:'31/12/2024',groupBy:['year']});
 assert.deepEqual(getSalesLocalRemovalChange('Todos los locales por mes'),{groupBy:['month']});assert.equal(getSalesLocalRemovalChange('Todos los locales y solo fines de semana'),null);
});

test('pure local removal without an effective previous period fails before a query can be composed',()=>{
 const s='SYNTHETIC-NO-CONTEXT';clearConversation(s);try{beginSearchSelectionTurn(s,'Todos los locales');assert.throws(()=>guard(s,proposal,[user('Todos los locales')]),{code:'SEARCH_QUERY_CONTEXT_REQUIRED'});assert.deepEqual(getSearchResolutions(s).contexts,{});
  const explicit='Todos los locales durante 2024 por mes';beginSearchSelectionTurn(s,explicit);const r=guard(s,proposal,[user(explicit)]);assert.equal(r.dateFrom,'01/01/2024');assert.equal(r.dateTo,'31/12/2024');assert.deepEqual(r.groupBy,['month']);assert.equal(r.dayType,undefined);
 }finally{clearConversation(s);}
});
