// Read-only pending variants only. No credentials, identities or business rows in output.
import {near,multisetEqual,relativeBounds,validPage,invoiceTuple,invoiceSummaryRows,safeTechnicalCode,day} from './backend-pending-variant-controls.mjs';
import {sameSolesType} from './backend-independent-control-values.mjs';
const emit=process.stdout.write.bind(process.stdout);
for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'backend-pending-variants-dev',commit:process.argv[2],startedAt:new Date().toISOString(),success:false,checks:[],cases:[],limitations:[],scope:'pending independent Oracle contrasts; dispatcher real; no full suites, frontend or data mutations'};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CONTROL_FAILED');};
const missing=code=>{throw Object.assign(Error(),{missing:code});};
const str=v=>v==null?null:String(v);
const {default:config}=await import('../config.js');
const {withOracleProxySession,getValidOracleSession}=await import('../src/services/sessions/oracleSession.service.js');
const {executeTool}=await import('../src/services/ai/toolExecutor.service.js');
const {default:driver}=await import('oracledb');
const connect=driver.getConnection.bind(driver);let sessionId,opened=0,closed=0,closeErrors=0,operation='PREFLIGHT';
driver.getConnection=async(...args)=>{const c=await connect(...args);opened++;c.callTimeout=60000;const close=c.close.bind(c);let done=false;c.close=async()=>{try{await close();if(!done){closed++;done=true;}}catch(e){closeErrors++;throw e;}};return c;};
const deadline=Date.now()+8*60*1000;
const budget=()=>{if(Date.now()>deadline)throw Object.assign(Error(),{blocked:'EIGHT_MINUTE_BUDGET_EXHAUSTED'});};
const query=(sql,binds={})=>withOracleProxySession(sessionId,async({connection})=>{budget();if(!/^\s*(SELECT|WITH)\b/i.test(sql))throw Error();const r=(await connection.execute(sql,binds,{outFormat:4002,maxRows:10001})).rows;if(r.length>10000)throw Object.assign(Error(),{blocked:'CONTROL_ROW_LIMIT_EXCEEDED'});return r;});
const tool=(name,args)=>{budget();return executeTool({name,arguments:args,context:{sessionId}});};
const summaryOnly=process.argv.includes('--invoice-summary-only');
report.stage=summaryOnly?'invoice-summary-only':'initial';
async function run(code,fn){if(summaryOnly&&code!=='INVOICE_PLATE_COMPLETE_BOUNDED_TRAVERSAL')return;operation='DISCOVERY';const t=Date.now();try{await fn();report.cases.push({code:summaryOnly?'INVOICE_PLATE_CURRENCY_SUMMARY':code,status:'passed',durationMs:Date.now()-t});}catch(e){const reason=e.missing??e.blocked??safeTechnicalCode(e);report.cases.push({code:summaryOnly?'INVOICE_PLATE_CURRENCY_SUMMARY':code,status:e.missing?'sample_missing':e.blocked?'not_run':'failed',reason,operation,durationMs:Date.now()-t});if(e.missing||e.blocked)report.limitations.push(reason);}check(opened===closed&&!closeErrors,'ORACLE_CONNECTIONS_CLOSED_AFTER_CASE');}
try{
 check(/^[a-f0-9]{40}$/.test(report.commit??''),'SOURCE_COMMIT_PRESENT');
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'DEV_SAFE_CONFIGURATION');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({preflight:true,success:true}));process.exit(0);}
 let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error();}sessionId=JSON.parse(input).sessionId;input='';
 if(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/i.test(sessionId))throw Error();
 const valid=await getValidOracleSession(sessionId);
 await withOracleProxySession(sessionId,async({connection})=>{const r=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{},{outFormat:4002})).rows[0];check(str(r.U).toUpperCase()===valid.username&&Boolean(r.P),'SESSION_RESOLVES_TO_ORACLE_PROXY');});

 await run('MEMBER_VEHICLE_PLATE_UNIQUE_ABSENT',async()=>{
  const s=(await query("SELECT UPPER(TRIM(MATRICULA)) P FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND MATRICULA IS NOT NULL AND NOT REGEXP_LIKE(TRIM(MATRICULA),'[[:space:]]') GROUP BY UPPER(TRIM(MATRICULA)) HAVING COUNT(*)=1 AND COUNT(COD_SOCIO)=1 FETCH FIRST 1 ROWS ONLY"))[0];
  if(!s)missing('UNIQUE_ACTIVE_PLATE_NOT_FOUND');
  const r=(await query("SELECT COD_SOCIO D,MARCA B,MODELO M,COLOR C,DEBITO_AUTOMATICO A,TO_CHAR(FECHA_ALTA,'DD/MM/YYYY') F FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND UPPER(TRIM(MATRICULA))=:p",{p:s.P}))[0];
  operation='PLATE_UNIQUE_DISPATCH';const got=await tool('get_member_vehicles',{plate:' '+str(s.P).toLowerCase()+' '});
  check(got.status==='FOUND'&&got.owner.documentNumber===str(r.D)&&str(got.vehicle.plate).trim().toUpperCase()===s.P&&got.vehicle.brand===r.B&&got.vehicle.model===r.M&&got.vehicle.color===r.C&&got.vehicle.automaticDebit===(r.A==='S')&&got.vehicle.registrationDate===r.F,'PLATE_UNIQUE_OWNER_AND_VEHICLE_SQL');
  const absent='ZZZBACKENDABSENT999999';
  check(!(await query("SELECT MATRICULA FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND UPPER(TRIM(MATRICULA))=:p",{p:absent})).length,'PLATE_ABSENCE_CONFIRMED_SQL');
  const no=await tool('get_member_vehicles',{plate:absent});check(no.status==='NOT_FOUND'&&no.vehicles.length===0&&!no.owner,'PLATE_ABSENCE_NO_OWNER');
 });

 await run('INVOICE_PLATE_COMPLETE_BOUNDED_TRAVERSAL',async()=>{
  // A small complete cohort, not an artificial LIMIT applied to the expected result.
  const samples=await query("SELECT COD_CLIENTE C,TO_CHAR(TRUNC(FECHA_EMISION),'DD/MM/YYYY') D,REPLACE(REPLACE(UPPER(MATRICULA),'-',''),' ','') P FROM VW_BOT_FACTURAS WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND COD_CLIENTE IS NOT NULL AND FECHA_EMISION IS NOT NULL AND MATRICULA IS NOT NULL AND NOT REGEXP_LIKE(MATRICULA,'[%_]') GROUP BY COD_CLIENTE,TRUNC(FECHA_EMISION),REPLACE(REPLACE(UPPER(MATRICULA),'-',''),' ','') HAVING COUNT(*) BETWEEN 3 AND 20 FETCH FIRST 5 ROWS ONLY");
  if(!samples.length)missing('BOUNDED_INVOICE_PLATE_COHORT_NOT_FOUND');
  const s=samples[0],f=s.D,b={c:str(s.C),f,p:'%'+s.P+'%'};
  const where="NVL(USER_CAN_CONSULT,'S')<>'N' AND COD_CLIENTE=:c AND FECHA_EMISION>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA_EMISION<TO_DATE(:f,'DD/MM/YYYY')+1 AND REPLACE(REPLACE(UPPER(MATRICULA),'-',''),' ','') LIKE :p";
  if(!summaryOnly){
  const expected=await query(`SELECT NRO_FACTURA N,COD_CLIENTE C,COD_CONCEPTO K,SIMBOLO_MONEDA S,IMPORTE A,CANTIDAD Q,IVA V,MATRICULA P FROM VW_BOT_FACTURAS WHERE ${where}`,b);
  if(expected.length<3||expected.length>20)missing('INVOICE_PARTIAL_PLATE_COHORT_OUTSIDE_BUDGET');
  const counts=(await query(`SELECT COUNT(*) N,COUNT(DISTINCT NRO_FACTURA) I FROM VW_BOT_FACTURAS WHERE ${where}`,b))[0];
  const symbol=v=>['PYG','GS','GS.','GUARANI','GUARANIES'].includes(str(v)?.trim().toUpperCase())?'₲':v;
  const args={customerIds:[str(s.C)],dateFrom:f,dateTo:f,plate:str(s.P).toLowerCase().split('').join(' - ')};
  const size=Math.min(2,Number.isSafeInteger(Number(config.limitFilter))&&Number(config.limitFilter)>0?Number(config.limitFilter):2);
  const accumulated=[];operation='INVOICE_COMPLETE_PAGES';
  for(let page=1;page<=Math.ceil(counts.N/size)+1;page++){
   const p=await tool('get_invoices',{...args,mode:'detail',page,rows:size});
   check(validPage(p,page,size,counts.N,counts.I),'INVOICE_REAL_COUNT_NEXT_PAGE_AND_END');accumulated.push(...p.data);
  }
  check(multisetEqual(accumulated.map(invoiceTuple),expected.map(r=>[r.N,str(r.C),str(r.K),symbol(r.S),r.A,r.Q,r.V,r.P])),'INVOICE_COMPLETE_DETAIL_MULTISET_SQL');
  }
  operation='INVOICE_INDEPENDENT_CURRENCY_SUMMARY';
  const groups=await query(`SELECT SIMBOLO_MONEDA S,SUM(IMPORTE) A,COUNT(DISTINCT NRO_FACTURA) I FROM VW_BOT_FACTURAS WHERE ${where} GROUP BY SIMBOLO_MONEDA`,b);
  const symbol=v=>['PYG','GS','GS.','GUARANI','GUARANIES'].includes(str(v)?.trim().toUpperCase())?'₲':v;
  const args={customerIds:[str(s.C)],dateFrom:f,dateTo:f,plate:str(s.P).toLowerCase().split('').join(' - ')};
  const summary=invoiceSummaryRows(await tool('get_invoices',{...args,mode:'summary'}));
  check(summary.length===groups.length&&groups.every(r=>summary.some(g=>g.currencySymbol===symbol(r.S)&&(r.A==null?g.totalAmount==null:near(g.totalAmount,r.A))&&g.invoiceCount===r.I)),'INVOICE_PLATE_CURRENCY_TOTALS_DISTINCT_INVOICES_SQL');
 });

 await run('POSITIVE_SOLES_COMBINED_WINDOWS',async()=>{
  const s=(await query("SELECT COD_SOCIO D,TO_CHAR(FECHA_ALTA,'DD/MM/YYYY') G,TO_CHAR(VENCIMIENTO,'DD/MM/YYYY') E FROM VW_BOT_SOLES_GENERADOS WHERE COD_SOCIO IS NOT NULL AND COD_SOCIO=TRIM(COD_SOCIO) AND FECHA_ALTA IS NOT NULL AND VENCIMIENTO IS NOT NULL AND ROWNUM<=1"))[0];
  if(!s)missing('POSITIVE_CANONICAL_SOLES_COMBINED_WINDOW_NOT_FOUND');
  const next=new Date(Date.UTC(...s.E.split('/').reverse().map((x,i)=>Number(x)-(i===1?1:0))));next.setUTCDate(next.getUTCDate()+1);
  for(const [status,ref] of [['all',s.E],['current',s.E],['expired',day(next)]]){
   const b={d:str(s.D).trim(),g:s.G,e:s.E,...(status==='all'?{}:{ref})};
   const where="COD_SOCIO=:d AND FECHA_ALTA>=TO_DATE(:g,'DD/MM/YYYY') AND FECHA_ALTA<TO_DATE(:g,'DD/MM/YYYY')+1 AND VENCIMIENTO>=TO_DATE(:e,'DD/MM/YYYY') AND VENCIMIENTO<TO_DATE(:e,'DD/MM/YYYY')+1"+(status==='all'?'':status==='current'?" AND VENCIMIENTO>=TO_DATE(:ref,'DD/MM/YYYY')":" AND VENCIMIENTO<TO_DATE(:ref,'DD/MM/YYYY')");
   const expected=await query(`SELECT COD_TIPO_SOL T,COUNT(*) N,SUM(NVL(TOTAL,0)) G,SUM(NVL(SALDO,0)) B FROM VW_BOT_SOLES_GENERADOS WHERE ${where} GROUP BY COD_TIPO_SOL`,b);
   operation='SOLES_POSITIVE_WINDOW_DISPATCH';
   const got=await tool('get_member_soles',{documentNumber:b.d,status,referenceDate:ref,useCurrentGenerationPeriod:false,generationDateFrom:s.G,generationDateTo:s.G,expirationDateFrom:s.E,expirationDateTo:s.E});
   check(expected.length>0&&got.documentNumber===b.d&&got.data.length===expected.length&&expected.every(r=>got.data.some(g=>sameSolesType(g.typeId,r.T)&&g.recordCount===r.N&&near(g.generatedAmount,r.G)&&near(g.balance,r.B))),'SOLES_POSITIVE_COMBINED_WINDOWS_TYPES_BALANCES_SQL');
  }
 });

 await run('PROMOTION_TWO_DISTINCT_POSITIVE_MEMBERS',async()=>{
  const first=(await query("SELECT COD_SOCIO D FROM VW_BOT_FACTURAS_PROMO WHERE COD_SOCIO IS NOT NULL AND COD_SOCIO=TRIM(COD_SOCIO) AND FECHA_COMPRA IS NOT NULL AND ROWNUM<=1"))[0];
  if(!first)missing('POSITIVE_PROMOTION_MEMBER_NOT_FOUND');
  const second=(await query("SELECT COD_SOCIO D FROM VW_BOT_FACTURAS_PROMO WHERE COD_SOCIO IS NOT NULL AND COD_SOCIO=TRIM(COD_SOCIO) AND COD_SOCIO<>:d AND FECHA_COMPRA IS NOT NULL AND ROWNUM<=1",{d:str(first.D)}))[0];
  if(!second)missing('SECOND_POSITIVE_PROMOTION_MEMBER_NOT_FOUND');
  check(str(first.D)!==str(second.D),'PROMOTION_MEMBERS_DISTINCT');
  for(const member of [first,second]){
   const d=str(member.D),date=(await query("SELECT TO_CHAR(FECHA_COMPRA,'DD/MM/YYYY') F FROM VW_BOT_FACTURAS_PROMO WHERE COD_SOCIO=:d AND FECHA_COMPRA IS NOT NULL AND ROWNUM<=1",{d}))[0].F;
   const rows=await query("SELECT MONEDA M,SIMBOLO_MONEDA S,COUNT(*) N,CASE WHEN COUNT(MONTO)=COUNT(*) THEN SUM(MONTO) END A FROM VW_BOT_FACTURAS_PROMO WHERE COD_SOCIO=:d AND FECHA_COMPRA>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA_COMPRA<TO_DATE(:f,'DD/MM/YYYY')+1 GROUP BY MONEDA,SIMBOLO_MONEDA",{d,f:date});
   operation='SECOND_MEMBER_PROMOTION_DISPATCH';const got=await tool('get_member_promo_purchases',{documentNumber:d,dateFrom:date,dateTo:date});
   check(got.status==='OK'&&got.documentNumber===d&&got.data.length===rows.length&&rows.every(r=>got.data.some(g=>g.currency.description===r.M&&g.currency.symbol===r.S&&g.purchaseCount===r.N&&(g.currency.code&&r.A!=null?near(g.totalAmount,r.A):g.totalAmount===null&&Boolean(g.reason)))),'PROMOTION_MEMBER_RAW_CURRENCY_COUNTS_AMOUNTS_SQL');
  }
 });

 await run('VEHICLE_RELATIVE_PERIOD_BOUNDARIES',async()=>{
  for(const relativePeriod of ['today','yesterday','thisWeek','thisMonth','thisYear']){
   const bounds=relativeBounds(relativePeriod);
   const expected=(await query("SELECT COUNT(*) N,COUNT(DISTINCT UPPER(TRIM(MATRICULA))) P,COUNT(DISTINCT COD_SOCIO) M FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND FECHA_ALTA>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA_ALTA<TO_DATE(:t,'DD/MM/YYYY')+1",{f:bounds.dateFrom,t:bounds.dateTo}))[0];
   operation='RELATIVE_PERIOD_DISPATCH';const got=await tool('get_vehicle_registrations',{relativePeriod});
   const after=relativeBounds(relativePeriod);if(JSON.stringify(bounds)!==JSON.stringify(after))missing('RELATIVE_PERIOD_CROSSED_LOCAL_MIDNIGHT');
   check(got.queryContext.dateFrom===bounds.dateFrom&&got.queryContext.dateTo===bounds.dateTo&&got.queryContext.timezone==='America/Asuncion','VEHICLE_RELATIVE_LOCAL_BOUNDARIES');
   check(got.totals.vehicleCount===expected.N&&got.totals.plateCount===expected.P&&got.totals.memberCount===expected.M,'VEHICLE_RELATIVE_GLOBAL_DISTINCTS_SQL');
   if(expected.N===0)report.limitations.push('RELATIVE_'+relativePeriod.toUpperCase()+'_EMPTY_REAL_RANGE');
  }
 });

 await run('CONTRACT_CONDITIONS_ABSENCE',async()=>{
  const d='999999999999999999999999999999';
  check(!(await query('SELECT COD_CLIENTE FROM VW_BOT_CONTRATOS_LOCALES WHERE COD_CLIENTE=:d',{d})).length,'CONTRACT_ABSENCE_CONFIRMED_SQL');
  const got=await tool('get_contract_conditions',{customerId:d});check(got.status==='NOT_FOUND'&&!got.contract&&!got.concepts,'CONTRACT_ABSENCE_NO_AMOUNTS');
 });
 await run('CONTRACT_CONDITIONS_REAL_AMBIGUITY',async()=>{
  const s=(await query("SELECT COD_CLIENTE C FROM VW_BOT_CONTRATOS_LOCALES WHERE TIP_CONTRATO='CNT' AND ESTADO='A' GROUP BY COD_CLIENTE HAVING COUNT(*)>1 AND COUNT(*)<=20 FETCH FIRST 1 ROWS ONLY"))[0];
  if(!s)missing('REAL_ACTIVE_AMBIGUOUS_CONTRACT_COHORT_NOT_FOUND');
  const expected=await query("SELECT TIP_CONTRATO T,SER_CONTRATO S,NRO_CONTRATO N,NRO_LOCAL L FROM VW_BOT_CONTRATOS_LOCALES WHERE COD_CLIENTE=:c AND TIP_CONTRATO='CNT' AND ESTADO='A'",{c:str(s.C)});
  const got=await tool('get_contract_conditions',{customerId:str(s.C)});
  check(got.status==='AMBIGUOUS'&&!got.contract&&!got.concepts&&multisetEqual(got.contracts.map(r=>[r.contract.type,r.contract.series,Number(r.contract.number),str(r.localNumber)]),expected.map(r=>[r.T,r.S,Number(r.N),str(r.L)])),'CONTRACT_AMBIGUITY_ALL_OPTIONS_NO_ARBITRARY_SELECTION');
 });

 await run('CONTRACT_COST_REAL_CROSS_CURRENCY',async()=>{
  const pool=await query("SELECT COD_CLIENTE C,TIP_CONTRATO T,SER_CONTRATO S,NRO_CONTRATO N,NRO_LOCAL L,TOTAL_SUP_LOCAL Q,FEC_CONTRATO F FROM VW_BOT_CONTRATOS_LOCALES WHERE TIP_CONTRATO='CNT' AND ESTADO='A' AND TOTAL_SUP_LOCAL>0 ORDER BY COD_CLIENTE,NRO_CONTRATO FETCH FIRST 10 ROWS ONLY");
  let selected;
  for(const s of pool){
   const concepts=await query('SELECT COD_CONCEPTO K,SIGLAS_MONEDA_FACTURA I,SIGLAS_MONEDA_CONTRATO C,FEC_DESDE F FROM VW_BOT_CONTRATOS_CONCEPTOS WHERE TIP_CONTRATO=:t AND SER_CONTRATO=:s AND NRO_CONTRATO=:n',{t:s.T,s:s.S,n:s.N});
   const bills=await query("SELECT COD_CONCEPTO K,FECHA_EMISION D,NRO_FACTURA N,IMPORTE A,IVA V FROM VW_BOT_FACTURAS WHERE COD_CLIENTE=:c AND NVL(ANULADO,'N')<>'S' AND NVL(USER_CAN_CONSULT,'S')<>'N' ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC",{c:str(s.C)});
   for(const c of concepts){
    const code=str(c.I??c.C)?.trim().toUpperCase();if(!['PYG','USD'].includes(code))continue;
    const b=bills.find(b=>str(b.K)===str(c.K));if(!b||b.A==null||+new Date(b.D)<Math.max(s.F?+new Date(s.F):-Infinity,c.F?+new Date(c.F):-Infinity))continue;
    const ties=bills.filter(x=>str(x.K)===str(c.K)&&+new Date(x.D)===+new Date(b.D)&&str(x.N)===str(b.N));
    if(new Set(ties.map(x=>JSON.stringify([x.A,x.V]))).size!==1)continue;
    selected={s,c,b,code};break;
   }
   if(selected)break;
  }
  if(!selected)missing('CROSS_CURRENCY_CONTRACT_NOT_FOUND_IN_TEN_CANDIDATES');
  const {s,c,b,code}=selected;
  // Forward the actual provider response unchanged, retaining only its public
  // HTML in memory for a second parser. No rate is invented or written to output.
  const originalFetch=globalThis.fetch;let html,providerCalled=false;
  globalThis.fetch=async(url,options)=>{if(String(url)!=='https://www.maxicambios.com.py/')throw Error();providerCalled=true;const response=await originalFetch(url,options);html=await response.clone().text();return response;};
  operation='LIVE_PUBLIC_EXCHANGE_PROVIDER';let got;
  try{got=await tool('get_contract_cost_per_sqm',{customerId:str(s.C),contractType:s.T,contractSeries:s.S,contractNumber:Number(s.N),localNumber:str(s.L),conceptCode:str(c.K),targetCurrency:code==='PYG'?'USD':'PYG'});}finally{globalThis.fetch=originalFetch;}
  operation='CROSS_CURRENCY_INDEPENDENT_RATE_AND_ARITHMETIC';
  const words=String(html??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').trim().split(/\s+/);
  const i=words.findIndex((w,i)=>w.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()==='DOLAR'&&words[i+1]?.toUpperCase()==='COMPRA'&&words[i+3]?.toUpperCase()==='VENTA');
  const raw=words[i+4],rate=i>=0&&/^\d{1,3}(\.\d{3})+$/.test(raw)?Number(raw.split('.').join('')):i>=0&&/^\d+(,\d+)?$/.test(raw)?Number(raw.replace(',','.')):NaN;
  const amount=Number(b.A)-Number(b.V??0),factor=code==='PYG'?1/rate:rate;
  check(providerCalled&&Number.isFinite(rate)&&rate>0&&got.exchangeRate?.source==='Maxicambios'&&near(got.exchangeRate.sellRate,rate),'COST_REAL_PROVIDER_RATE_INDEPENDENT_PARSE');
  check(got.status==='OK'&&got.sourceCurrency.code===code&&got.targetCurrency.code===(code==='PYG'?'USD':'PYG')&&near(got.sourceAmountExcludingTax,amount)&&near(got.squareMeters,s.Q)&&near(got.targetAmountExcludingTax,amount*factor)&&near(got.costPerSqm,amount*factor/Number(s.Q)),'COST_REAL_ORACLE_NET_AREA_AND_CROSS_CURRENCY');
 });
 report.coverageComplete=report.cases.every(r=>r.status==='passed');
 report.success=report.cases.every(r=>['passed','sample_missing'].includes(r.status))&&report.checks.every(r=>r.passed);
}catch(e){report.error={code:safeTechnicalCode(e)};}
finally{sessionId=null;report.checks.push({code:'ALL_ORACLE_CONNECTIONS_CLOSED',passed:opened===closed&&!closeErrors});if(opened!==closed||closeErrors)report.success=false;}
report.finishedAt=new Date().toISOString();report.limitations=[...new Set(report.limitations)];emit(JSON.stringify(report));process.exitCode=report.success?0:1;
