import test from 'node:test';
import assert from 'node:assert/strict';
import {sameSolesType,monthPeriod,remainingCases,diagnosticCases,purchaseSamples,solesCases,forwardOracleExecute,normalizeSolesDocumentForControl} from '../scripts/backend-independent-control-values.mjs';
import {getMemberSoles} from '../src/services/soles/memberSoles.service.js';
import oracledb from 'oracledb';

test('control compares contract numeric IDs without turning null or blank into zero',()=>{
  for(const [a,b] of [[1,'01'],[901,'901 '],[null,undefined],[0,'0']])assert.equal(sameSolesType(a,b),true);
  for(const [a,b] of [[null,0],['',0],['wrong',1],[1,2],[9007199254740992,'9007199254740992']])assert.equal(sameSolesType(a,b),false);
});

test('controlled soles response normalizes padded Oracle type IDs while preserving balances and counts',async()=>{
  const row={TYPE_ID:'0901 ',GENERATED_AMOUNT:12,BALANCE:7,RECORD_COUNT:2};
  const result=await getMemberSoles({documentNumber:'CONTROLLED',status:'all',useCurrentGenerationPeriod:false},{execute:async()=>({rows:[row]})});
  assert.equal(result.data[0].typeId,901);
  assert.equal(sameSolesType(result.data[0].typeId,row.TYPE_ID),true);
  assert.equal(result.data[0].generatedAmount,12);assert.equal(result.data[0].balance,7);assert.equal(result.data[0].recordCount,2);
});

test('available-month discovery derives actual calendar boundaries and rejects invalid samples',()=>{
  assert.deepEqual(monthPeriod('29/02/2024'),{dateFrom:'01/02/2024',dateTo:'29/02/2024'});
  assert.deepEqual(monthPeriod('15/11/2026'),{dateFrom:'01/11/2026',dateTo:'30/11/2026'});
  for(const invalid of ['31/02/2024','2024-01-01','00/01/2024'])assert.throws(()=>monthPeriod(invalid));
});

test('remaining stage excludes every approved block and HTTP replay',()=>{
  assert.equal(remainingCases.size,5);
  for(const code of ['MEMBER_PROFILE','MEMBER_VEHICLES','PURCHASES_VS_SALES_INDEPENDENT','CAMPAIGN_THREE_PERIODS','INVOICE_FILTERS','CONTRACT_CONCEPTS_LATEST_INVOICE_COST','COMPARISON_DOLLAR_COLLISION_ORACLE_CTE','AFFECTED_AND_MISSING_POSITIVE_HTTP'])assert.equal(remainingCases.has(code),false);
});

test('diagnostic stage also excludes the newly approved usages and ranking',()=>{
  assert.deepEqual([...diagnosticCases],['INDIVIDUAL_PURCHASES_TWO_MEMBERS','MEMBER_SOLES_HISTORY','VEHICLE_REGISTRATION_AGE_DISTINCTS']);
});

test('purchase discovery carries a local/category pair belonging to each sampled document',()=>{
  const rows=[{COD_SOCIO:'A',C:'C1',R:'R1'},{COD_SOCIO:'A',C:'C2',R:'R2'},{COD_SOCIO:'B',C:'C3',R:'R3'},{COD_SOCIO:'C',C:null,R:'R4'}];
  const before=structuredClone(rows),got=purchaseSamples(rows);
  assert.deepEqual(got,[rows[1],rows[2]]);
  assert.deepEqual(rows,before);
  assert.equal(purchaseSamples([{COD_SOCIO:'A',C:'C1',R:null}]).length,0);
});

test('soles stage excludes all twelve approved blocks',()=>{
  assert.deepEqual([...solesCases],['MEMBER_SOLES_HISTORY']);
});

test('driver execute overload rejects explicit undefined and forwarding preserves options without Oracle login',async()=>{
  const connection=new oracledb.Connection();let executions=0;
  // Only the network implementation is controlled. Real driver overload and
  // option validation execute, including the exact failure seen in DEV.
  connection._impl={_getConnImpl(){return this;},async _acquireLock(){},_releaseLock(){},async execute(){executions++;return {rows:[]};}};
  connection._processExecuteBinds=async()=>[];
  connection._addDefaultsToExecOpts=()=>{};
  await assert.rejects(connection.execute('SELECT 1 FROM DUAL',{},undefined),{code:'NJS-005'});
  assert.equal(executions,0);
  assert.deepEqual(await forwardOracleExecute(connection,'SELECT 1 FROM DUAL',{},undefined),{rows:[]});
  assert.deepEqual(await forwardOracleExecute(connection,'SELECT 1 FROM DUAL',{},{outFormat:oracledb.OUT_FORMAT_OBJECT}),{rows:[]});
  assert.equal(executions,2);
  await assert.rejects(forwardOracleExecute(connection,'SELECT 1 FROM DUAL',{},null),{code:'NJS-005'});
  const denied=Object.assign(Error('CONTROLLED'),{code:'ORA-00942'});
  connection._impl.execute=async()=>{throw denied;};
  await assert.rejects(forwardOracleExecute(connection,'SELECT 1 FROM DUAL',{}),{code:'ORA-00942'});
});

test('canonical soles control input trims only outside whitespace and preserves exact identity',()=>{
  assert.equal(normalizeSolesDocumentForControl('  00123  '),'00123');
  assert.equal(normalizeSolesDocumentForControl('\t001 23\n'),'001 23');
  assert.notEqual(normalizeSolesDocumentForControl('00123'),'123');
  for(const value of ['', ' ', null, undefined, 123])assert.throws(()=>normalizeSolesDocumentForControl(value));
});

test('canonical soles control and real service query the same exact document without merging padded database identities',async()=>{
  const raw=' 00123 ',canonical=normalizeSolesDocumentForControl(raw);
  const records=[
    {document:raw,type:901,generated:999,balance:999},
    {document:canonical,type:901,generated:10,balance:4},
    {document:canonical,type:902,generated:20,balance:8},
  ];
  const control=document=>records.filter(r=>r.document===document).map(r=>({typeId:r.type,generatedAmount:r.generated,balance:r.balance,recordCount:1}));
  const binds=[];
  const result=await getMemberSoles({documentNumber:raw,status:'all',useCurrentGenerationPeriod:false},{execute:async(sql,input)=>{
    assert.ok(!/TRIM\s*\(\s*COD_SOCIO\s*\)/i.test(sql));
    assert.equal(input.documentNumber,canonical);binds.push(input.documentNumber);
    return {rows:control(input.documentNumber).map(r=>({TYPE_ID:r.typeId,GENERATED_AMOUNT:r.generatedAmount,BALANCE:r.balance,RECORD_COUNT:r.recordCount}))};
  }});
  const values=result.data.map(({typeId,generatedAmount,balance,recordCount})=>({typeId,generatedAmount,balance,recordCount}));
  assert.notDeepEqual(values,control(raw),'reproduces the original control using a different padded input');
  assert.deepEqual(values,control(canonical));
  assert.equal(result.documentNumber,canonical);assert.deepEqual(binds,[canonical]);
});
