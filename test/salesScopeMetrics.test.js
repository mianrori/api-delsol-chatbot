import test from 'node:test';
import assert from 'node:assert/strict';
import {getSales} from '../src/services/sales/sales.service.js';
import {getSalesScopeRepository} from '../src/repositories/sales/salesScope.repository.js';
import {buildSalesSeriesResponse} from '../src/services/ai/salesSeriesPresentation.service.js';
import {getSalesMetricIntent,applySalesMetrics} from '../src/services/ai/salesMetrics.service.js';
import {beginSearchSelectionTurn} from '../src/services/ai/searchSelection.service.js';
import {getSearchSelectionTurn,clearConversation} from '../src/state/conversation.store.js';
import {protectPiiDeep,restorePiiDeep} from '../src/services/ai/pii.service.js';
const base={customerIds:['C1'],categoryIds:['R1'],dateFrom:'01/01/2023',dateTo:'30/04/2023',groupBy:['month'],dayType:'weekday',metrics:['totalAmount','totalInvoices']};
const customers={C1:'Nike catálogo',C2:'Otro local | catálogo'},categories={R1:'Librería',R2:'Deportes'};
const connection=()=>({queries:[],async execute(sql,binds){
 this.queries.push({sql,binds:structuredClone(binds)});
 if(sql.includes('AS SCOPE_ID'))return {rows:Object.values(binds).map(id=>({SCOPE_ID:id,SCOPE_NAME:(sql.includes('VW_BOT_CLIENTES')?customers:categories)[id]}))};
 return {rows:[{MONTH:'01',TOTAL_AMOUNT:100,TOTAL_INVOICES:3,CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_ABBREVIATION:'PYG'}]};
}});
const render=(input,result,options={})=>buildSalesSeriesResponse([{name:'get_sales',input,result}],options);

test('sales scope names are queried by effective IDs on the authorized connection without altering sales filters',async()=>{
 const c=connection(),input=structuredClone(base),result=await getSales(input,c,'SYNTHETIC');
 assert.deepEqual(input,base);assert.equal(c.queries.length,3);assert.match(c.queries[0].sql,/COD_CLIENTE IN/);assert.match(c.queries[0].sql,/COD_RUBRO IN/);assert.match(c.queries[0].sql,/CANTIDAD_FACTURAS/);assert.match(c.queries[0].sql,/BETWEEN 0 AND 4/);
 assert.deepEqual(c.queries[1].binds,{scopeId0:'C1'});assert.deepEqual(c.queries[2].binds,{scopeId0:'R1'});
 assert.match(render(input,result),/Alcance: local Nike catálogo; rubro Librería; días hábiles/);
 const s='SYNTHETIC-SCOPE-PII';try{
  const protectedInput=protectPiiDeep(s,input),protectedResult=protectPiiDeep(s,result);
  assert.match(render(protectedInput,protectedResult,{restoreValue:v=>restorePiiDeep(s,v)}),/Nike catálogo; rubro Librería/);
  assert.doesNotMatch(render(protectedInput,protectedResult),/PII_|Nike catálogo/);
 }finally{clearConversation(s);}
});

test('changing and removing effective filters cannot reuse a previous label or invent a model name',async()=>{
 const input={...base,customerIds:['C2'],categoryIds:['R2'],customerName:'MODEL INVENTED',categoryName:'MODEL INVENTED'},c=connection(),result=await getSales(input,c,'SYNTHETIC');
 const text=render(input,result);assert.match(text,/Otro local \\\| catálogo; rubro Deportes/);assert.doesNotMatch(text,/Nike|Librería|MODEL INVENTED/);
 const noLocal={...base,customerIds:[],dayType:undefined},categoryOnly=await getSales(noLocal,connection(),'SYNTHETIC');assert.match(render(noLocal,categoryOnly),/Alcance: todos los locales del rubro Librería\./);assert.equal(categoryOnly.scope.customers.length,0);
 const noCategory={...base,categoryIds:[]},localOnly=await getSales(noCategory,connection(),'SYNTHETIC');assert.match(render(noCategory,localOnly),/Nike catálogo; todos los rubros/);assert.doesNotMatch(render(noCategory,localOnly),/Librería/);
 const wrongScope={...result,scope:{customers:[{customerId:'C1',customerName:'STALE'}],categories:[{categoryId:'R1',categoryName:'STALE'}]}};
 assert.doesNotMatch(render(input,wrongScope),/STALE|MODEL INVENTED/);
});

test('unfiltered sales skip catalogs; conflicting/missing catalog labels are never chosen arbitrarily',async()=>{
 const c=connection();assert.deepEqual(await getSalesScopeRepository(c,{}),{customers:[],categories:[]});assert.equal(c.queries.length,0);
 const ambiguous={async execute(){return {rows:[{SCOPE_ID:'C1',SCOPE_NAME:'A'},{SCOPE_ID:'C1',SCOPE_NAME:'B'},{SCOPE_ID:'OTHER',SCOPE_NAME:'INJECTED'}]};}};
 assert.deepEqual(await getSalesScopeRepository(ambiguous,{customerIds:['C1','MISSING']}),{customers:[],categories:[]});
});

test('default metric policy replaces an amount-only proposal and changes no other argument',()=>{
 const proposal={...base,metrics:['totalAmount']},saved=structuredClone(proposal),result=applySalesMetrics(proposal);
 assert.deepEqual(result,base);assert.deepEqual(proposal,saved);
 for(const text of ['Solo la tabla','Filtra también por librería','Solo Nike','Ventas por mes'])assert.equal(getSalesMetricIntent(text),null,text);
 for(const text of ['Muestra solo el importe','Solo monto total','Ventas sin facturas'])assert.deepEqual(getSalesMetricIntent(text),['totalAmount'],text);
 for(const text of ['Solo cantidad de facturas','Muestra únicamente las facturas','Sin importe'])assert.deepEqual(getSalesMetricIntent(text),['totalInvoices'],text);
 for(const text of ['Ambas métricas','Importe y cantidad de facturas','No solo importe'])assert.deepEqual(getSalesMetricIntent(text),['totalAmount','totalInvoices'],text);
});

test('explicit single metric survives follow-ups; an explicit request for both restores the default',()=>{
 const s='SYNTHETIC-METRIC-PREFERENCE';clearConversation(s);try{
  beginSearchSelectionTurn(s,'Muestra solo la cantidad de facturas');assert.deepEqual(getSearchSelectionTurn(s).salesMetrics,['totalInvoices']);
  beginSearchSelectionTurn(s,'Ahora por mes');assert.deepEqual(getSearchSelectionTurn(s).salesMetrics,['totalInvoices']);
  beginSearchSelectionTurn(s,'Ambas métricas');assert.deepEqual(getSearchSelectionTurn(s).salesMetrics,['totalAmount','totalInvoices']);
  beginSearchSelectionTurn(s,'Solo el importe');beginSearchSelectionTurn(s,'Ventas del rubro librería durante 2023, por mes');assert.deepEqual(getSearchSelectionTurn(s).salesMetrics,['totalAmount','totalInvoices']);
 }finally{clearConversation(s);}
});
