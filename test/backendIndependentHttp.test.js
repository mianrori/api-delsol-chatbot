import test from 'node:test';
import assert from 'node:assert/strict';
import {contrastPreparedHttp} from '../scripts/backend-independent-http.mjs';

test('new DEV bridge preserves prepared arguments through the actual HTTP and chat path (controlled auth/data)',async()=>{
  const period={dateFrom:'01/01/2023',dateTo:'31/05/2023'};
  const requests=[
    {name:'compare_member_purchases_vs_sales',args:{...period,customerIds:['123'],categoryIds:['456'],breakdownBy:['month']},result:{status:'NOT_FOUND',period,breakdownBy:['month'],results:[],summary:{totalGroups:0}}},
    {name:'get_invoices',args:{customerIds:['123'],dateFrom:'01/01/2023',dateTo:'01/01/2023',mode:'summary',groupBy:['customer'],invoiceNumber:'CONTROLLED',period:'01/2023',cancelled:false},result:{data:[]}},
    {name:'get_contract_conditions',args:{customerId:'123',contractType:'CNT',contractSeries:'A',contractNumber:1,localNumber:'7'},result:{status:'RESOLVED',contract:{customerId:'123'},concepts:[]}},
    {name:'get_contract_cost_per_sqm',args:{customerId:'123',contractType:'CNT',contractSeries:'A',contractNumber:1,localNumber:'7',conceptCode:'1',targetCurrency:'PYG'},result:{status:'OK',costPerSqm:10}},
  ];
  let queries=0,auth=0;
  await contrastPreparedHttp({sessionId:'controlled-independent-http',requests,
    executeTool:async request=>{const expected=requests[queries++];assert.equal(request.name,expected.name);assert.deepEqual(request.arguments,expected.args);return expected.result;},
    check:(ok,code)=>assert.ok(ok,code),
    controllerOverrides:{'../services/sessions/oracleSession.service.js':{getValidOracleSession:async()=>{auth++;return {username:'CONTROLLED'};}}},
  });
  assert.equal(queries,4);assert.equal(auth,4);
});
