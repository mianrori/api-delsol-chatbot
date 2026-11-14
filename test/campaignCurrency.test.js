import test from "node:test";
import assert from "node:assert/strict";
import {getCampaignSalesPerformance} from "../src/services/sales/campaignSalesPerformance.service.js";
import {buildCampaignSalesPerformanceResponse} from "../src/services/ai/campaignSalesPerformancePresentation.service.js";

const args={promotionId:"CONTROLLED",campaignId:"CONTROLLED",campaignDateFrom:"01/05/2023",campaignDateTo:"01/05/2023"};
const group=(description,abbreviation,amount=100)=>({CURRENCY_DESCRIPTION:description,CURRENCY_ABBREVIATION:abbreviation,TOTAL_AMOUNT:amount,TOTAL_INVOICES:1,SOURCE_ROWS:1});
const pyg=()=>group("GUARANIES","PYG");
const evaluate=async periods=>getCampaignSalesPerformance(args,{async execute(sql){return {rows:sql.includes("VW_BOT_PROMOCIONES")?[{COD_PROMOCION:args.promotionId,COD_CAMPANIA:args.campaignId,FECHA_DESDE:args.campaignDateFrom,FECHA_HASTA:args.campaignDateTo}]:periods.shift()};}});
const present=result=>buildCampaignSalesPerformanceResponse([{name:"analyze_campaign_sales_performance",result}]);

for(const index of [0,1,2])test(`campaign missing currency with records invalidates only affected pairs, position ${index}`,async()=>{
 const periods=[[pyg()],[pyg()],[pyg()]];periods[index]=[group(null,null,50)];
 const r=await evaluate(periods),key=["before","during","after"][index],p=r.periods[key];
 assert.equal(p.sourceRows,1);assert.equal(p.reasonCode,"CURRENCY_MISSING");assert.equal(p.totalAmount,null);assert.equal(p.averageDailyAmount,null);
 assert.equal(p.currency.code,null);assert.equal(p.currency.symbol,null);assert.equal(p.currencyGroups[0].totalAmount,50);
 for(const c of Object.values(r.comparisons)){
  if([c.previousPeriod,c.currentPeriod].includes(key)){assert.equal(c.totalAmount,null);assert.equal(c.averageDailyAmount,null);assert.equal(c.reasonCode,"CURRENCY_MISSING");assert.ok(c.calculationReason);}
  else{assert.ok(c.totalAmount);assert.equal(c.reasonCode,null);assert.equal(c.currency.code,"PYG");}
  assert.ok(c.totalInvoices);
 }
 assert.equal(r.currency.consistent,false);const text=present(r);assert.match(text,/moneda falta/);assert.match(text,/Moneda sin identificar 50/);assert.match(text,/No calculable/);
});

test("campaign unrecognized, dollar-only and contradictory metadata cannot inherit PYG",async()=>{
 for(const [description,abbreviation,status]of [["UNKNOWN","PYG","UNRECOGNIZED"],[null,"$","UNRECOGNIZED"],["DOLARES","PYG","CONTRADICTORY"],["GUARANI INVENTADO","PYG","UNRECOGNIZED"]]){
  const r=await evaluate([[group(description,abbreviation)],[pyg()],[pyg()]]),p=r.periods.before;
  assert.equal(p.reasonCode,`CURRENCY_${status}`);assert.equal(p.currency.code,null);assert.equal(p.currency.symbol,null);assert.equal(p.totalAmount,null);
  assert.equal(r.comparisons.duringVsBefore.totalAmount,null);assert.ok(r.comparisons.afterVsDuring.totalAmount);assert.ok(p.calculationReason);
  const text=present(r);assert.ok(text.includes(p.calculationReason));assert.match(text,/Moneda sin identificar 100/);
 }
});

test("campaign no records is distinct from missing currency and does not invalidate populated compatible periods",async()=>{
 for(const index of [0,1,2]){
  const periods=[[pyg()],[pyg()],[pyg()]];periods[index]=[];const r=await evaluate(periods),p=r.periods[["before","during","after"][index]];
  assert.equal(p.sourceRows,0);assert.equal(p.reasonCode,null);assert.equal(p.currency.status,"empty");assert.equal(p.currency.code,null);assert.equal(p.totalAmount,0);
  assert.equal(r.currency.consistent,true);assert.ok(Object.values(r.comparisons).every(c=>c.totalAmount&&c.currency.code==="PYG"));assert.match(present(r),/no tienen registros/);
 }
 const empty=await evaluate([[],[],[]]);assert.ok(Object.values(empty.comparisons).every(c=>c.totalAmount===null&&c.reasonCode==="NO_RECORDS"));
});

test("campaign recognized compatible currencies preserve amounts and percentages without FX",async()=>{
 for(const [description,abbreviation]of [["GUARANIES","PYG"],["DOLARES","USD"],["DOLAR CANADIENSE","CAD"],["DOLARES","$"]]){
  const r=await evaluate([[group(description,abbreviation,100)],[group(description,abbreviation,200)],[group(description,abbreviation,300)]]);
  assert.equal(r.currency.consistent,true);assert.equal(r.comparisons.duringVsBefore.totalAmount.percentageChange,100);
  assert.deepEqual(Object.values(r.periods).map(p=>p.totalAmount),[100,200,300]);assert.ok(Object.values(r.comparisons).every(c=>c.reasonCode===null));
 }
 const aliases=await evaluate([[group("GUARANIES","PYG")],[group("GUARANI","GS",200)],[pyg()]]);assert.equal(aliases.comparisons.duringVsBefore.totalAmount.percentageChange,100);
});

test("campaign recognized incompatible currencies suppress affected comparisons but preserve native totals",async()=>{
 const r=await evaluate([[pyg()],[group("DOLARES","USD",20)],[pyg()]]);
 for(const c of [r.comparisons.duringVsBefore,r.comparisons.afterVsDuring]){assert.equal(c.totalAmount,null);assert.equal(c.averageDailyAmount,null);assert.equal(c.reasonCode,"CURRENCY_INCOMPATIBLE");assert.ok(c.calculationReason);}
 assert.ok(r.comparisons.afterVsBefore.totalAmount);assert.equal(r.periods.during.totalAmount,20);assert.equal(r.periods.before.totalAmount,100);
 const text=present(r);assert.match(text,/USD 20/);assert.match(text,/períodos tienen monedas distintas/);
});
