import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeContractCostIncidence } from '../src/services/contracts/contractCostIncidence.service.js';
import { getHistoricalContractByMonthRepository } from '../src/repositories/contracts/contractHistoryByPeriod.repository.js';
import { preserveContractIncidenceFollowup } from '../src/services/ai/contractIncidenceFollowup.service.js';
import { buildContractIncidenceResponse } from '../src/services/ai/contractIncidencePresentation.service.js';
import { runWithRequestSignal } from '../src/services/requestContext.service.js';

const input={customerId:'SYNTHETIC',dateFrom:'01/01/2023',dateTo:'28/02/2023',groupBy:'month'};
const historyRow=(month='01/2023',fields={})=>({PERIOD_MONTH:month,COD_CLIENTE:'SYNTHETIC',TIP_CONTRATO:'CNT',SER_CONTRATO:'S',NRO_CONTRATO:1,MATCH_COUNT:1,COVERS_PERIOD:1,TOTAL_SUP_LOCAL:10,...fields});
const concept=(fields={})=>({COD_CONCEPTO:'6',DES_CONCEPTO:'Synthetic cost',FEC_DESDE:new Date('2023-01-01T00:00:00Z'),...fields});
const invoice=(fields={})=>({PERIOD_MONTH:'01/2023',COD_CONCEPTO:'6',FECHA_EMISION:new Date('2023-01-31T23:59:59Z'),NRO_FACTURA:'2',SIMBOLO_MONEDA:'PYG',IMPORTE_SIN_IVA:100,...fields});
const sale=(month='01/2023',amount=1000,fields={})=>({PERIOD_MONTH:month,TOTAL_AMOUNT:amount,CURRENCY_CODE:'PYG',CURRENCY_DESCRIPTION:'GUARANIES',SALES_ROWS:1,INVALID_ROWS:0,...fields});
const fx={getUsdSellRate:async()=>({sellRate:2,source:'Synthetic'})};
const db=(options={})=>({queries:[],async execute(sql,binds){this.queries.push({sql,binds});return {rows:sql.includes('VW_BOT_CONTRATOS_LOCALES')?options.history??[historyRow(),historyRow('02/2023')]:sql.includes('VW_BOT_CONTRATOS_CONCEPTOS')?options.concepts??[concept()]:sql.includes('VW_BOT_FACTURAS')?options.invoices??[invoice(),invoice({PERIOD_MONTH:'02/2023',FECHA_EMISION:new Date('2023-02-28T23:59:59Z'),IMPORTE_SIN_IVA:200})]:options.sales??[sale(),sale('02/2023',4000)]};}});

test('monthly and summary incidence use the same exact dates, weighted totals and current FX only for display',async()=>{
 const connection=db();const monthly=await analyzeContractCostIncidence(input,connection,fx);
 assert.deepEqual(monthly.data.map(r=>r.incidencePercentage),[10,5]);
 const summary=await analyzeContractCostIncidence({...input,groupBy:'summary'},db(),fx);
 assert.equal(summary.incidencePercentage,6);assert.equal(summary.shoppingCost.amount,300);assert.equal(summary.sales.amount,5000);
 assert.equal(summary.shoppingCost.usd,150);assert.equal(summary.sales.usd,2500);
 assert.ok(connection.queries.filter(q=>q.sql.includes('VW_BOT_FACTURAS')||q.sql.includes('VW_BOT_VENTAS_LOCALES')).every(q=>q.binds.dateFrom===input.dateFrom&&q.binds.dateTo===input.dateTo));
});

test('history binds local and identity filters, includes expiry equality and never selects a nearest contract',async()=>{
 const c=db({history:[historyRow('01/2023',{MATCH_COUNT:2})]});
 const rows=await getHistoricalContractByMonthRepository({...input,connection:c,localNumber:"SYNTHETIC'LOCAL",contractType:'CNT',contractSeries:'S',contractNumber:'1'});
 assert.equal(rows[0].contract,null);assert.equal(rows[0].totalLocalArea,null);assert.equal(rows[0].resolution,'CONTRACT_AMBIGUOUS');
 const {sql,binds}=c.queries[0];assert.equal(binds.localNumber,"SYNTHETIC'LOCAL");assert.ok(!sql.includes(binds.localNumber));
 assert.match(sql,/C.FEC_CONTRATO < M.PERIOD_END/);assert.match(sql,/C.FEC_VENCIMIENTO >= M.PERIOD_START/);
 assert.match(sql,/C.FEC_CONTRATO <= M.PERIOD_START/);assert.match(sql,/C.FEC_VENCIMIENTO >= M.PERIOD_END - 1\/86400/);
 assert.match(sql,/GREATEST\(MONTH_START, TO_DATE\(:dateFrom/);assert.match(sql,/LEAST\(ADD_MONTHS\(MONTH_START, 1\), TO_DATE\(:dateTo/);
 assert.doesNotMatch(sql,/NEAREST|ESTADO\s*=/);
});

test('absent, ambiguous and partly applicable contracts block incidence and concept/billing attribution',async()=>{
 for(const [fields,status] of [[{MATCH_COUNT:0},'CONTRACT_NOT_AVAILABLE'],[{MATCH_COUNT:2},'CONTRACT_AMBIGUOUS'],[{COVERS_PERIOD:0},'CONTRACT_PARTIAL_PERIOD']]){
  const c=db({history:[historyRow('01/2023',fields),historyRow('02/2023',fields)]});
  const r=await analyzeContractCostIncidence({...input,groupBy:'summary'},c,fx);
  assert.equal(r.status,status);assert.equal(r.incidencePercentage,null);assert.equal(r.shoppingCost.amount,null);assert.ok(r.reason);
  assert.ok(!c.queries.some(q=>q.sql.includes('VW_BOT_CONTRATOS_CONCEPTOS')));
 }
});

test('invoice and concept validity include the exact boundary, latest valid invoice is not a sum, credits retain signs',async()=>{
 const args={...input,dateFrom:'15/01/2023',dateTo:'31/01/2023'};
 const c=db({concepts:[concept({FEC_DESDE:new Date('2023-01-20T00:00:00Z')})],invoices:[
  invoice({FECHA_EMISION:new Date('2023-01-19T23:59:59Z'),IMPORTE_SIN_IVA:999}),
  invoice({FECHA_EMISION:new Date('2023-01-20T00:00:00Z'),IMPORTE_SIN_IVA:-20}),
  invoice({FECHA_EMISION:new Date('2023-02-01T00:00:00Z'),IMPORTE_SIN_IVA:888}),
 ]});
 const r=await analyzeContractCostIncidence(args,c,fx);assert.equal(r.data[0].shoppingCost.amount,-20);assert.equal(r.data[0].incidencePercentage,-2);
 const absent=await analyzeContractCostIncidence(args,db({concepts:[concept({FEC_DESDE:new Date('2023-02-01T00:00:00Z')})]}),fx);
 assert.equal(absent.data[0].incidencePercentage,null);assert.equal(absent.data[0].status,'COST_NOT_AVAILABLE');
});

test('missing concepts, tied invoices and absent billed amounts never invent a complete percentage',async()=>{
 for(const [options,status] of [[{concepts:[concept(),concept({COD_CONCEPTO:'2'})]},'PARTIAL_COST'],
  [{invoices:[invoice(),invoice({IMPORTE_SIN_IVA:999})]},'BILLING_AMBIGUOUS'],
  [{invoices:[invoice({IMPORTE_SIN_IVA:null})]},'INVALID_AMOUNT']]){
  const r=await analyzeContractCostIncidence({...input,dateTo:'31/01/2023'},db(options),fx);
  assert.equal(r.data[0].status,status);assert.equal(r.data[0].incidencePercentage,null);assert.ok(r.data[0].reason);
 }
});

test('no sales, real zero sales and missing source amounts have distinct reasons',async()=>{
 for(const [sales,status] of [[[],'NO_SALES'],[[sale('01/2023',0)],'ZERO_SALES'],[[sale('01/2023',null,{INVALID_ROWS:1})],'INVALID_AMOUNT']]){
  const r=await analyzeContractCostIncidence({...input,dateTo:'31/01/2023'},db({sales}),fx);
  assert.equal(r.data[0].status,status);assert.equal(r.data[0].incidencePercentage,null);assert.ok(r.data[0].reason);
 }
});

test('native USD needs no FX, mixed or conflicting sales currencies cannot be divided or summed',async()=>{
 const args={...input,dateTo:'31/01/2023'};
 const usd=await analyzeContractCostIncidence(args,db({sales:[sale('01/2023',1000,{CURRENCY_CODE:'USD',CURRENCY_DESCRIPTION:'DOLARES'})],invoices:[invoice({SIMBOLO_MONEDA:'USD'})]}),{getUsdSellRate:async()=>assert.fail('No FX for native USD')});
 assert.equal(usd.data[0].incidencePercentage,10);assert.equal(usd.data[0].sales.usd,1000);
 for(const sales of [[sale(),sale('01/2023',50,{CURRENCY_CODE:'USD',CURRENCY_DESCRIPTION:'DOLARES'})],[sale('01/2023',1000,{CURRENCY_CODE:'USD'})],[sale('01/2023',1000,{CURRENCY_CODE:'EUR'})]]){
  const r=await analyzeContractCostIncidence(args,db({sales}),fx);assert.equal(r.data[0].status,'CURRENCY_MISMATCH');assert.equal(r.data[0].sales.amount,null);assert.equal(r.data[0].incidencePercentage,null);
 }
 const cross=await analyzeContractCostIncidence(args,db({invoices:[invoice({SIMBOLO_MONEDA:'USD'})]}),fx);
 assert.equal(cross.data[0].incidencePercentage,null);assert.equal(cross.data[0].sales.usd,500);
});

test('summary never mixes currencies across individually valid months or drops an invalid month',async()=>{
 const r=await analyzeContractCostIncidence({...input,groupBy:'summary'},db({sales:[sale(),sale('02/2023',4000,{CURRENCY_CODE:'USD',CURRENCY_DESCRIPTION:'DOLARES'})],invoices:[invoice(),invoice({PERIOD_MONTH:'02/2023',FECHA_EMISION:new Date('2023-02-28T00:00:00Z'),SIMBOLO_MONEDA:'USD'})]}),fx);
 assert.equal(r.status,'CURRENCY_MISMATCH');assert.equal(r.sales.amount,null);assert.equal(r.shoppingCost.amount,null);assert.equal(r.incidencePercentage,null);
 const partial=await analyzeContractCostIncidence({...input,groupBy:'summary'},db({history:[historyRow()]}),fx);
 assert.equal(partial.incidencePercentage,null);assert.ok(partial.nonCalculableReasons.includes('CONTRACT_NOT_AVAILABLE'));
});

test('invalid exchange rates leave valid native incidence intact and aborts propagate',async()=>{
 for(const value of [0,-1,NaN,Infinity]){
  const r=await analyzeContractCostIncidence({...input,dateTo:'31/01/2023'},db(),{getUsdSellRate:async()=>({sellRate:value})});
  assert.equal(r.data[0].incidencePercentage,10);assert.equal(r.data[0].sales.usd,null);assert.equal(r.exchange.available,false);
 }
 const abort=new AbortController();await assert.rejects(runWithRequestSignal(abort.signal,()=>analyzeContractCostIncidence(input,db(),{getUsdSellRate:async()=>{abort.abort();return {sellRate:2};}})),{code:'REQUEST_ABORTED'});
});

test('invalid identities and filters fail before queries',async()=>{
 for(const fields of [{customerId:{}},{customerId:''},{localNumber:' '},{contractNumber:'1'},{contractType:'CNT',contractSeries:'S',contractNumber:'bad'}]){
  const c=db();await assert.rejects(analyzeContractCostIncidence({...input,...fields},c,fx));assert.equal(c.queries.length,0);
 }
});

test('explicit single-change followups preserve period, grouping, local and exact contract filters',()=>{
 const args={...input,localNumber:'SYNTHETIC-LOCAL',contractType:'CNT',contractSeries:'S',contractNumber:'1'};
 const history=[{role:'user',content:[{text:'Incidencia'}]},{role:'assistant',content:[{toolUse:{name:'analyze_contract_cost_incidence',toolUseId:'i',input:args}}]},
 {role:'user',content:[{toolResult:{toolUseId:'i',status:'success',content:[{json:{dateFrom:args.dateFrom,dateTo:args.dateTo}}]}}]}];
 const resolve=(message,input)=>preserveContractIncidenceFollowup({message,input,history});
 assert.deepEqual(resolve('Ahora cambia el local a "Otro"; conserva los demás filtros',{customerId:'RESOLVED'}),{...args,customerId:'RESOLVED'});
 assert.deepEqual(resolve('Ahora muestra el resumen; conserva los demás filtros',{}),{...args,groupBy:'summary'});
 assert.deepEqual(resolve('Ahora cambia el período a 01/03/2023 al 31/03/2023; conserva los demás filtros',{dateFrom:'01/03/2023',dateTo:'31/03/2023'}),{...args,dateFrom:'01/03/2023',dateTo:'31/03/2023'});
 assert.equal(resolve('Ahora cambia el local a "Otro" y elimina el contrato; conserva los demás filtros',{customerId:'X'}),null);
 history[2].content[0].toolResult.status='error';assert.equal(resolve('Ahora muestra por mes; conserva los demás filtros',{}),null);
});

test('deterministic summary and monthly presentation retain reasons, native currencies, current FX and null percentages',async()=>{
 for(const groupBy of ['summary','month']){
  const r=await analyzeContractCostIncidence({...input,groupBy},db({history:[historyRow('01/2023',{MATCH_COUNT:2}),historyRow('02/2023',{MATCH_COUNT:2})]}),fx);
  const text=buildContractIncidenceResponse([{name:'analyze_contract_cost_incidence',result:r}]);
  assert.match(text,/Varios contratos/);assert.match(text,/no se utiliza para calcular incidencia entre monedas/);assert.ok(!text.includes('0 %'));
 }
});
