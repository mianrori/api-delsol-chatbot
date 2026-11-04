import test from 'node:test';
import assert from 'node:assert/strict';
import {dailySegmentationQuery,aggregateDailySegmentation,dailySegmentationBreakdown} from '../scripts/member-segmentation-daily-control.mjs';
const january={dateFrom:'01/01/2023',dateTo:'31/01/2023'},february={dateFrom:'01/02/2023',dateTo:'28/02/2023'};
const row=(id,day,amount,symbol='PYG',extra={})=>({DOCUMENT_NUMBER:id,FULL_NAME:'Synthetic '+id,GENDER:null,BIRTH_DATE:null,AGE:null,PURCHASE_DAY:day,CURRENCY_DESCRIPTION:symbol,CURRENCY_SYMBOL:symbol,CUSTOMER_ID:'L',CATEGORY_ID:'R',TOTAL_AMOUNT:amount,PURCHASE_COUNT:1,NAME_ORDER:id==='A'?1:2,DOCUMENT_ORDER:id==='A'?1:2,CURRENCY_ORDER:symbol==='PYG'?1:2,...extra});
test('daily control makes one bound source reference and leaves metric selection independent',()=>{
 const q=dailySegmentationQuery({purchasePeriods:[january,february],customerIds:["SYNTHETIC'"],gender:'female',ageMin:30,amountMin:100});
 assert.equal(q.sql.match(/VW_BOT_COMPRAS_SOCIO/g).length,1);assert.doesNotMatch(q.sql,/EXISTS|MV_BOT/);
 assert.ok(!q.sql.includes("SYNTHETIC'"));assert.equal(q.binds.customerIds0,"SYNTHETIC'");assert.ok(!Object.hasOwn(q.binds,'amountMin'));
 assert.deepEqual([...new Set([...q.sql.matchAll(/:([A-Za-z]\w*)/g)].map(m=>m[1]))].sort(),Object.keys(q.binds).sort());
});
test('daily control selects ALL across currencies, counts distinct recurrence months and does not duplicate overlapping periods',()=>{
 const data=[row('A','2023-01-05',100),row('A','2023-02-06',2,'USD'),row('B','2023-01-08',10)];
 const all=aggregateDailySegmentation({purchasePeriods:[january,february]},data);
 assert.equal(all.length,2);assert.ok(all.every(r=>r.DOCUMENT_NUMBER==='A'&&r.RECURRENCE_MONTHS===2));
 assert.equal(aggregateDailySegmentation({purchasePeriods:[january,february],purchasePeriodMatch:'any'},data).length,3);
 const overlap=aggregateDailySegmentation({purchasePeriods:[january,january]},data.filter(r=>r.PURCHASE_DAY.startsWith('2023-01')));
 assert.equal(overlap.reduce((n,r)=>n+r.PURCHASE_COUNT,0),2);
});
test('daily ranking and breakdown counts preserve member identity and currencies',()=>{
 const data=[row('A','2023-01-05',100),row('A','2023-01-06',2,'USD'),row('B','2023-01-08',300)];
 const r=aggregateDailySegmentation({purchasePeriods:[january],orderBy:'purchaseCount'},data);
 assert.equal(r[0].DOCUMENT_NUMBER,'A');assert.equal(r[1].DOCUMENT_NUMBER,'A');
 const groups=dailySegmentationBreakdown(data,r,'category');
 assert.equal(groups.length,2);assert.equal(groups.find(g=>g.CURRENCY_SYMBOL==='PYG').MEMBER_COUNT,2);
 assert.equal(groups.find(g=>g.CURRENCY_SYMBOL==='USD').TOTAL_AMOUNT,2);
 const filtered=aggregateDailySegmentation({purchasePeriods:[january],amountMin:10},data);
 assert.equal(filtered.length,2);assert.equal(dailySegmentationBreakdown(data,filtered,'category').length,1);
 assert.ok(r.every(row=>row.BIRTH_DATE===null&&row.AGE===null));
});
test('conflicting demographics and implicit or inactive scopes are rejected by the bounded control',()=>{
 assert.throws(()=>dailySegmentationQuery({}),/CONTROL_EXPLICIT/);
 assert.throws(()=>aggregateDailySegmentation({purchasePeriods:[january]},[row('A','2023-01-01',1),row('A','2023-01-02',2,'PYG',{GENDER:'F'})]),/CONTROL_AMBIGUOUS/);
});
