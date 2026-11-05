// Read-only DEV contrasts. Business rows and session identity stay in memory.
// Invoked by the local hidden-input helper, never with a session in argv/env.
import {sameSolesType,monthPeriod,remainingCases} from './backend-independent-control-values.mjs';
const emit = process.stdout.write.bind(process.stdout);
for (const k of ['log','info','warn','error','debug','trace','dir','table']) console[k] = () => {};
const report = {suite:'backend-independent-dev', commit:process.argv[2], startedAt:new Date().toISOString(), success:false, checks:[], cases:[], limitations:[], scope:'independent Oracle SELECT versus real tool dispatcher; four prepared-context HTTP checks; no live language-model or frontend test'};
const safeCode = e => /^(ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code) ? e.code : 'INDEPENDENT_CONTROL_FAILED';
const check = (ok,code) => { report.checks.push({code,passed:Boolean(ok)}); if (!ok) throw Error('CONTROL_FAILED'); };
const missing = code => { throw Object.assign(Error(), {missing:code}); };
const blocked = code => { throw Object.assign(Error(), {blocked:code}); };
const deadline=Date.now()+8*60*1000;
const budget=()=>{if(Date.now()>=deadline)blocked('EIGHT_MINUTE_BUDGET_EXHAUSTED');};
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a,b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a)-Number(b)) <= Math.max(.000001,Math.abs(Number(b))*1e-10);
const str = v => v == null ? null : String(v);
const key = (...v) => JSON.stringify(v);
const sort = a => a.map(v=>JSON.stringify(v)).sort();
const df = "TO_DATE(:f,'DD/MM/YYYY')", dt = "TO_DATE(:t,'DD/MM/YYYY')+1";
const historical = {dateFrom:'01/01/2023',dateTo:'31/05/2023'};
const isRemaining=process.argv.includes('--remaining');
report.stage=isRemaining?'remaining':'initial';
report.diagnostics=[];
let sessionId, opened=0,closed=0,closeErrors=0;
let usagePeriod;
const httpRequests=[];
const {default:config} = await import('../config.js');
const pageRows=Math.min(3,Number.isSafeInteger(Number(config.limitFilter))&&Number(config.limitFilter)>0?Number(config.limitFilter):3);
const {withOracleProxySession,getValidOracleSession} = await import('../src/services/sessions/oracleSession.service.js');
const {executeTool} = await import('../src/services/ai/toolExecutor.service.js');
const {default:driver} = await import('oracledb');
const connect = driver.getConnection.bind(driver);
driver.getConnection = async (...args) => {
  const c = await connect(...args); opened++; c.callTimeout=60000;
  const close = c.close.bind(c); let done=false;
  c.close = async () => {try {await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};
  return c;
};
let operation='PREPARE';
const sql = (text,binds={}) => withOracleProxySession(sessionId,async({connection})=>{
  budget();
  if(!/^\s*(SELECT|WITH)\b/i.test(text)) throw Error('READ_ONLY_REQUIRED');
  const rows=(await connection.execute(text,binds,{outFormat:4002,maxRows:10001})).rows;
  if(rows.length>10000) blocked('CONTROL_ROW_LIMIT_EXCEEDED');
  return rows;
});
const tool = (name,args) => {budget();return executeTool({name,arguments:args,context:{sessionId}});};
const discoverUsagePeriod=async()=>{
  if(usagePeriod)return usagePeriod;
  operation='USAGE_AVAILABLE_PERIOD_DISCOVERY';
  const s=(await sql("SELECT TO_CHAR(FECHA_MOVIMIENTO,'DD/MM/YYYY') F FROM VW_BOT_SOLES_UTILIZADOS WHERE FECHA_MOVIMIENTO IS NOT NULL AND COD_SOCIO IS NOT NULL AND ROWNUM<=1"))[0];
  if(!s)missing('SOLES_USAGE_AVAILABLE_PERIOD_NOT_FOUND');
  usagePeriod=monthPeriod(s.F);return usagePeriod;
};
const run = async (code,fn) => {
  if(isRemaining&&!remainingCases.has(code))return;
  operation='CASE_START';
  const start=Date.now();const index=report.checks.length;
  try {await fn();report.cases.push({code,status:'passed',durationMs:Date.now()-start});}
  catch(e){report.cases.push({code,status:e.missing?'sample_missing':e.blocked?'not_run':'failed',reason:e.missing??e.blocked??safeCode(e),operation,durationMs:Date.now()-start});if(e.missing||e.blocked)report.limitations.push(e.missing??e.blocked);}
  check(opened===closed&&closeErrors===0,'ORACLE_CONNECTIONS_CLOSED_AFTER_CASE');
  // A skipped fixture is never counted as a passed contrast.
  if(report.checks.length===index) throw Error('CASE_WITHOUT_EVIDENCE');
};
try {
  check(/^[a-f0-9]{40}$/.test(report.commit??''),'SOURCE_COMMIT_PRESENT');
  check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'DEV_SAFE_CONFIGURATION');
  if(process.argv.includes('--preflight')){
    const {contrastPreparedHttp}=await import('./backend-independent-http.mjs');
    await contrastPreparedHttp({sessionId:'preflight',requests:[],executeTool,check});
    emit(JSON.stringify({preflight:true,success:true}));process.exit(0);
  }
  let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error('INPUT_LIMIT');}
  sessionId=JSON.parse(input).sessionId;input='';
  if(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/i.test(sessionId))throw Error('SESSION_REQUIRED');
  const valid=await getValidOracleSession(sessionId);
  await withOracleProxySession(sessionId,async({connection})=>{
    const r=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{},{outFormat:4002})).rows[0];
    check(str(r.U).toUpperCase()===valid.username&&Boolean(r.P),'SESSION_RESOLVES_TO_ORACLE_PROXY');
  });

  await run('MEMBER_PROFILE',async()=>{
    const sample=(await sql('SELECT COD_SOCIO FROM VW_BOT_SOCIOS WHERE COD_SOCIO IS NOT NULL GROUP BY COD_SOCIO HAVING COUNT(*)=1 ORDER BY COD_SOCIO FETCH FIRST 1 ROWS ONLY'))[0];
    if(!sample)missing('MEMBER_PROFILE_SAMPLE_NOT_FOUND');
    const d=str(sample.COD_SOCIO), r=(await sql("SELECT COD_SOCIO,NOMBRE,APELLIDO,NOMBRE_COMPLETO,TO_CHAR(FECHA_ALTA,'YYYY-MM-DD') A,TO_CHAR(FECHA_NACIMIENTO,'YYYY-MM-DD') B,GENERO,EMAIL,CATEGORIA,ACTIVO,OBSERVACION,RECIBE_TELEMARKETING,GENERA_CUPON,TELEFONO FROM VW_BOT_SOCIOS WHERE COD_SOCIO=:d",{d}))[0];
    const got=await tool('get_member',{documentNumber:d});
    const expected={documentNumber:str(r.COD_SOCIO),firstName:r.NOMBRE,lastName:r.APELLIDO,fullName:r.NOMBRE_COMPLETO,registrationDate:r.A,birthDate:r.B,gender:r.GENERO,email:r.EMAIL,category:r.CATEGORIA,active:r.ACTIVO==='S',observation:r.OBSERVACION,receivesTelemarketing:r.RECIBE_TELEMARKETING==='S',generatesCoupon:r.GENERA_CUPON==='S',phone:r.TELEFONO};
    check(got.status==='FOUND'&&equal(got.member,expected),'PROFILE_ALL_FIELDS_AND_NULLS_RECONCILED');
    const absent='999999999999999999999999999999';
    if((await sql('SELECT COD_SOCIO FROM VW_BOT_SOCIOS WHERE COD_SOCIO=:d',{d:absent})).length)missing('ABSENT_PROFILE_SENTINEL_COLLISION');
    check((await tool('get_member',{documentNumber:absent})).status==='NOT_FOUND','PROFILE_ABSENCE_RECONCILED');
    if(!Object.values(r).includes(null))report.limitations.push('SELECTED_MEMBER_HAS_NO_NULL_FIELD');
  });

  await run('INDIVIDUAL_PURCHASES_TWO_MEMBERS',async()=>{
    operation='PURCHASE_BOUNDED_SAMPLE_DISCOVERY';
    const pool=await sql("SELECT COD_SOCIO FROM VW_BOT_COMPRAS_SOCIO WHERE FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_SOCIO IS NOT NULL AND ROWNUM<=100");
    const docs=[...new Map(pool.map(r=>[str(r.COD_SOCIO),r])).values()].slice(0,2);
    if(docs.length===1){const next=(await sql("SELECT COD_SOCIO FROM VW_BOT_COMPRAS_SOCIO WHERE FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_SOCIO IS NOT NULL AND COD_SOCIO<>:d AND ROWNUM<=1",{d:str(docs[0].COD_SOCIO)}))[0];if(next)docs.push(next);}
    if(docs.length<2)missing('TWO_POSITIVE_PURCHASE_MEMBERS_NOT_FOUND');
    for(const sample of docs){
      const d=str(sample.COD_SOCIO);
      operation='PURCHASE_FILTER_PAIR_DISCOVERY';
      const combos=await sql("SELECT COD_CLIENTE C,COD_RUBRO R FROM VW_BOT_COMPRAS_SOCIO WHERE COD_SOCIO=:d AND FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_CLIENTE IS NOT NULL AND COD_RUBRO IS NOT NULL GROUP BY COD_CLIENTE,COD_RUBRO ORDER BY COD_CLIENTE,COD_RUBRO FETCH FIRST 1 ROWS ONLY",{d});
      for(const filter of [null,combos[0]].filter(v=>v!==undefined)){
        const binds={d,f:historical.dateFrom,t:historical.dateTo,...(filter?{c:str(filter.C),r:str(filter.R)}:{})};
        const where=`COD_SOCIO=:d AND FECHA_COMPRA>=${df} AND FECHA_COMPRA<${dt}${filter?' AND COD_CLIENTE=:c AND COD_RUBRO=:r':''}`;
        operation='PURCHASE_INDEPENDENT_SUMMARY';
        const rows=await sql(`SELECT TO_CHAR(FECHA_COMPRA,'YYYY-MM') M,MONEDA D,SIMBOLO_MONEDA S,SUM(NVL(IMPORTE,0)) A,COUNT(*) N FROM VW_BOT_COMPRAS_SOCIO WHERE ${where} GROUP BY TO_CHAR(FECHA_COMPRA,'YYYY-MM'),MONEDA,SIMBOLO_MONEDA`,binds);
        const args={...historical,documentNumber:d,...(filter?{customerIds:[str(filter.C)],categoryIds:[str(filter.R)]}:{}),mode:'summary',groupBy:['month'],metrics:['totalAmount','purchaseCount']};
        operation='PURCHASE_TOOL_SUMMARY';const summary=await tool('get_member_purchases',args);
        check(summary.documentNumber===d&&summary.data.length===rows.length&&rows.every(r=>summary.data.some(g=>g.month===r.M&&g.currency.description===r.D&&g.currency.symbol===r.S&&near(g.totalAmount,r.A)&&g.purchaseCount===r.N)),'PURCHASE_SUMMARY_SQL_MEMBER_PERIOD_COMBINED_FILTERS');
        // New SQL evidence only: prior full HTTP paging remains reused.
        operation='PURCHASE_TOOL_INITIAL_PAGE';const detail=await tool('get_member_purchases',{...args,mode:'detail',rows:pageRows,page:1});
        const count=rows.reduce((n,r)=>n+r.N,0);
        check(detail.totalRows===count&&detail.hasMore===(count>pageRows)&&detail.nextPage===(count>pageRows?2:null)&&detail.returnedRows===Math.min(pageRows,count),'PURCHASE_REAL_COUNT_AND_FIRST_PAGE_SQL');
      }
    }
    report.limitations.push('INDIVIDUAL_MIXED_CURRENCY_MEMBER_NOT_EXHAUSTIVELY_SEARCHED');
  });

  await run('MEMBER_VEHICLES',async()=>{
    const s=(await sql("SELECT COD_SOCIO FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND COD_SOCIO IS NOT NULL GROUP BY COD_SOCIO HAVING COUNT(*)<=100 ORDER BY COD_SOCIO FETCH FIRST 1 ROWS ONLY"))[0];
    if(!s)missing('MEMBER_VEHICLES_SAMPLE_NOT_FOUND');
    const d=str(s.COD_SOCIO);
    for(const debit of [undefined,true,false]){
      const rows=await sql(`SELECT MATRICULA,MARCA,MODELO,COLOR,ACTIVO,DEBITO_AUTOMATICO,TO_CHAR(FECHA_ALTA,'DD/MM/YYYY') D FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND COD_SOCIO=:d${debit===undefined?'':' AND DEBITO_AUTOMATICO=:a'}`,{d,...(debit===undefined?{}:{a:debit?'S':'N'})});
      const got=await tool('get_member_vehicles',{documentNumber:d,...(debit===undefined?{}:{automaticDebit:debit})});
      check(got.summary.total===rows.length&&got.summary.active===rows.length&&equal(sort(got.vehicles),sort(rows.map(r=>({plate:r.MATRICULA,brand:r.MARCA,model:r.MODELO,color:r.COLOR,active:true,status:'Activo',automaticDebit:r.DEBITO_AUTOMATICO==='S',registrationDate:r.D})))),'VEHICLES_DOCUMENT_ACTIVE_DEBIT_SQL');
    }
    const shared=await sql("SELECT UPPER(TRIM(MATRICULA)) P FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND MATRICULA IS NOT NULL GROUP BY UPPER(TRIM(MATRICULA)) HAVING COUNT(DISTINCT COD_SOCIO)>1 ORDER BY UPPER(TRIM(MATRICULA)) FETCH FIRST 1 ROWS ONLY");
    if(shared.length){const got=await tool('get_member_vehicles',{plate:shared[0].P});check(got.status==='AMBIGUOUS','SHARED_PLATE_AMBIGUITY_SQL');}
    else report.limitations.push('SHARED_ACTIVE_PLATE_SAMPLE_NOT_FOUND');
  });

  await run('MEMBER_SOLES_HISTORY',async()=>{
    operation='SOLES_SAMPLE_DISCOVERY';
    const s=(await sql('SELECT COD_SOCIO FROM VW_BOT_SOLES_GENERADOS WHERE COD_SOCIO IS NOT NULL GROUP BY COD_SOCIO ORDER BY COD_SOCIO FETCH FIRST 1 ROWS ONLY'))[0];
    if(!s)missing('GENERATED_SOLES_SAMPLE_NOT_FOUND');
    for(const status of ['all','current','expired'])for(const filtered of [false,true]){
      const d=str(s.COD_SOCIO),where=`COD_SOCIO=:d${status==='all'?'':status==='current'?" AND (VENCIMIENTO IS NULL OR VENCIMIENTO>=DATE '2023-06-30')":" AND VENCIMIENTO<DATE '2023-06-30'"}${filtered?" AND FECHA_ALTA>=DATE '2023-01-01' AND FECHA_ALTA<DATE '2023-06-01' AND VENCIMIENTO>=DATE '2023-01-01' AND VENCIMIENTO<DATE '2024-01-01'":''}`;
      operation='SOLES_INDEPENDENT_SUMMARY';const rows=await sql(`SELECT COD_TIPO_SOL T,SUM(NVL(TOTAL,0)) G,SUM(NVL(SALDO,0)) B,COUNT(*) N FROM VW_BOT_SOLES_GENERADOS WHERE ${where} GROUP BY COD_TIPO_SOL`,{d});
      operation='SOLES_TOOL_SUMMARY';const got=await tool('get_member_soles',{documentNumber:d,status,referenceDate:'30/06/2023',useCurrentGenerationPeriod:false,...(filtered?{generationDateFrom:'01/01/2023',generationDateTo:'31/05/2023',expirationDateFrom:'01/01/2023',expirationDateTo:'31/12/2023'}:{})});
      const match=matchType=>got.data.length===rows.length&&rows.every(r=>got.data.some(g=>matchType(g.typeId,r.T)&&near(g.generatedAmount,r.G)&&near(g.balance,r.B)&&g.recordCount===r.N));
      const component=fn=>rows.every(r=>got.data.some(g=>sameSolesType(g.typeId,r.T)&&fn(g,r)));
      report.diagnostics.push({code:'SOLES_COMPARISON_COMPONENTS',status,filtered,groupCountMatches:got.data.length===rows.length,rawTypeAndTotalsMatch:match((a,b)=>str(a)===str(b)),numericTypeAndTotalsMatch:match(sameSolesType),numericTypeGroupsMatch:component(()=>true),generatedAmountsMatch:component((g,r)=>near(g.generatedAmount,r.G)),balancesMatch:component((g,r)=>near(g.balance,r.B)),recordCountsMatch:component((g,r)=>g.recordCount===r.N)});
      check(match(sameSolesType),'SOLES_TYPE_BALANCE_EXPIRY_GENERATION_SQL');
      if(status==='current')check(near(got.summary.currentBalance,rows.reduce((n,r)=>n+Number(r.B),0))&&got.summary.recordCount===rows.reduce((n,r)=>n+r.N,0),'SOLES_GLOBAL_BALANCE_RECORD_COUNT_SQL');
    }
  });

  await run('SOLES_USAGE_COMBINED_FILTERS',async()=>{
    operation='USAGE_COMBINED_AVAILABLE_SAMPLE_DISCOVERY';
    const s=(await sql("SELECT COD_SOCIO D,TIPO_MOVIMIENTO M,TIPO_DESTINO Y,COD_DESTINO C,ID_TIPO_SOL T,COD_RUBRO R,NRO_TRANSACCION N,SOLES_UTILIZADOS Q,TO_CHAR(FECHA_MOVIMIENTO,'DD/MM/YYYY') F FROM VW_BOT_SOLES_UTILIZADOS WHERE FECHA_MOVIMIENTO IS NOT NULL AND COD_SOCIO IS NOT NULL AND TIPO_MOVIMIENTO IS NOT NULL AND TIPO_DESTINO IN ('LOCAL','SOCIO') AND COD_DESTINO IS NOT NULL AND ID_TIPO_SOL IS NOT NULL AND COD_RUBRO IS NOT NULL AND NRO_TRANSACCION IS NOT NULL AND SOLES_UTILIZADOS IS NOT NULL AND ROWNUM<=1"))[0];
    if(!s)missing('SOLES_USAGE_COMBINED_SAMPLE_NOT_FOUND');
    const period=monthPeriod(s.F);usagePeriod=period;
    report.diagnostics.push({code:'USAGE_AVAILABLE_MONTH',...period});
    for(const full of [false,true]){
      const binds={d:str(s.D),f:period.dateFrom,t:period.dateTo,...(full?{m:s.M,y:s.Y,c:str(s.C),i:s.T,r:str(s.R),n:str(s.N),q:s.Q}:{})};
      const where=`COD_SOCIO=:d AND FECHA_MOVIMIENTO>=${df} AND FECHA_MOVIMIENTO<${dt}${full?' AND TIPO_MOVIMIENTO=:m AND TIPO_DESTINO=:y AND COD_DESTINO=:c AND ID_TIPO_SOL=:i AND COD_RUBRO=:r AND NRO_TRANSACCION=:n AND SOLES_UTILIZADOS>=:q AND SOLES_UTILIZADOS<=:q':''}`;
      operation='USAGE_INDEPENDENT_SUMMARY';
      const rows=await sql(`SELECT ID_TIPO_SOL T,SUM(NVL(SOLES_UTILIZADOS,0)) A,COUNT(*) N,COUNT(DISTINCT CASE WHEN NRO_TRANSACCION IS NOT NULL THEN NVL(TIPO_MOVIMIENTO,'?')||':'||TO_CHAR(NRO_TRANSACCION) END) X,COUNT(DISTINCT COD_SOCIO) U FROM VW_BOT_SOLES_UTILIZADOS WHERE ${where} GROUP BY ID_TIPO_SOL`,binds);
      const args={...period,documentNumber:str(s.D),metrics:['totalSolesUsed','movementCount','transactionCount','distinctMembers'],...(full?{movementTypes:[str(s.M)],destinationTypes:[str(s.Y)],destinations:[{destinationType:str(s.Y),destinationCode:str(s.C)}],solesTypeIds:[Number(s.T)],categoryIds:[str(s.R)],transactionNumber:str(s.N),solesMin:s.Q,solesMax:s.Q}:{})};
      operation='USAGE_TOOL_SUMMARY';const got=await tool('get_soles_usage',args);
      check(got.data.length===rows.length&&rows.every(r=>got.data.some(g=>sameSolesType(g.solesTypeId,r.T)&&near(g.totalSolesUsed,r.A)&&g.movementCount===r.N&&g.transactionCount===r.X&&g.distinctMembers===r.U)),'SOLES_USAGE_QUANTITY_DISTINCTS_COMBINED_FILTERS_SQL');
      operation='USAGE_TOOL_DETAIL';
      const detail=await tool('get_soles_usage',{...args,mode:'detail',pageSize:pageRows});
      check(detail.pagination.totalRows===rows.reduce((n,r)=>n+r.N,0),'SOLES_USAGE_DETAIL_FILTERED_COUNT_SQL');
    }
  });

  await run('SOLES_USAGE_MEMBER_RANKING',async()=>{
    const period=await discoverUsagePeriod(),bounds={f:period.dateFrom,t:period.dateTo};
    report.diagnostics.push({code:'USAGE_RANKING_AVAILABLE_MONTH',...period});
    operation='USAGE_INDEPENDENT_RANKING';
    const rows=await sql(`SELECT COD_SOCIO D,SUM(NVL(SOLES_UTILIZADOS,0)) A FROM VW_BOT_SOLES_UTILIZADOS WHERE FECHA_MOVIMIENTO>=${df} AND FECHA_MOVIMIENTO<${dt} AND COD_SOCIO IS NOT NULL GROUP BY COD_SOCIO,NOM_SOCIO ORDER BY SUM(NVL(SOLES_UTILIZADOS,0)) DESC,NOM_SOCIO,COD_SOCIO FETCH FIRST 5 ROWS ONLY`,bounds);
    if(!rows.length)missing('SOLES_MEMBER_RANKING_SAMPLE_NOT_FOUND');
    operation='USAGE_TOOL_RANKING';const got=await tool('get_soles_usage',{...period,groupBy:['member'],metrics:['totalSolesUsed'],limit:5,orderBy:'totalSolesUsed'});
    check(got.data.length===rows.length&&rows.every((r,i)=>str(got.data[i].documentNumber)===str(r.D)&&near(got.data[i].totalSolesUsed,r.A)),'SOLES_RANKING_DISTINCT_MEMBERS_AND_ORDER_SQL');
    for(const g of got.data){
      const types=await sql(`SELECT ID_TIPO_SOL T,SUM(NVL(SOLES_UTILIZADOS,0)) A FROM VW_BOT_SOLES_UTILIZADOS WHERE FECHA_MOVIMIENTO>=${df} AND FECHA_MOVIMIENTO<${dt} AND COD_SOCIO=:d GROUP BY ID_TIPO_SOL,DES_TIPO_SOL`,{...bounds,d:str(g.documentNumber)});
      check(g.solesTypes.length===types.length&&types.every(r=>g.solesTypes.some(t=>sameSolesType(t.solesTypeId,r.T)&&near(t.totalSolesUsed,r.A))),'SOLES_RANKING_TYPE_BREAKDOWN_SQL');
    }
  });

  await run('VEHICLE_REGISTRATION_AGE_DISTINCTS',async()=>{
    operation='VEHICLE_AVAILABLE_MONTH_DISCOVERY';
    const date=(await sql("SELECT TO_CHAR(FECHA_ALTA,'DD/MM/YYYY') F FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND FECHA_ALTA IS NOT NULL AND ROWNUM<=1"))[0];
    if(!date)missing('VEHICLE_REGISTRATION_AVAILABLE_PERIOD_NOT_FOUND');
    const period=monthPeriod(date.F),bounds={f:period.dateFrom,t:period.dateTo};
    report.diagnostics.push({code:'VEHICLE_AVAILABLE_MONTH',...period});
    operation='VEHICLE_INDEPENDENT_MONTH_ROWS';
    const rows=await sql(`SELECT V.COD_SOCIO D,V.MATRICULA P,V.MARCA B,V.MODELO M,V.COLOR C,V.DEBITO_AUTOMATICO A,TO_CHAR(V.FECHA_ALTA,'YYYY-MM-DD') F FROM VW_BOT_VEHICULOS V WHERE V.ACTIVO='S' AND V.FECHA_ALTA>=${df} AND V.FECHA_ALTA<${dt}`,bounds);
    if(!rows.length)missing('VEHICLE_REGISTRATION_AVAILABLE_PERIOD_NOT_FOUND');
    const demo=await sql(`SELECT S.COD_SOCIO D,MIN(S.FECHA_NACIMIENTO) B,COUNT(DISTINCT S.FECHA_NACIMIENTO) N FROM VW_BOT_SOCIOS S WHERE EXISTS(SELECT 1 FROM VW_BOT_VEHICULOS V WHERE V.COD_SOCIO=S.COD_SOCIO AND V.ACTIVO='S' AND V.FECHA_ALTA>=${df} AND V.FECHA_ALTA<${dt}) GROUP BY S.COD_SOCIO`,bounds);
    const people=new Map(demo.map(r=>[str(r.D),r]));
    const reference=period.dateTo.split('/').reverse().join('-');
    const ageAt=(birth,date)=>{
      if(!birth)return null;
      const b=new Date(birth),d=new Date(date+'T00:00:00Z');
      if(b>d)return null;
      const last=v=>v.getUTCDate()===new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth()+1,0)).getUTCDate();
      let age=d.getUTCFullYear()-b.getUTCFullYear();
      if(d.getUTCMonth()<b.getUTCMonth()||d.getUTCMonth()===b.getUTCMonth()&&d.getUTCDate()<b.getUTCDate()&&!(last(b)&&last(d)))age--;
      return age>=0&&age<=120?age:null;
    };
    const totals=records=>({vehicleCount:records.length,plateCount:new Set(records.map(r=>str(r.P)?.trim().toUpperCase()).filter(Boolean)).size,memberCount:new Set(records.map(r=>str(r.D)).filter(v=>v!==null)).size});
    for(const ageReference of ['current','registration']){
      const groups=new Map();
      for(const r of rows){const person=people.get(str(r.D)),age=ageAt(person?.N===1?person.B:null,ageReference==='registration'?r.F:reference);const k=key(age);if(!groups.has(k))groups.set(k,{age,rows:[]});groups.get(k).rows.push(r);}
      operation='VEHICLE_TOOL_AGE_SUMMARY';const got=await tool('get_vehicle_registrations',{...period,groupBy:['age'],ageReference,referenceDate:period.dateTo});
      check(equal(got.totals,totals(rows))&&got.data.length===groups.size&&got.data.every(g=>{const r=groups.get(key(g.age));return r&&equal({vehicleCount:g.vehicleCount,plateCount:g.plateCount,memberCount:g.memberCount},totals(r.rows));}),'VEHICLE_AGE_REFERENCE_DISTINCTS_NULLS_SQL');
    }
    const sample=rows.find(r=>r.B&&r.M&&r.C&&['S','N'].includes(r.A));
    if(sample){
      const filtered=rows.filter(r=>['B','M','C'].every(k=>str(r[k])?.trim().toUpperCase()===str(sample[k]).trim().toUpperCase())&&r.A===sample.A);
      operation='VEHICLE_TOOL_COMBINED_DETAIL';const got=await tool('get_vehicle_registrations',{...period,brand:sample.B,model:sample.M,color:sample.C,automaticDebit:sample.A==='S',mode:'detail',rows:pageRows});
      check(equal(got.totals,totals(filtered))&&got.pagination.totalRows===filtered.length&&got.data.length===Math.min(pageRows,filtered.length),'VEHICLE_COMBINED_FILTER_DETAIL_SQL');
    }else report.limitations.push('VEHICLE_FULL_FILTER_SAMPLE_NOT_FOUND');
    report.limitations.push('VEHICLE_RELATIVE_PERIOD_ORACLE_BOUNDARIES_NOT_IN_THIS_CONTRAST');
  });

  await run('PURCHASES_VS_SALES_INDEPENDENT',async()=>{
    const sample=(await sql("SELECT COD_CLIENTE C,COD_RUBRO R FROM VW_BOT_COMPRAS_SOCIO WHERE FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_CLIENTE IS NOT NULL AND COD_RUBRO IS NOT NULL GROUP BY COD_CLIENTE,COD_RUBRO ORDER BY COD_CLIENTE,COD_RUBRO FETCH FIRST 1 ROWS ONLY"))[0];
    if(!sample)missing('COMPARISON_FILTERED_SAMPLE_NOT_FOUND');
    for(const monthly of [false,true]){
      const b={c:str(sample.C),r:str(sample.R)};
      const sales=await sql(`SELECT ${monthly?"TO_CHAR(FECHA,'YYYY-MM')":"NULL"} M,DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A FROM VW_BOT_VENTAS_LOCALES WHERE FECHA>=DATE '2023-01-01' AND FECHA<DATE '2023-06-01' AND COD_CLIENTE=:c AND COD_RUBRO=:r GROUP BY ${monthly?"TO_CHAR(FECHA,'YYYY-MM'),":''}DES_MONEDA,SIGLAS_MONEDA`,b);
      const purchases=await sql(`SELECT ${monthly?"TO_CHAR(FECHA_COMPRA,'YYYY-MM')":"NULL"} M,MONEDA D,SIMBOLO_MONEDA S,SUM(NVL(IMPORTE,0)) A,COUNT(*) N,COUNT(DISTINCT COD_SOCIO) U FROM VW_BOT_COMPRAS_SOCIO WHERE FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_CLIENTE=:c AND COD_RUBRO=:r GROUP BY ${monthly?"TO_CHAR(FECHA_COMPRA,'YYYY-MM'),":''}MONEDA,SIMBOLO_MONEDA`,b);
      const expected=new Map();
      for(const r of sales)expected.set(key(r.M,r.D,r.S),{m:r.M,d:r.D,s:r.S,sales:Number(r.A),purchases:0,n:0,u:0});
      for(const r of purchases){const k=key(r.M,r.D,r.S);if(!expected.has(k))expected.set(k,{m:r.M,d:r.D,s:r.S,sales:0});Object.assign(expected.get(k),{purchases:Number(r.A),n:r.N,u:r.U});}
      const got=await tool('compare_member_purchases_vs_sales',{...historical,customerIds:[b.c],categoryIds:[b.r],breakdownBy:monthly?['month']:[]});
      check(got.results.length===expected.size&&got.results.every(g=>{
        const r=expected.get(key(g.dimensions[0]?.id??null,g.currency.description,g.currency.symbol));
        if(!r||!near(g.auditedSalesAmount,r.sales)||!near(g.exchangeAmount,r.purchases)||g.invoiceCount!==(r.n??0)||g.memberCount!==(r.u??0))return false;
        const known=Boolean(str(r.d)?.trim())||['PYG','GS','GS.','₲','USD','US$','U$S'].includes(String(r.s??'').trim().toUpperCase());
        return r.sales>0&&known?near(g.percentage,Math.round((r.purchases/r.sales*100+Number.EPSILON)*100)/100):g.percentage===null;
      }),'COMPARISON_BOTH_UNIVERSES_CURRENCY_COUNTS_PERCENTAGE_SQL');
      if(monthly)httpRequests.push({name:'compare_member_purchases_vs_sales',args:{...historical,customerIds:[b.c],categoryIds:[b.r],breakdownBy:['month']},result:got});
      if(!sales.length)report.limitations.push('COMPARISON_SELECTED_FILTER_HAS_NO_SALES');
    }
  });

  await run('CAMPAIGN_THREE_PERIODS',async()=>{
    const s=(await sql("SELECT COD_PROMOCION P,COD_CAMPANIA C,TO_CHAR(FECHA_DESDE,'DD/MM/YYYY') F,TO_CHAR(FECHA_HASTA,'DD/MM/YYYY') T FROM VW_BOT_PROMOCIONES WHERE FECHA_DESDE>=DATE '2023-01-01' AND FECHA_HASTA<DATE '2024-01-01' AND FECHA_HASTA>=FECHA_DESDE ORDER BY FECHA_DESDE,COD_PROMOCION,COD_CAMPANIA FETCH FIRST 1 ROWS ONLY"))[0];
    if(!s)missing('CAMPAIGN_2023_SAMPLE_NOT_FOUND');
    const unique=await sql('SELECT COD_PROMOCION FROM VW_BOT_PROMOCIONES WHERE COD_PROMOCION=:p AND COD_CAMPANIA=:c',{p:s.P,c:s.C});
    if(unique.length!==1)missing('CAMPAIGN_SELECTED_IDENTITY_NOT_UNIQUE');
    const filter=(await sql("SELECT COD_CLIENTE C,COD_RUBRO R FROM VW_BOT_VENTAS_LOCALES WHERE FECHA>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA<TO_DATE(:t,'DD/MM/YYYY')+1 AND COD_CLIENTE IS NOT NULL AND COD_RUBRO IS NOT NULL GROUP BY COD_CLIENTE,COD_RUBRO ORDER BY COD_CLIENTE,COD_RUBRO FETCH FIRST 1 ROWS ONLY",{f:s.F,t:s.T}))[0];
    if(!filter)missing('CAMPAIGN_POSITIVE_FILTER_PAIR_NOT_FOUND');
    const parse=v=>new Date(v.split('/').reverse().join('-')+'T00:00:00Z');
    const f=parse(s.F),t=parse(s.T),days=(t-f)/86400000+1;
    const fmt=n=>new Date(n).toISOString().slice(0,10).split('-').reverse().join('/');
    const bounds={before:[fmt(+f-days*86400000),fmt(+f-86400000)],during:[s.F,s.T],after:[fmt(+t+86400000),fmt(+t+days*86400000)]};
    const controls={};for(const [name,[from,to]] of Object.entries(bounds))controls[name]=await sql(`SELECT DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A,SUM(NVL(CANTIDAD_FACTURAS,0)) N FROM VW_BOT_VENTAS_LOCALES WHERE FECHA>=${df} AND FECHA<${dt} AND COD_CLIENTE=:c AND COD_RUBRO=:r GROUP BY DES_MONEDA,SIGLAS_MONEDA`,{f:from,t:to,c:str(filter.C),r:str(filter.R)});
    check(Object.values(controls).every(r=>r.length<=1),'CAMPAIGN_SOURCE_CURRENCY_GROUPS_NOT_COLLAPSED');
    const got=await tool('analyze_campaign_sales_performance',{promotionId:str(s.P),campaignId:Number(s.C),campaignDateFrom:s.F,campaignDateTo:s.T,customerIds:[str(filter.C)],categoryIds:[str(filter.R)]});
    for(const [name,rows] of Object.entries(controls)){
      const g=got.periods[name],r=rows[0];
      check(g.dateFrom===bounds[name][0]&&g.dateTo===bounds[name][1]&&g.durationDays===days&&near(g.totalAmount,r?.A??0)&&near(g.totalInvoices,r?.N??0)&&(!r||g.currency.description===r.D&&g.currency.abbreviation===r.S),'CAMPAIGN_PERIOD_BOUNDARIES_FILTERS_AMOUNTS_SQL');
    }
  });

  await run('INVOICE_FILTERS',async()=>{
    const s=(await sql("SELECT COD_CLIENTE C,COD_CONCEPTO K,PERIODO P,NRO_FACTURA N,MATRICULA L,TO_CHAR(FECHA_EMISION,'DD/MM/YYYY') D,ANULADO A FROM VW_BOT_FACTURAS WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND COD_CLIENTE IS NOT NULL AND FECHA_EMISION IS NOT NULL AND NRO_FACTURA IS NOT NULL AND PERIODO IS NOT NULL ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC FETCH FIRST 1 ROWS ONLY"))[0];
    if(!s)missing('INVOICE_FILTER_SAMPLE_NOT_FOUND');
    for(const narrow of [false,true]){
      const b={c:str(s.C),f:s.D,t:s.D,...(narrow?{n:'%'+String(s.N).toUpperCase()+'%',p:String(s.P).toUpperCase(),a:s.A==='S'?'S':'N'}:{})};
      const where=`NVL(USER_CAN_CONSULT,'S')<>'N' AND COD_CLIENTE=:c AND FECHA_EMISION>=${df} AND FECHA_EMISION<${dt}${narrow?" AND UPPER(NRO_FACTURA) LIKE :n AND UPPER(PERIODO)=:p AND NVL(ANULADO,'N')=:a":''}`;
      const rows=await sql(`SELECT SIMBOLO_MONEDA S,SUM(IMPORTE) A,COUNT(DISTINCT NRO_FACTURA) N FROM VW_BOT_FACTURAS WHERE ${where} GROUP BY SIMBOLO_MONEDA`,b);
      const args={customerIds:[str(s.C)],dateFrom:s.D,dateTo:s.D,mode:'summary',groupBy:['customer'],...(narrow?{invoiceNumber:str(s.N),period:str(s.P),cancelled:s.A==='S'}:{})};
      const got=await tool('get_invoices',args);
      const symbol=v=>['PYG','GS','GS.','GUARANI','GUARANIES'].includes(String(v??'').trim().toUpperCase())?'₲':v;
      check(got.data.length===rows.length&&rows.every(r=>got.data.some(g=>g.currencySymbol===symbol(r.S)&&near(g.totalAmount,r.A)&&g.invoiceCount===r.N)),'INVOICE_SECURITY_PERIOD_NUMBER_CANCELLED_CURRENCY_SQL');
      if(narrow)httpRequests.push({name:'get_invoices',args,result:got});
      const count=(await sql(`SELECT COUNT(*) N,COUNT(DISTINCT NRO_FACTURA) I FROM VW_BOT_FACTURAS WHERE ${where}`,b))[0];
      const detail=await tool('get_invoices',{...args,mode:'detail',rows:pageRows});
      check(detail.totalRows===count.N&&detail.totalInvoices===count.I&&detail.hasMore===(count.N>pageRows),'INVOICE_DETAIL_SQL_COUNTS');
    }
    report.limitations.push('INVOICE_PLATE_AND_ALL_PAGES_NOT_PART_OF_THIS_CONTRAST');
  });

  await run('CONTRACT_CONCEPTS_LATEST_INVOICE_COST',async()=>{
    const candidates=await sql("SELECT A.COD_CLIENTE C,A.TIP_CONTRATO T,A.SER_CONTRATO S,A.NRO_CONTRATO N,A.NRO_LOCAL L,A.TOTAL_SUP_LOCAL Q,A.FEC_CONTRATO F FROM VW_BOT_CONTRATOS_LOCALES A WHERE A.TIP_CONTRATO='CNT' AND A.ESTADO='A' AND A.TOTAL_SUP_LOCAL>0 AND EXISTS(SELECT 1 FROM VW_BOT_CONTRATOS_CONCEPTOS K WHERE K.TIP_CONTRATO=A.TIP_CONTRATO AND K.SER_CONTRATO=A.SER_CONTRATO AND K.NRO_CONTRATO=A.NRO_CONTRATO) ORDER BY A.COD_CLIENTE,A.NRO_CONTRATO FETCH FIRST 10 ROWS ONLY");
    if(!candidates.length)missing('CONTRACT_COST_CANDIDATES_NOT_FOUND');
    let costChecked=false;
    for(const s of candidates){
      const b={t:s.T,s:s.S,n:s.N};
      const concepts=await sql('SELECT COD_CONCEPTO K,MONTO_GASTO A,FEC_DESDE F,SIGLAS_MONEDA_FACTURA I,SIGLAS_MONEDA_CONTRATO C FROM VW_BOT_CONTRATOS_CONCEPTOS WHERE TIP_CONTRATO=:t AND SER_CONTRATO=:s AND NRO_CONTRATO=:n',b);
      const bills=await sql("SELECT COD_CONCEPTO K,FECHA_EMISION D,NRO_FACTURA N,IMPORTE A,IVA V,SIMBOLO_MONEDA S FROM VW_BOT_FACTURAS WHERE COD_CLIENTE=:c AND NVL(ANULADO,'N')<>'S' AND NVL(USER_CAN_CONSULT,'S')<>'N' ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC",{c:str(s.C)});
      const args={customerId:str(s.C),contractType:s.T,contractSeries:s.S,contractNumber:Number(s.N),localNumber:str(s.L)};
      const got=await tool('get_contract_conditions',args);
      check(got.status==='RESOLVED'&&near(got.contract.totalLocalArea,s.Q)&&got.concepts.length===concepts.length,'CONTRACT_IDENTITY_AREA_CONCEPT_COUNT_SQL');
      for(const c of concepts){
        const g=got.concepts.find(g=>str(g.conceptCode)===str(c.K));
        check(Boolean(g)&&g.configuredAmount===(c.A==null?null:Number(c.A)),'CONTRACT_CONFIGURED_CONCEPT_AMOUNT_SQL');
        const b=bills.find(b=>str(b.K)===str(c.K));
        const applicable=b&&b.D&&+new Date(b.D)>=Math.max(s.F?+new Date(s.F):-Infinity,c.F?+new Date(c.F):-Infinity);
        if(!applicable){check(g.lastBilled===null,'CONTRACT_NO_APPLICABLE_BILL_SQL');continue;}
        const ties=bills.filter(x=>str(x.K)===str(c.K)&&+new Date(x.D)===+new Date(b.D)&&str(x.N)===str(b.N));
        check(new Set(ties.map(x=>key(x.A,x.V,x.S))).size<=1,'CONTRACT_LAST_INVOICE_NOT_ARBITRARY_AMONG_TIES');
        check(g.lastBilled&&near(g.lastBilled.amountExcludingTax,Number(b.A??0)-Number(b.V??0))&&near(g.lastBilled.amountIncludingTax,b.A??0)&&near(g.lastBilled.taxAmount,b.V??0)&&str(g.lastBilled.invoiceNumber)===str(b.N),'CONTRACT_LATEST_BILL_VALIDITY_NET_TAX_SQL');
        const currency=c.I??c.C??b.S;
        const target=['PYG','GS','GS.','₲'].includes(str(currency)?.trim().toUpperCase())?'PYG':['USD','US$'].includes(str(currency)?.trim().toUpperCase())?'USD':null;
        if(!costChecked&&target&&b.A!==null){
          const cost=await tool('get_contract_cost_per_sqm',{...args,conceptCode:str(c.K),targetCurrency:target});
          const amount=Number(b.A)-Number(b.V??0);
          check(cost.status==='OK'&&near(cost.sourceAmountExcludingTax,amount)&&near(cost.squareMeters,s.Q)&&near(cost.costPerSqm,amount/Number(s.Q))&&cost.sourceCurrency.code===target&&cost.targetCurrency.code===target&&cost.exchangeRate===null,'CONTRACT_COST_PER_SQM_INDEPENDENT_NET_AMOUNT_AREA');
          costChecked=true;
          httpRequests.push({name:'get_contract_conditions',args,result:got});
          httpRequests.push({name:'get_contract_cost_per_sqm',args:{...args,conceptCode:str(c.K),targetCurrency:target},result:cost});
        }
      }
      if(costChecked)break;
    }
    if(!costChecked)missing('CONTRACT_POSITIVE_SAME_CURRENCY_COST_NOT_FOUND_IN_BOUNDED_COHORT');
    report.limitations.push('CONTRACT_CROSS_CURRENCY_RATE_NOT_IN_THIS_CONTRAST');
  });

  await run('COMPARISON_DOLLAR_COLLISION_ORACLE_CTE',async()=>{
    const {compareMemberPurchasesVsSales}=await import('../src/services/members/memberPurchasesVsSales.service.js');
    await withOracleProxySession(sessionId,async({connection})=>{
      for(const reverse of [false,true]){
        const base="SELECT 'DOLARES AMERICANOS' D,'$' S,100 A,20 P FROM DUAL UNION ALL SELECT 'DOLARES CANADIENSES','$',400,40 FROM DUAL UNION ALL SELECT CAST(NULL AS VARCHAR2(50)),'$',100,7 FROM DUAL";
        const sales=(await connection.execute(`SELECT D CURRENCY_DESCRIPTION,S CURRENCY_SYMBOL,A SALES_AMOUNT FROM (${base}) ORDER BY P ${reverse?'DESC':'ASC'}`,{},{outFormat:4002})).rows;
        const purchases=(await connection.execute(`SELECT D CURRENCY_DESCRIPTION,S CURRENCY_SYMBOL,P EXCHANGE_AMOUNT,1 INVOICE_COUNT,1 MEMBER_COUNT FROM (${base}) ORDER BY P ${reverse?'DESC':'ASC'}`,{},{outFormat:4002})).rows;
        // SQL inputs are controlled Oracle CTE data, never described as a real
        // member with several currencies. The service/SQL seam is explicit.
        const got=await compareMemberPurchasesVsSales(historical,{execute:async text=>({rows:text.includes('VW_BOT_VENTAS_LOCALES')?sales:purchases})});
        check(got.results.length===3&&got.results.find(r=>r.currency.description==='DOLARES AMERICANOS')?.percentage===20&&got.results.find(r=>r.currency.description==='DOLARES CANADIENSES')?.percentage===10&&got.results.find(r=>r.currency.description===null)?.percentage===null,'CONTROLLED_ORACLE_DOLLAR_GROUPS_BOTH_ORDERS');
      }
    });
  });
  await run('AFFECTED_AND_MISSING_POSITIVE_HTTP',async()=>{
    budget();
    const {contrastPreparedHttp}=await import('./backend-independent-http.mjs');
    await contrastPreparedHttp({sessionId,requests:httpRequests,executeTool,check});
    check(httpRequests.length===4,'FOUR_ORACLE_CONTRASTED_POSITIVE_HTTP_PROFILES');
  });
  report.coverageComplete=report.cases.every(c=>c.status==='passed');
  report.success=report.cases.every(c=>['passed','sample_missing'].includes(c.status))&&report.checks.every(c=>c.passed);
}catch(e){report.error={code:safeCode(e)};}
finally{sessionId=null;report.checks.push({code:'ALL_ORACLE_CONNECTIONS_CLOSED',passed:opened===closed&&closeErrors===0});if(opened!==closed||closeErrors)report.success=false;}
report.limitations=[...new Set(report.limitations)];
report.finishedAt=new Date().toISOString();
// Allowlisted metadata only; never serialize caught errors, arguments or rows.
emit(JSON.stringify(report));process.exit(report.success?0:1);
