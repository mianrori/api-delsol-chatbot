import test from 'node:test';
import assert from 'node:assert/strict';
import {beginSearchSelectionTurn,recordSearchToolResult,preserveSearchSelection} from '../src/services/ai/searchSelection.service.js';
import {getSearchResolutions,getSearchSelectionTurn,clearConversation} from '../src/state/conversation.store.js';
import {getSales} from '../src/services/sales/sales.service.js';
import {buildSalesSeriesResponse} from '../src/services/ai/salesSeriesPresentation.service.js';
const question='Filtra también por librería';
const original={customerIds:['SYNTHETIC-LOCAL'],categoryIds:['SYNTHETIC-LIBRARY'],dateFrom:'01/01/2023',dateTo:'31/12/2023',groupBy:['month'],metrics:['totalAmount']};
const guard=(session,input,history=[])=>preserveSearchSelection({name:'get_sales',input,history,resolutionState:getSearchResolutions(session),selectionTurn:getSearchSelectionTurn(session)});
const seed=session=>{
 clearConversation(session);
 recordSearchToolResult(session,'search_customers',{}, {status:'RESOLVED',customer:{codCliente:original.customerIds[0]}});
 recordSearchToolResult(session,'search_categories',{}, {status:'RESOLVED',category:{codRubro:original.categoryIds[0]}});
 recordSearchToolResult(session,'get_sales',original,{data:[]});
};
const execute=async input=>{
 const queries=[];
 const result=await getSales(input,{async execute(sql,binds){queries.push({sql,binds:structuredClone(binds)});return {rows:Object.values(binds).includes(original.customerIds[0])?[]:[{MONTH:'01',CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_ABBREVIATION:'PYG',TOTAL_AMOUNT:100,TOTAL_INVOICES:2}]};}},'SYNTHETIC');
 return {result,queries};
};

test('library 2023 follow-up retains confirmed local, explains empty intersection and never mutates proposal or history',async()=>{
 const session='SYNTHETIC-LIBRARY-CONTEXT';seed(session);
 try{
  beginSearchSelectionTurn(session,question);const proposal={dateFrom:original.dateFrom,dateTo:original.dateTo,groupBy:['month'],metrics:'totalAmount',categoryIds:[original.categoryIds[0]]},before=structuredClone(proposal),state=structuredClone(getSearchResolutions(session));
  const history=[{role:'user',content:[{text:question}]}],savedHistory=structuredClone(history);
  const input=guard(session,proposal,history);assert.deepEqual(input.customerIds,original.customerIds);assert.deepEqual(input.categoryIds,original.categoryIds);assert.deepEqual(proposal,before);assert.deepEqual(history,savedHistory);assert.deepEqual(getSearchResolutions(session),state);
  const {result,queries}=await execute(input);assert.equal(result.data.length,0);assert.equal(queries.length,1);assert.match(queries[0].sql,/COD_CLIENTE IN/);assert.match(queries[0].sql,/COD_RUBRO IN/);assert.equal(queries[0].binds.dateFrom,original.dateFrom);assert.equal(queries[0].binds.dateTo,original.dateTo);
  const text=buildSalesSeriesResponse([{name:'get_sales',input,result}],{message:question});assert.match(text,/locales seleccionados; rubros seleccionados/);assert.match(text,/combina el local y el rubro/);assert.match(text,/no describe las ventas del rubro en todos los locales/);assert.match(text,/todos los locales/);assert.ok(!text.includes(original.customerIds[0])&&!text.includes(original.categoryIds[0]));
 }finally{clearConversation(session);}
});

test('explicit all-locals follow-up removes only local and preserves library, dates, day type and monthly grouping',async()=>{
 const session='SYNTHETIC-LIBRARY-REMOVE';seed(session);
 try{
  recordSearchToolResult(session,'get_sales',{...original,dayType:'weekday'},{data:[]});beginSearchSelectionTurn(session,'Todos los locales');
  const input=guard(session,{metrics:['totalAmount']});assert.equal(input.customerIds,undefined);assert.deepEqual(input.categoryIds,original.categoryIds);assert.equal(input.dateFrom,original.dateFrom);assert.equal(input.dateTo,original.dateTo);assert.equal(input.dayType,'weekday');assert.deepEqual(input.groupBy,['month']);
  const {result,queries}=await execute(input);assert.equal(result.data.length,1);assert.doesNotMatch(queries[0].sql,/COD_CLIENTE IN/);assert.match(queries[0].sql,/COD_RUBRO IN/);assert.match(queries[0].sql,/BETWEEN 0 AND 4/);
  const text=buildSalesSeriesResponse([{name:'get_sales',input,result}],{message:question});assert.match(text,/todos los locales; rubros seleccionados; días hábiles/);assert.match(text,/Enero/);assert.doesNotMatch(text,/No se encontraron ventas/);
 }finally{clearConversation(session);}
});

test('fresh library request has no inherited local and scalar and array metrics render the same authoritative source',async()=>{
 const input={...original};delete input.customerIds;const {result}=await execute(input);
 const array=buildSalesSeriesResponse([{name:'get_sales',input,result}],{message:question});const scalar=buildSalesSeriesResponse([{name:'get_sales',input:{...input,metrics:'totalAmount'},result}],{message:question});assert.equal(scalar,array);assert.match(array,/todos los locales; rubros seleccionados/);assert.match(array,/100/);assert.match(array,/2023/);
 assert.equal(buildSalesSeriesResponse([{name:'get_sales',input:{...input,metrics:'unsupported'},result}],{message:question}),null);
});
