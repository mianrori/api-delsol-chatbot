import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMembers} from '../src/services/members/memberAnalysis.service.js';
import {buildMemberAnalysisFollowupResponse} from '../src/services/ai/memberAnalysisFollowup.service.js';

const period={dateFrom:'01/01/2023',dateTo:'31/01/2023'};
const args={resultMode:'summary',purchasePeriods:[period],metrics:['totalAmount','purchaseCount','recurrenceMonths']};
const row=(id,extra={})=>({DOCUMENT_NUMBER:id,FULL_NAME:'Synthetic member '+id,BIRTH_DATE:null,BIRTH_MONTH:null,GENDER:null,AGE:null,CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_SYMBOL:'PYG',TOTAL_AMOUNT:10,PURCHASE_COUNT:1,RECURRENCE_MONTHS:1,COMMERCIALLY_ACTIVE:1,TOTAL_MATCHES:2,...extra});

test('segmentation cannot replace the authorized connection using tool arguments',async()=>{
 let authorizedQueries=0;
 const authorized={execute:async()=>{authorizedQueries++;return {rows:[]};}};
 await analyzeMembers({...args,connection:{execute:()=>assert.fail('Untrusted connection reached')},username:'UNTRUSTED'},authorized,'AUTHORIZED');
 assert.ok(authorizedQueries>0);
});

test('summary counts distinct members across currency rows without adding their distinct counts',async()=>{
 const rows=[row('A'),row('A',{CURRENCY_DESCRIPTION:'DOLARES',CURRENCY_SYMBOL:'USD',TOTAL_AMOUNT:2}),row('B')];
 const result=await analyzeMembers(args,{execute:async()=>({rows})},'AUTHORIZED');
 assert.equal(result.summary.totalMatches,2);assert.equal(result.summary.returnedCount,2);
 assert.equal(result.summary.commerciallyActiveCount,2);assert.equal(result.summary.purchaseCount,3);
 assert.equal(result.summary.totalsByCurrency.length,2);
 assert.equal(result.summary.totalsByCurrency.find(t=>t.currency.symbol==='PYG').memberCount,2);
});

test('member rows preserve missing demographics and exclude unused contact fields',async()=>{
 const result=await analyzeMembers({...args,resultMode:'members',amountMin:0,limit:1},{execute:async()=>({rows:[row('A',{TOTAL_MATCHES:1,EMAIL:'SYNTHETIC_PRIVATE',PHONE:'SYNTHETIC_PRIVATE'})]})},'AUTHORIZED');
 assert.equal(result.members[0].birthDate,null);assert.equal(result.members[0].birthMonth,null);
 assert.equal(result.members[0].gender,null);assert.equal(result.members[0].age,null);
 assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE'));
});

test('combined invalid filters fail before any Oracle operation rather than broadening the cohort',async()=>{
 for(const change of [{gender:'unknown'},{birthMonth:13},{ageMin:50,ageMax:20},{amountMin:100,amountMax:10},{purchasePeriodMatch:'unknown'},{purchasePeriods:[{dateFrom:'31/02/2023',dateTo:'01/03/2023'}]},{metrics:['unknown']},{breakdownBy:['unknown']},{customerIds:'X'},{limit:0,resultMode:'members'}]){
  let calls=0;await assert.rejects(analyzeMembers({...args,...change},{execute:async()=>{calls++;return {rows:[]};}},'AUTHORIZED'));assert.equal(calls,0);
 }
});

test('gender and amount segments preserve currencies and distinct members; recurrence segments do not add currency rows',async()=>{
 const rows=[row('A'),row('A',{CURRENCY_DESCRIPTION:'DOLARES',CURRENCY_SYMBOL:'USD',TOTAL_AMOUNT:2}),row('B',{GENDER:'F'})];
 const r=await analyzeMembers({...args,breakdownBy:['gender','amountSegment','recurrenceSegment'],amountSegments:[{label:'Synthetic range',min:0,max:100}],recurrenceSegments:[{label:'Synthetic recurrence',min:1,max:2}]},{execute:async()=>({rows})},'AUTHORIZED');
 assert.equal(r.breakdown.gender.length,3);
 assert.ok(r.breakdown.gender.every(g=>g.currency&&g.memberCount===1));
 const segment=r.breakdown.amountSegments[0];assert.equal(segment.memberCount,2);assert.equal(segment.totalAmount,null);assert.ok(segment.reason);assert.equal(segment.totalsByCurrency.length,2);
 assert.equal(r.breakdown.recurrenceSegments[0].memberCount,2);
});

test('monetary ranking rejects a mixed-currency universe instead of comparing native amounts',async()=>{
 await assert.rejects(analyzeMembers({...args,resultMode:'members',amountMin:0,orderBy:'totalAmount',limit:1},{execute:async()=>({rows:[row('A',{RANK_CURRENCY_COUNT:2})]})},'AUTHORIZED'),{code:'MEMBER_RANKING_MULTIPLE_CURRENCIES'});
});

test('purchase breakdowns and attached member rows retain their currency without multiplying members or amounts',async()=>{
 const members=[row('A'),row('A',{CURRENCY_DESCRIPTION:'DOLARES',CURRENCY_SYMBOL:'USD',TOTAL_AMOUNT:2}),row('B')];
 let selected=members;
 const connection={execute:async sql=>({rows:sql.includes('RANKED_MEMBERS AS')?selected:[
  {DOCUMENT_NUMBER:'A',CATEGORY_ID:'R',CATEGORY_NAME:'Synthetic',CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_SYMBOL:'PYG',TOTAL_AMOUNT:10,PURCHASE_COUNT:1},
  {DOCUMENT_NUMBER:'A',CATEGORY_ID:'R',CATEGORY_NAME:'Synthetic',CURRENCY_DESCRIPTION:'DOLARES',CURRENCY_SYMBOL:'USD',TOTAL_AMOUNT:2,PURCHASE_COUNT:1},
  {DOCUMENT_NUMBER:'B',CATEGORY_ID:'R',CATEGORY_NAME:'Synthetic',CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_SYMBOL:'PYG',TOTAL_AMOUNT:10,PURCHASE_COUNT:1},
 ]})};
 const input={...args,resultMode:'members',amountMin:0,orderBy:'purchaseCount',limit:2,breakdownBy:['category']};
 const r=await analyzeMembers(input,connection,'AUTHORIZED');
 assert.equal(r.summary.returnedCount,2);assert.equal(r.breakdown.category.length,2);
 assert.equal(r.breakdown.category.find(g=>g.currency.symbol==='PYG').totalAmount,20);
 assert.equal(r.breakdown.category.find(g=>g.currency.symbol==='USD').totalAmount,2);
 assert.ok(r.members.every(m=>m.breakdown.category.length===1&&m.breakdown.category[0].currency.symbol===m.currency.symbol));
 const text=buildMemberAnalysisFollowupResponse({input,result:r});assert.match(text,/2 socios del ranking/);assert.doesNotMatch(text,/3 socios del ranking/);
 selected=members.filter(m=>m.CURRENCY_SYMBOL==='PYG');
 const filtered=await analyzeMembers({...input,amountMin:3},connection,'AUTHORIZED');
 assert.equal(filtered.breakdown.category.length,1);assert.equal(filtered.breakdown.category[0].currency.symbol,'PYG');
});

test('general ALL-period query uses one source reference and member-wide analytic presence before currency grouping',async()=>{
 let observed;
 await analyzeMembers({...args,purchasePeriods:[period,{dateFrom:'01/02/2023',dateTo:'28/02/2023'}],purchasePeriodMatch:'all'},{execute:async sql=>{observed=sql;return {rows:[]};}},'AUTHORIZED');
 assert.equal(observed.match(/FROM VW_BOT_COMPRAS_SOCIO/g).length,1);
 assert.match(observed,/OVER \(PARTITION BY COD_SOCIO\) AS MEMBER_RECURRENCE_MONTHS/);
 assert.match(observed,/WHERE PRESENT_PERIOD_0 = 1 AND PRESENT_PERIOD_1 = 1/);
});
