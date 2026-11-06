import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMembers} from '../src/services/members/memberAnalysis.service.js';
import {analyzeMembersTool} from '../src/tools/members/analyzeMembers.tool.js';

const input={resultMode:'members',purchasePeriods:[{dateFrom:'01/01/2023',dateTo:'31/01/2023'}],amountMin:0,gender:'female',customerIds:['SYNTHETIC_STORE'],categoryIds:['SYNTHETIC_CATEGORY'],limit:2};
const capture=()=>{const calls=[];return {calls,execute:async(sql,binds)=>{calls.push({sql,binds});return {rows:[]};}};};

test('orderBy contract permits omission but neither null nor values outside the string enum',()=>{
 const schema=analyzeMembersTool.toolSpec.inputSchema.json;
 assert.equal(schema.properties.orderBy.type,'string');
 assert.deepEqual(schema.properties.orderBy.enum,['totalAmount','purchaseCount','recurrenceMonths','fullName']);
 assert.ok(!schema.required?.includes('orderBy'));
});

test('omitted orderBy produces the same SQL and combined filters as explicit totalAmount',async()=>{
 const omitted=capture(),explicit=capture();
 await analyzeMembers(input,omitted,'AUTHORIZED');
 await analyzeMembers({...input,orderBy:'totalAmount'},explicit,'AUTHORIZED');
 assert.ok(omitted.calls.length>0);assert.deepEqual(omitted.calls,explicit.calls);
 const {sql,binds}=omitted.calls[0];
 assert.match(sql,/TOTAL_AMOUNT\s+DESC/);assert.doesNotMatch(sql,/\b(?:undefined|null)\s+(?:ASC|DESC)\b/i);
 for(const value of ['SYNTHETIC_STORE','SYNTHETIC_CATEGORY','F','01/01/2023','31/01/2023',0,2])assert.ok(Object.values(binds).includes(value));
});

test('null and invalid orderBy fail before any Oracle query in members and summary modes',async()=>{
 for(const resultMode of ['members','summary'])for(const orderBy of [null,'','invalid','TOTAL_AMOUNT DESC',0,[],{}]){
  const connection=capture();await assert.rejects(analyzeMembers({...input,resultMode,orderBy},connection,'AUTHORIZED'),/Filtros de segmentación inválidos/);assert.equal(connection.calls.length,0);
 }
});

test('each valid orderBy retains all combined filter binds and uses a whitelisted SQL column',async()=>{
 for(const [orderBy,column] of [['totalAmount','TOTAL_AMOUNT'],['purchaseCount','RANK_PURCHASE_COUNT'],['recurrenceMonths','RANK_RECURRENCE_MONTHS'],['fullName','FULL_NAME']]){
  const connection=capture();await analyzeMembers({...input,orderBy},connection,'AUTHORIZED');
  assert.equal(connection.calls.length,1);assert.match(connection.calls[0].sql,new RegExp(column+'\\s+DESC'));
  for(const value of ['SYNTHETIC_STORE','SYNTHETIC_CATEGORY','F','01/01/2023','31/01/2023',0,2])assert.ok(Object.values(connection.calls[0].binds).includes(value));
 }
});

test('omitted and explicit monetary order both reject mixed currencies; null cannot bypass the guard',async()=>{
 for(const fields of [{},{orderBy:'totalAmount'}]){
  let queries=0;await assert.rejects(analyzeMembers({...input,...fields},{execute:async()=>{queries++;return {rows:[{RANK_CURRENCY_COUNT:2}]};}},'AUTHORIZED'),{code:'MEMBER_RANKING_MULTIPLE_CURRENCIES'});assert.equal(queries,1);
 }
 const blocked=capture();await assert.rejects(analyzeMembers({...input,orderBy:null},blocked,'AUTHORIZED'));assert.equal(blocked.calls.length,0);
});
