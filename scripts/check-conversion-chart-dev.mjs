// Read-only pending variants only. No credentials, identities or business rows in output.
import {near,multisetEqual,relativeBounds,validPage,invoiceTuple,invoiceSummaryRows,safeTechnicalCode,day} from './backend-pending-variant-controls.mjs';
import {sameSolesType} from './backend-independent-control-values.mjs';
const emit=process.stdout.write.bind(process.stdout);
for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'conversion-chart-dev',commit:process.argv[2],startedAt:new Date().toISOString(),success:false,checks:[],cases:[],limitations:[],scope:'Oracle inputs plus explicitly controlled provider for cost; three chart HTTP variants compared with real source; live provider reported separately'};
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
const chartAssociationOnly=process.argv.includes('--chart-association-only');
report.stage=chartAssociationOnly?'chart-association-only':'initial';
async function run(code,fn){if(chartAssociationOnly&&code!=='CHART_HTTP_THREE_VARIANTS_REAL_ORACLE_SOURCE')return;operation='DISCOVERY';const start=Date.now();try{await fn();report.cases.push({code,status:'passed',durationMs:Date.now()-start});}catch(e){report.cases.push({code,status:e.missing?'sample_missing':'failed',reason:e.missing??safeTechnicalCode(e),operation,durationMs:Date.now()-start});}check(opened===closed&&!closeErrors,'ORACLE_CONNECTIONS_CLOSED_AFTER_CASE');}
let costArgs;
try{
 check(/^[a-f0-9]{40}$/.test(report.commit??''),'SOURCE_COMMIT_PRESENT');
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'DEV_SAFE_CONFIGURATION');
 await import('./chart-http-variant-controls.mjs');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({success:true,preflight:true}));process.exit(0);}
 let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error();}sessionId=JSON.parse(input).sessionId;input='';
 if(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/i.test(sessionId))throw Error();
 const valid=await getValidOracleSession(sessionId);await withOracleProxySession(sessionId,async({connection})=>{const r=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{},{outFormat:4002})).rows[0];check(str(r.U).toUpperCase()===valid.username&&Boolean(r.P),'SESSION_PROXY_IDENTITY_MATCHES');});
 await run('COST_ORACLE_NET_AREA_CONTROLLED_PROVIDER',async()=>{
  const pool=await query("SELECT COD_CLIENTE C,TIP_CONTRATO T,SER_CONTRATO S,NRO_CONTRATO N,NRO_LOCAL L,TOTAL_SUP_LOCAL Q,FEC_CONTRATO F FROM VW_BOT_CONTRATOS_LOCALES WHERE TIP_CONTRATO='CNT' AND ESTADO='A' AND TOTAL_SUP_LOCAL>0 ORDER BY COD_CLIENTE,NRO_CONTRATO FETCH FIRST 10 ROWS ONLY");
  let chosen;
  for(const s of pool){
   const concepts=await query('SELECT COD_CONCEPTO K,SIGLAS_MONEDA_FACTURA I,FEC_DESDE F FROM VW_BOT_CONTRATOS_CONCEPTOS WHERE TIP_CONTRATO=:t AND SER_CONTRATO=:s AND NRO_CONTRATO=:n',{t:s.T,s:s.S,n:s.N});
   const bills=await query("SELECT COD_CONCEPTO K,FECHA_EMISION D,NRO_FACTURA N,IMPORTE A,IVA V,SIMBOLO_MONEDA S FROM VW_BOT_FACTURAS WHERE COD_CLIENTE=:c AND NVL(ANULADO,'N')<>'S' AND NVL(USER_CAN_CONSULT,'S')<>'N' ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC",{c:str(s.C)});
   for(const c of concepts){
    const code=str(c.I)?.trim().toUpperCase();if(!['PYG','USD'].includes(code))continue;
    const b=bills.find(x=>str(x.K)===str(c.K));if(!b||b.A==null||+new Date(b.D)<Math.max(s.F?+new Date(s.F):-Infinity,c.F?+new Date(c.F):-Infinity))continue;
    const ties=bills.filter(x=>str(x.K)===str(c.K)&&+new Date(x.D)===+new Date(b.D)&&str(x.N)===str(b.N));if(new Set(ties.map(x=>JSON.stringify([x.A,x.V,x.S]))).size!==1)continue;
    chosen={s,c,b,code};break;
   }if(chosen)break;
  }
  if(!chosen)missing('RECOGNIZED_CROSS_CURRENCY_CONTRACT_NOT_FOUND_IN_TEN');
  const {s,c,b,code}=chosen;
  costArgs={customerId:str(s.C),contractType:s.T,contractSeries:s.S,contractNumber:Number(s.N),localNumber:str(s.L),conceptCode:str(c.K),targetCurrency:code==='PYG'?'USD':'PYG'};
  const original=globalThis.fetch;globalThis.fetch=async(url)=>{if(String(url)!=='https://www.maxicambios.com.py/')throw Error();return {ok:true,text:async()=>'<p>Dólar Compra 7.000 Venta 7.100</p>'};};
  let got;const before=Date.now();operation='REAL_ORACLE_WITH_CONTROLLED_PROVIDER';try{got=await tool('get_contract_cost_per_sqm',costArgs);}finally{globalThis.fetch=original;}
  const amount=Number(b.A)-Number(b.V??0),factor=code==='PYG'?1/7100:7100;
  check(got.status==='OK'&&got.sourceCurrency.code===code&&got.targetCurrency.code===costArgs.targetCurrency&&near(got.sourceAmountExcludingTax,amount)&&near(got.squareMeters,s.Q)&&near(got.targetAmountExcludingTax,amount*factor)&&near(got.costPerSqm,amount*factor/Number(s.Q)),'COST_ORACLE_NET_AREA_AND_CONTROLLED_FX_ARITHMETIC');
  check(got.exchangeRate.sellRate===7100&&got.exchangeRate.currentRate===true&&got.exchangeRate.quotedAt===null&&Date.parse(got.exchangeRate.retrievedAt)>=before&&Date.parse(got.exchangeRate.retrievedAt)<=Date.now()&&got.exchangeRate.dateBasis==='CURRENT_QUOTE_AT_RETRIEVAL_NOT_HISTORICAL','COST_APPLIED_RATE_RETRIEVAL_DATE_NOT_INVOICE_DATE');
 });
 await run('COST_PROVIDER_FAILURE_REAL_ORACLE',async()=>{
  if(!costArgs)missing('COST_FAILURE_PROFILE_UNAVAILABLE');const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('CONTROLLED_TRANSPORT_PRIVATE');};let error;
  operation='REAL_ORACLE_CONTROLLED_PROVIDER_FAILURE';try{await tool('get_contract_cost_per_sqm',costArgs);}catch(e){error=e;}finally{globalThis.fetch=original;}
  check(error?.code==='EXCHANGE_PROVIDER_NETWORK'&&!error.cause&&!error.message.includes('CONTROLLED_TRANSPORT_PRIVATE'),'COST_NO_FALLBACK_ON_PROVIDER_FAILURE_SAFE_ERROR');
 });
 await run('CHART_HTTP_THREE_VARIANTS_REAL_ORACLE_SOURCE',async()=>{
  const s=(await query("SELECT COD_CLIENTE C,COD_RUBRO R FROM VW_BOT_COMPRAS_SOCIO WHERE FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_CLIENTE IS NOT NULL AND COD_RUBRO IS NOT NULL GROUP BY COD_CLIENTE,COD_RUBRO ORDER BY COD_CLIENTE,COD_RUBRO FETCH FIRST 1 ROWS ONLY"))[0];
  if(!s)missing('PREVIOUSLY_VALIDATED_CHART_SOURCE_PROFILE_UNAVAILABLE');
  const args={dateFrom:'01/01/2023',dateTo:'31/05/2023',customerIds:[str(s.C)],categoryIds:[str(s.R)],breakdownBy:['month']};
  operation='REAL_APPROVED_PROFILE_SOURCE_ONCE';const result=await tool('compare_member_purchases_vs_sales',args);
  if(result.status!=='FOUND'||!result.results.length||result.results.length>8||result.results.some(r=>r.currency.code!=='PYG'||r.auditedSalesAmount<0))missing('BOUNDED_POSITIVE_SINGLE_PYG_CHART_SOURCE_UNAVAILABLE');
  check(result.results.some(r=>r.auditedSalesAmount>0),'CHART_ORACLE_SOURCE_POSITIVE_PYG');
  operation='THREE_HTTP_CHARTS_VERSUS_REAL_SOURCE';const {contrastChartHttp}=await import('./chart-http-variant-controls.mjs');
  await contrastChartHttp({sessionId,sourceName:'compare_member_purchases_vs_sales',sourceResult:result,sourceArgs:args,check,dataPath:'results',labelPath:'dimensions.0.name',amountPath:'auditedSalesAmount',secondPath:'exchangeAmount'});
 });
 report.success=report.cases.every(c=>['passed','sample_missing'].includes(c.status))&&report.checks.every(c=>c.passed);
 report.coverageComplete=report.cases.every(c=>c.status==='passed');
}catch(e){report.error={code:safeTechnicalCode(e)};}
finally{sessionId=null;report.checks.push({code:'ALL_ORACLE_CONNECTIONS_CLOSED',passed:opened===closed&&!closeErrors});if(opened!==closed||closeErrors)report.success=false;}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
