import test from 'node:test';import assert from 'node:assert/strict';
import {getCampaignSalesPerformance} from '../src/services/sales/campaignSalesPerformance.service.js';
import {buildCampaignSalesPerformanceResponse as presentCampaign} from '../src/services/ai/campaignSalesPerformancePresentation.service.js';
import {getMemberPurchasesRepository} from '../src/repositories/members/memberPurchase.repository.js';
import {buildMemberPurchasesResponse} from '../src/services/ai/memberPurchasesPresentation.service.js';
const args={promotionId:'P',campaignId:'C',campaignDateFrom:'01/05/2023',campaignDateTo:'01/05/2023'};
const group=(code,a,n=1)=>({CURRENCY_DESCRIPTION:code,CURRENCY_ABBREVIATION:code,TOTAL_AMOUNT:a,TOTAL_INVOICES:n,SOURCE_ROWS:1});
const db=periods=>({async execute(sql){if(sql.includes('VW_BOT_PROMOCIONES'))return {rows:[{COD_PROMOCION:'P',COD_CAMPANIA:'C',FECHA_DESDE:args.campaignDateFrom,FECHA_HASTA:args.campaignDateTo}]};assert.match(sql,/GROUP BY DES_MONEDA,SIGLAS_MONEDA/);return {rows:periods.shift()};}});
test('campaign mixed currencies inside a period never sum or inherit MAX currency, and remain visible',async()=>{
 const r=await getCampaignSalesPerformance(args,db([[group('PYG',100),group('USD',20)],[group('PYG',200)],[group('PYG',300)]]));
 assert.equal(r.periods.before.totalAmount,null);assert.equal(r.periods.before.averageDailyAmount,null);assert.equal(r.currency.consistent,false);
 assert.deepEqual(r.periods.before.currencyGroups.map(g=>[g.currency.abbreviation,g.totalAmount]),[['PYG',100],['USD',20]]);
 assert.equal(r.comparisons.duringVsBefore.totalAmount,null);assert.equal(r.comparisons.afterVsBefore.totalAmount,null);assert.ok(r.comparisons.afterVsDuring.totalAmount);
 const text=presentCampaign([{name:'analyze_campaign_sales_performance',result:r}]);assert.match(text,/No calculable/);assert.match(text,/Varias monedas/);assert.match(text,/USD 20/);assert.match(text,/100/);
});
test('campaign registered rows summing zero with zero invoice metric are not described as no records',async()=>{
 const r=await getCampaignSalesPerformance(args,db([[group('PYG',0,0)],[group('PYG',20)],[group('PYG',30)]]));
 assert.equal(r.periods.before.sourceRows,1);assert.equal(r.comparisons.duringVsBefore.totalAmount.percentageChange,null);
 assert.doesNotMatch(presentCampaign([{name:'analyze_campaign_sales_performance',result:r}]),/no tienen registros/);
});
test('campaign cannot compare two different descriptions sharing a currency abbreviation',async()=>{
 const a={...group('$',100),CURRENCY_DESCRIPTION:'USD'},b={...group('$',200),CURRENCY_DESCRIPTION:'CAD'};
 const r=await getCampaignSalesPerformance(args,db([[a],[b],[a]]));assert.equal(r.currency.consistent,false);assert.equal(r.comparisons.duringVsBefore.totalAmount,null);assert.equal(r.comparisons.afterVsDuring.totalAmount,null);assert.ok(r.comparisons.afterVsBefore.totalAmount);
});
test('individual purchases preserve two descriptions sharing dollar symbol in repository and presentation',async()=>{
 const result=await getMemberPurchasesRepository({connection:{async execute(sql,binds){assert.equal(binds.documentNumber,'SYNTHETIC');assert.match(sql,/GROUP BY MONEDA,\s*SIMBOLO_MONEDA/);return {rows:[{CURRENCY_DESCRIPTION:'USD',CURRENCY_SYMBOL:'$',TOTAL_AMOUNT:100,PURCHASE_COUNT:2},{CURRENCY_DESCRIPTION:'CAD',CURRENCY_SYMBOL:'$',TOTAL_AMOUNT:30,PURCHASE_COUNT:1}]};}},documentNumber:'SYNTHETIC',mode:'summary',metrics:['totalAmount','purchaseCount']});
 assert.deepEqual(result.data.map(r=>[r.currency.description,r.totalAmount,r.purchaseCount]),[['USD',100,2],['CAD',30,1]]);
 const text=buildMemberPurchasesResponse([{name:'get_member_purchases',input:{},result}]);assert.match(text,/USD \(\$\)/);assert.match(text,/CAD \(\$\)/);
});
