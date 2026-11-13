import fs from 'node:fs';
import config from '/app/config.js';
import driver from '/app/node_modules/oracledb/index.js';
import {getValidOracleSession,withOracleProxySession} from '/app/src/services/sessions/oracleSession.service.js';
import {closeOracleSessionsPool} from '/app/src/database/oracleSessions.database.js';
import {invoiceBalanceCell} from '/app/src/services/ai/invoiceBalancePresentation.service.js';
import {openInspector,verifyLoadedSource} from './inspector.mjs';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','info','error','warn','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'invoice-pending-live-5400',commit:process.argv[2],success:false,checks:[],startedAt:new Date().toISOString(),realProviderCalls:0};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error(code);};
let inspector,installed=false,sessionId,opened=0,closed=0,closeErrors=0;
const original=driver.getConnection;
driver.getConnection=async(...args)=>{const c=await original.apply(driver,args);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);c.close=async()=>{try{const r=await close();closed++;return r;}catch(e){closeErrors++;throw e;}};c.execute=async(sql,binds,options)=>{if(!/^\s*(?:SELECT|WITH)\b/i.test(sql))throw Error('INDEPENDENT_READ_ONLY_REQUIRED');return execute(sql,binds,options);};return c;};
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'SAFE_DEV');
 inspector=await openInspector();report.loadedModules=await verifyLoadedSource(inspector,JSON.parse(fs.readFileSync(new URL('./expected.json',import.meta.url))));
 check(await inspector.evaluate("typeof process.getBuiltinModule('module').createRequire('/app/index.js')('/tmp/invoice-pending-live/runtime.mjs').install==='function'"),'DIAGNOSTIC_RUNTIME_AVAILABLE');
 if(!process.argv.includes('--preflight')){
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(raw).sessionId;raw='';
  const owned=await getValidOracleSession(sessionId),expiration=String(owned.expires_at);
  installed=await inspector.evaluate(`process.getBuiltinModule('module').createRequire('/app/index.js')('/tmp/invoice-pending-live/runtime.mjs').install(${JSON.stringify(sessionId)})`);
  await withOracleProxySession(sessionId,async({connection})=>{
   const run=async(sql,binds={},maxRows=100)=>(await connection.execute(sql,binds,{outFormat:4002,maxRows,fetchInfo:{DEUDA:{type:driver.STRING}}})).rows;
   const identity=(await run("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL"))[0];check(identity.U===owned.username&&Boolean(identity.P),'POSTGRES_ORACLE_PROXY_IDENTITY');
   const samples=await run(`SELECT * FROM (
    SELECT f.COD_CLIENTE,f.NOM_CLIENTE,f.COD_CONCEPTO,EXTRACT(YEAR FROM f.FECHA_EMISION) Y,p.N
    FROM VW_BOT_FACTURAS f JOIN (SELECT COD_CLIENTE,COUNT(*) N FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA>0 AND COD_CLIENTE IS NOT NULL GROUP BY COD_CLIENTE) p ON p.COD_CLIENTE=f.COD_CLIENTE
    WHERE NVL(f.USER_CAN_CONSULT,'S')<>'N' AND f.COD_CONCEPTO IS NOT NULL AND f.FECHA_EMISION>=DATE '1900-01-01' AND f.FECHA_EMISION<DATE '2100-01-01'
    AND NOT EXISTS(SELECT 1 FROM VW_BOT_FACTURAS r WHERE r.COD_CLIENTE=f.COD_CLIENTE AND r.COD_CONCEPTO=f.COD_CONCEPTO AND EXTRACT(YEAR FROM r.FECHA_EMISION)=EXTRACT(YEAR FROM f.FECHA_EMISION) AND r.USER_CAN_CONSULT='N')
    ORDER BY p.N DESC,f.FECHA_EMISION DESC,f.COD_CLIENTE,f.COD_CONCEPTO
   ) WHERE ROWNUM=1`);
   check(samples.length===1,'AUTHORIZED_GENERAL_AND_PENDING_SAMPLE');
   const s=samples[0],sample={customerId:s.COD_CLIENTE,customerName:s.NOM_CLIENTE,conceptId:s.COD_CONCEPTO,dateFrom:'01/01/'+s.Y,dateTo:'31/12/'+s.Y};
   check(await inspector.evaluate('globalThis.__invoicePendingLive.seedGeneral('+JSON.stringify(sample)+')'),'OWNED_GENERAL_CONTEXT_PREPARED');
   let requests=0;
   const post=async message=>{await inspector.evaluate('globalThis.__invoicePendingLive.clearTrace()');const res=await fetch('http://127.0.0.1:5400/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message}),signal:AbortSignal.timeout(60000)});requests++;const body=await res.json();check(res.status===200&&body.success&&body.env==='development','HTTP_5400_'+requests);const trace=await inspector.evaluate('globalThis.__invoicePendingLive.take()');check(trace.status==='success','TOOL_COMPLETED_'+requests);check(!body.response.includes('[PII_'),'USER_PII_RESTORED_'+requests);return {body,trace};};
   const general=await post('1');
   check(general.trace.name==='get_invoices'&&general.trace.input.customerIds?.[0]===sample.customerId&&general.trace.input.conceptIds?.[0]===sample.conceptId&&general.trace.input.dateFrom===sample.dateFrom&&general.trace.input.dateTo===sample.dateTo,'GENERAL_EFFECTIVE_CUSTOMER_CONCEPT_EMISSION_SCOPE');
   const count=(await run("SELECT COUNT(*) N FROM VW_BOT_FACTURAS WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND COD_CLIENTE=:c AND COD_CONCEPTO=:concept AND FECHA_EMISION>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA_EMISION<TO_DATE(:t,'DD/MM/YYYY')+1",{c:sample.customerId,concept:sample.conceptId,f:sample.dateFrom,t:sample.dateTo}))[0];
   check(Number(count.N)===general.trace.result.totalRows&&general.trace.result.data.length>0,'GENERAL_INDEPENDENT_AUTHORIZED_COUNT_AND_ROWS');
   check(general.trace.queries.length>0&&general.trace.queries.every(q=>q.sql.includes('VW_BOT_FACTURAS')&&!q.sql.includes('VW_BOT_FACTURAS_SALDOS')),'GENERAL_REAL_SQL_VIEW');
   const dateSql="CASE WHEN VALIDATE_CONVERSION(TRIM(VENCIMIENTO) AS DATE,'FXDD/MM/YYYY')=1 THEN TO_DATE(TRIM(VENCIMIENTO),'FXDD/MM/YYYY') END";
   const total=Number((await run('SELECT COUNT(*) N FROM VW_BOT_FACTURAS_SALDOS WHERE COD_CLIENTE=:c AND DEUDA>0',{c:sample.customerId}))[0].N);
   const expectedPage=async(page,rows)=>run(`SELECT * FROM (SELECT v.*,${dateSql} CONTROL_DUE_DATE,ROW_NUMBER() OVER(ORDER BY ${dateSql} ASC NULLS LAST,SERIE_FACTURA,NRO_FACTURA,COD_CLIENTE,SECTOR,COD_MONEDA,SIMBOLO_MONEDA,VENCIMIENTO,NOM_CLIENTE,RAZON_SOCIAL,RUC,DEUDA) CONTROL_RN FROM VW_BOT_FACTURAS_SALDOS v WHERE COD_CLIENTE=:c AND DEUDA>0) WHERE CONTROL_RN>:offset AND CONTROL_RN<=:last ORDER BY CONTROL_RN`,{c:sample.customerId,offset:(page-1)*rows,last:page*rows});
   const exact=value=>{const [whole,fraction='']=String(value).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+fraction.padEnd(2,'0');};
   const verify=async({body,trace},page,rows,label)=>{
    check(trace.name==='get_invoice_balances'&&trace.input.customerIds?.length===1&&trace.input.customerIds[0]===sample.customerId&&trace.input.debtStatus==='pending','PENDING_CUSTOMER_TOOL_SIGN_'+label);
    for(const key of ['dateFrom','dateTo','conceptIds','plate','period','cancelled'])check(trace.input[key]===undefined,'NO_BILLING_FILTER_'+key+'_'+label);
    check(trace.queries.length>0&&trace.queries.every(q=>q.sql.includes('VW_BOT_FACTURAS_SALDOS')&&q.sql.includes('DEUDA > 0')&&q.binds.customerIds0===sample.customerId&&!/VW_BOT_FACTURAS\b/.test(q.sql)),'PENDING_EFFECTIVE_SQL_AND_BINDS_'+label);
    const r=trace.result,expected=await expectedPage(page,rows),pages=Math.ceil(total/rows);
    check(r.mode==='detail'&&r.status==='OK_DETAIL_ONLY'&&r.totalRows===total&&r.page===page&&r.rows===rows&&r.totalPages===pages&&r.returnedRows===expected.length&&r.hasMore===(page<pages)&&r.nextPage===(page<pages?page+1:null),'INDEPENDENT_PAGINATION_'+label);
    check(r.data.length===expected.length,'FULL_PAGE_'+label);
    for(let i=0;i<expected.length;i++){
     const e=expected[i],d=r.data[i];
     check(d.invoiceSeries===e.SERIE_FACTURA&&d.invoiceNumber===e.NRO_FACTURA&&d.customerId===e.COD_CLIENTE&&d.customerName===(e.NOM_CLIENTE??null)&&d.currencyCode===(e.COD_MONEDA??null)&&d.debt===String(e.DEUDA)&&d.dueDate===(e.CONTROL_DUE_DATE==null?null:e.VENCIMIENTO.trim()),'INDEPENDENT_DEBT_FIELDS_AND_ORDER_'+label);
     check(Number(d.debt)>0,'POSITIVE_ONLY_'+label);
     for(const key of ['invoiceSeries','invoiceNumber','customerName','dueDate','currencyCode'])if(d[key]!=null)check(body.response.includes(invoiceBalanceCell(d[key])),'PRESENTED_FIELD_'+key+'_'+label);
     check(body.response.includes(exact(d.debt)),'PRESENTED_EXACT_DEBT_'+label);
    }
    check(body.response.includes('Deudas registradas de facturas')&&body.response.includes('No se suman importes')&&!body.response.includes('Ver PDF'),'DEBT_NOT_BILLED_AMOUNT_'+label);
    if(r.data.length)for(const col of ['Serie de factura','Número de factura','Cliente','Vencimiento','Moneda (código)','Deuda'])check(body.response.includes(col),'REQUIRED_COLUMN_'+label);
    check((body.response.split('\n').filter(l=>l.startsWith('| ')).length)===(r.data.length?r.data.length+2:0),'ALL_PRESENTED_ROWS_'+label);
    check(Object.keys(body.actions??{}).length===0,'NO_STALE_INVOICE_ACTIONS_'+label);
    check(trace.state.contexts.get_invoice_balances.customerIds?.[0]===sample.customerId&&trace.state.invoiceLastTool==='get_invoice_balances','COMMITTED_PENDING_CONTEXT_'+label);
    return r;
   };
   const pending=await verify(await post('solo las pendientes'),1,20,'followup');
   report.naturalFollowup={generalViaConfirmedContextSelection:true,preparedFromAuthorizedOracleRows:true,modelNotUsed:true,compatibleClientPreserved:true,emissionAndConceptRemoved:true,hasPendingRows:pending.data.length>0,hasNaturalNextPage:pending.hasMore};
   if(pending.hasMore){await verify(await post('Siguiente página'),2,20,'natural_page2');report.pagination='natural followup pages 1 and 2';}
   else if(total>=2){
    check(await inspector.evaluate('globalThis.__invoicePendingLive.seedPagination('+JSON.stringify(pending.queryContext)+')'),'OWNED_ONE_ROW_PAGINATION_PREPARED');
    await verify(await post('Siguiente página'),1,1,'prepared_page1');await verify(await post('Siguiente página'),2,1,'actual_page2');report.pagination='natural page reconciled; additional owned rows=1 context, page2 from actual page1 response';
   }else report.pagination='single natural final page; no positive page2 sample';
   report.http={endpoint:5400,requests,realOracle:true,realSdkCalls:0,providerAttempts:0};
  });
  check(String((await getValidOracleSession(sessionId)).expires_at)===expiration,'SESSION_EXPIRATION_UNCHANGED');
 }
 report.success=true;
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^ORA-\d{5}$/.test(e?.code??'')?e.code:'PENDING_LIVE_CONTROL_FAILED'};}
finally{
 if(installed)try{report.runtimeCleanup=await inspector.evaluate('globalThis.__invoicePendingLive.dispose()');if(!report.runtimeCleanup.allConnectionsClosed||!report.runtimeCleanup.driverRestored||!report.runtimeCleanup.sdkRestored||report.runtimeCleanup.providerAttempts)report.success=false;}catch{report.success=false;report.runtimeCleanupFailed=true;}
 if(inspector)try{report.inspectorClosed=await inspector.close();if(!report.inspectorClosed)report.success=false;}catch{report.success=false;}
 driver.getConnection=original;await closeOracleSessionsPool();report.cleanup={opened,closed,closeErrors,allConnectionsClosed:opened===closed&&!closeErrors,driverRestored:driver.getConnection===original,postgresPoolClosed:true};if(!report.cleanup.allConnectionsClosed)report.success=false;sessionId=null;
}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
