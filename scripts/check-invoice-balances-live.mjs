import fs from 'node:fs';import config from '/app/config.js';import driver from '/app/node_modules/oracledb/index.js';
import {withOracleProxySession,getValidOracleSession} from '/app/src/services/sessions/oracleSession.service.js';
import {closeOracleSessionsPool} from '/app/src/database/oracleSessions.database.js';
import {openInspector,verifyLoadedSource} from './inspector.mjs';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','error','warn','debug','info','trace','dir','table'])console[k]=()=>{};
const report={suite:'invoice-balances-live-5400',commit:process.argv[2],success:false,checks:[],startedAt:new Date().toISOString(),providerCalls:0};
const check=(ok,code)=>{report.checks.push({code,passed:!!ok});if(!ok)throw Error(code);};
let inspector,installed=false,sessionId,opened=0,closed=0,errors=0;
const original=driver.getConnection;driver.getConnection=async(...a)=>{const c=await original.apply(driver,a);opened++;c.callTimeout=60000;const close=c.close.bind(c);c.close=async()=>{try{const r=await close();closed++;return r;}catch(e){errors++;throw e;}};return c;};
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'SAFE_DEV');
 inspector=await openInspector();report.loadedModules=await verifyLoadedSource(inspector,JSON.parse(fs.readFileSync(new URL('./expected.json',import.meta.url))));
 check(await inspector.evaluate("typeof process.getBuiltinModule('module').createRequire('/app/index.js')('/tmp/invoice-balances-live/runtime.mjs').install==='function'"),'RUNTIME_MODULE_AVAILABLE');
 if(!process.argv.includes('--preflight')){
  let raw='';for await(const c of process.stdin){raw+=c;if(raw.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(raw).sessionId;raw='';
  const owned=await getValidOracleSession(sessionId);
  installed=await inspector.evaluate(`process.getBuiltinModule('module').createRequire('/app/index.js')('/tmp/invoice-balances-live/runtime.mjs').install(${JSON.stringify(sessionId)})`);
  await withOracleProxySession(sessionId,async({connection})=>{
   const run=async(sql,binds={})=>(await connection.execute(sql,binds,{outFormat:4002,maxRows:30,fetchInfo:{DEUDA:{type:driver.STRING}}})).rows;
   const id=(await run("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL"))[0];check(String(id.U).toUpperCase()===String(owned.username).toUpperCase()&&!!id.P,'POSTGRES_ORACLE_PROXY_IDENTITY');
   const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Asuncion',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date()),part=t=>parts.find(x=>x.type===t).value,asOfDate=part('day')+'/'+part('month')+'/'+part('year');report.reference={asOfDate,timezone:'America/Asuncion'};
   const base="WITH e AS (SELECT * FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA>=0 OR DEUDA IS NULL), i AS (SELECT SERIE_FACTURA,NRO_FACTURA,COUNT(*) N FROM e GROUP BY SERIE_FACTURA,NRO_FACTURA) ";
   const clean=await run(base+"SELECT e.* FROM e JOIN i ON i.SERIE_FACTURA=e.SERIE_FACTURA AND i.NRO_FACTURA=e.NRO_FACTURA WHERE i.N=1 AND e.DEUDA>0 AND TRIM(e.SERIE_FACTURA) IS NOT NULL AND TRIM(e.NRO_FACTURA) IS NOT NULL AND TRIM(e.COD_MONEDA) IS NOT NULL AND ROWNUM<=6");
   const dup=await run(base+"SELECT i.SERIE_FACTURA,i.NRO_FACTURA FROM i WHERE i.N>1 AND TRIM(i.SERIE_FACTURA) IS NOT NULL AND TRIM(i.NRO_FACTURA) IS NOT NULL AND ROWNUM=1");
   report.samples={clean:clean.length>=3,duplicates:dup.length>0};check(report.samples.clean&&report.samples.duplicates,'REQUIRED_LIVE_SAMPLES');
   const invoices=clean.map(r=>({invoiceSeries:r.SERIE_FACTURA,invoiceNumber:r.NRO_FACTURA})),binds={};
   const where=invoices.map((p,j)=>{binds['s'+j]=p.invoiceSeries;binds['n'+j]=p.invoiceNumber;return '(SERIE_FACTURA=:s'+j+' AND NRO_FACTURA=:n'+j+')';}).join(' OR ');
   let requests=0;
   const post=async(args,seed=true)=>{if(seed)await inspector.evaluate('globalThis.__invoiceBalancesLive.seed('+JSON.stringify({...args,asOfDate})+')');const res=await fetch('http://127.0.0.1:5400/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message:'Siguiente página'}),signal:AbortSignal.timeout(60000)});requests++;const body=await res.json();check(res.status===200&&body.success&&body.env==='development','HTTP_5400_'+requests);const data=await inspector.evaluate('globalThis.__invoiceBalancesLive.take()');check(!!data,'REAL_TOOL_RESULT_'+requests);return {body,data};};
   const expected=await run('SELECT * FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA>0 AND ('+where+") ORDER BY TO_DATE(VENCIMIENTO,'DD/MM/YYYY') ASC NULLS LAST,SERIE_FACTURA,NRO_FACTURA,COD_CLIENTE,SECTOR,COD_MONEDA,SIMBOLO_MONEDA,VENCIMIENTO,NOM_CLIENTE,RAZON_SOCIAL,RUC,DEUDA",binds);
   for(const page of [1,2]){const {body,data}=await post({invoices,rows:2,page},page===1),rows=expected.slice((page-1)*2,page*2);check(data.totalRows===expected.length&&data.page===page&&data.data.length===rows.length&&rows.every((r,j)=>data.data[j].invoiceSeries===r.SERIE_FACTURA&&data.data[j].invoiceNumber===r.NRO_FACTURA&&data.data[j].debt===String(r.DEUDA)),'DETAIL_PAGE_'+page+'_INDEPENDENT_SQL');check(!body.response.includes('[PII_'),'DETAIL_'+page+'_FINAL_RESTORED');}
   const totals=await run('SELECT COD_MONEDA,COUNT(*) N,SUM(DEUDA) DEUDA FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA>0 AND ('+where+') GROUP BY COD_MONEDA ORDER BY COD_MONEDA',binds),summary=await post({mode:'summary',invoices,rows:100});
   check(summary.data.status==='OK_SUMMARY'&&summary.data.data.length===totals.length&&totals.every((r,j)=>summary.data.data[j].currencyCode===r.COD_MONEDA&&summary.data.data[j].debt===String(r.DEUDA)&&summary.data.data[j].invoiceCount===Number(r.N)),'CLEAN_SUMMARY_INDEPENDENT_BY_CURRENCY');
   const duplicateInvoices=dup.map(r=>({invoiceSeries:r.SERIE_FACTURA,invoiceNumber:r.NRO_FACTURA})),blocked=await post({mode:'summary',invoices:duplicateInvoices,debtStatus:'all'});
   check(blocked.data.status==='INCONSISTENT_HISTORY'&&!blocked.data.data&&blocked.data.invoiceCount===null&&blocked.body.response.includes('históricos inconsistentes'),'DUPLICATES_CALCULATIONS_BLOCKED');
   const detail=await post({invoices:duplicateInvoices,debtStatus:'all',rows:2}),d=dup[0],count=(await run('SELECT COUNT(*) N FROM VW_BOT_FACTURAS_SALDOS WHERE (DEUDA>=0 OR DEUDA IS NULL) AND SERIE_FACTURA=:s AND NRO_FACTURA=:n',{s:d.SERIE_FACTURA,n:d.NRO_FACTURA}))[0];
   check(detail.data.totalRows===Number(count.N)&&detail.data.invoiceCount===null&&detail.data.data.length>0&&detail.data.warning&&detail.body.response.includes('históricos inconsistentes'),'DUPLICATE_DETAIL_PRESERVED_INDEPENDENT_COUNT');
   report.http={endpoint:5400,requests,contextSeededForDeterministicPagination:true,naturalLanguageModelInterpretationValidated:false};
  });
 }
 report.success=true;
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^ORA-\d{5}$/.test(e?.code??'')?e.code:'LIVE_CONTROL_FAILED'};}
finally{
 if(installed)try{report.runtimeCleanup=await inspector.evaluate('globalThis.__invoiceBalancesLive.dispose()');if(!report.runtimeCleanup.allConnectionsClosed||!report.runtimeCleanup.driverRestored||!report.runtimeCleanup.sdkRestored||report.runtimeCleanup.providerAttempts)report.success=false;}catch{report.success=false;report.runtimeCleanupFailed=true;}
 if(inspector)try{report.inspectorClosed=await inspector.close();if(!report.inspectorClosed)report.success=false;}catch{report.success=false;}
 driver.getConnection=original;await closeOracleSessionsPool();report.cleanup={opened,closed,closeErrors:errors,allConnectionsClosed:opened===closed&&!errors,postgresPoolClosed:true};if(!report.cleanup.allConnectionsClosed)report.success=false;sessionId=null;
}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
