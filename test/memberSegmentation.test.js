import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMembers} from '../src/services/members/memberAnalysis.service.js';

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
