import fs from 'node:fs';import config from '/app/config.js';import driver from '/app/node_modules/oracledb/index.js';
import {getValidOracleSession,withOracleProxySession} from '/app/src/services/sessions/oracleSession.service.js';
import {closeOracleSessionsPool} from '/app/src/database/oracleSessions.database.js';
import {invoiceBalanceCell} from '/app/src/services/ai/invoiceBalancePresentation.service.js';
import {openInspector,verifyLoadedSource} from './inspector.mjs';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'invoice-settled-live-5400',commit:process.argv[2],success:false,checks:[],startedAt:new Date().toISOString(),providerCalls:0};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error(code);};
let sessionId,inspector,installed=false,opened=0,closed=0,closeErrors=0;
const original=driver.getConnection;driver.getConnection=async(...args)=>{const c=await original.apply(driver,args);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);c.close=async()=>{try{await close();closed++;}catch(e){closeErrors++;throw e;}};c.execute=async(sql,binds,options)=>{if(!/^\s*(?:SELECT|WITH)\b/i.test(sql))throw Error('INDEPENDENT_READ_ONLY_REQUIRED');return execute(sql,binds,options);};return c;};
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'SAFE_DEV');
 inspector=await openInspector();report.loadedModules=await verifyLoadedSource(inspector,JSON.parse(fs.readFileSync(new URL('./expected.json',import.meta.url))));
 check(await inspector.evaluate("typeof process.getBuiltinModule('module').createRequire('/app/index.js')('/tmp/invoice-settled-live/runtime.mjs').install==='function'"),'RUNTIME_AVAILABLE');
 if(!process.argv.includes('--preflight')){
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(raw).sessionId;raw='';
  const owned=await getValidOracleSession(sessionId),expiration=String(owned.expires_at);
  installed=await inspector.evaluate(`process.getBuiltinModule('module').createRequire('/app/index.js')('/tmp/invoice-settled-live/runtime.mjs').install(${JSON.stringify(sessionId)})`);
  await withOracleProxySession(sessionId,async({connection})=>{
   const run=async(sql,binds={})=>(await connection.execute(sql,binds,{outFormat:4002,maxRows:100,fetchInfo:{DEUDA:{type:driver.STRING}}})).rows;
   const identity=(await run("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL"))[0];check(identity.U===owned.username&&Boolean(identity.P),'POSTGRES_ORACLE_PROXY_IDENTITY');
   let requests=0,customerId;const settledPages=[],pendingPages=[];
   const post=async(message,expectTool=true)=>{await inspector.evaluate('globalThis.__invoiceSettledLive.begin()');const response=await fetch('http://127.0.0.1:5400/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message}),signal:AbortSignal.timeout(60000)});requests++;const body=await response.json();check(response.status===200&&body.success&&body.env==='development','HTTP_5400_'+requests);const trace=await inspector.evaluate('globalThis.__invoiceSettledLive.take()');if(expectTool)check(trace.calls.length>0&&trace.calls.every(c=>c.status==='success'),'TOOLS_COMPLETED_'+requests);check(!body.response.includes('[PII_'),'PII_RESTORED_'+requests);check(Object.keys(body.actions??{}).length===0,'NO_GENERAL_ACTIONS_'+requests);return {body,trace};};
   const date="CASE WHEN VALIDATE_CONVERSION(TRIM(VENCIMIENTO) AS DATE,'FXDD/MM/YYYY')=1 THEN TO_DATE(TRIM(VENCIMIENTO),'FXDD/MM/YYYY') END";
   const exact=value=>{const [whole,fraction='']=String(value).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+fraction.padEnd(2,'0');};
   const verify=async({body,trace},status,page,label)=>{
    const call=trace.calls.at(-1);check(call.name==='get_invoice_balances'&&call.input.customerIds?.length===1&&call.input.customerIds[0]===customerId&&call.input.debtStatus===status,'EFFECTIVE_CUSTOMER_AND_STATUS_'+label);
    for(const key of ['cancelled','dateFrom','dateTo','conceptIds','plate','period'])check(call.input[key]===undefined,'NO_INCOMPATIBLE_FILTER_'+key+'_'+label);
    check(trace.calls.every(c=>['get_invoice_balances','search_invoice_balance_customers'].includes(c.name)),'NO_GENERAL_FALLBACK_'+label);
    const sql=trace.queries.filter(q=>!q.sql.includes('ROWNUM<=21')),sign=status==='settled'?'= 0':'> 0';
    check(sql.length===2&&sql.every(q=>q.sql.includes('VW_BOT_FACTURAS_SALDOS')&&q.sql.includes('AND DEUDA '+sign)&&q.binds.customerIds0===customerId&&!/VW_BOT_FACTURAS\b|ANULADO/.test(q.sql)),'REAL_SQL_AND_BINDS_'+label);
    if(status==='settled')check(sql.every(q=>!q.sql.includes('AND DEUDA > 0')),'NO_PENDING_PREDICATE_'+label);
    const count=Number((await run('SELECT COUNT(*) N FROM VW_BOT_FACTURAS_SALDOS WHERE COD_CLIENTE=:c AND DEUDA '+sign,{c:customerId}))[0].N),r=call.result;
    const expected=await run(`SELECT * FROM (SELECT v.*,${date} CONTROL_DUE_DATE,ROW_NUMBER() OVER(ORDER BY ${date} ASC NULLS LAST,SERIE_FACTURA,NRO_FACTURA,COD_CLIENTE,SECTOR,COD_MONEDA,SIMBOLO_MONEDA,VENCIMIENTO,NOM_CLIENTE,RAZON_SOCIAL,RUC,DEUDA) CONTROL_RN FROM VW_BOT_FACTURAS_SALDOS v WHERE COD_CLIENTE=:c AND DEUDA ${sign}) WHERE CONTROL_RN>:offset AND CONTROL_RN<=:last ORDER BY CONTROL_RN`,{c:customerId,offset:(page-1)*20,last:page*20});
    check(r.status==='OK_DETAIL_ONLY'&&r.mode==='detail'&&r.totalRows===count&&r.data.length===expected.length&&r.returnedRows===expected.length&&r.page===page&&r.rows===20&&r.totalPages===Math.ceil(count/20)&&r.hasMore===(page<Math.ceil(count/20))&&r.nextPage===(page<Math.ceil(count/20)?page+1:null),'INDEPENDENT_COUNT_AND_PAGINATION_'+label);
    for(let i=0;i<expected.length;i++){
     const e=expected[i],d=r.data[i];check(d.invoiceSeries===e.SERIE_FACTURA&&d.invoiceNumber===e.NRO_FACTURA&&d.customerId===customerId&&d.customerName===(e.NOM_CLIENTE??null)&&d.currencyCode===(e.COD_MONEDA??null)&&d.dueDate===(e.CONTROL_DUE_DATE==null?null:e.VENCIMIENTO.trim())&&d.debt===String(e.DEUDA),'INDEPENDENT_FIELDS_AND_ORDER_'+label);
     check(status==='settled'?Number(d.debt)===0&&d.debtState==='settled':Number(d.debt)>0&&d.debtState==='pending','EXACT_DEBT_STATUS_'+label);
     for(const key of ['invoiceSeries','invoiceNumber','customerName','dueDate','currencyCode'])if(d[key]!=null)check(body.response.includes(invoiceBalanceCell(d[key])),'PRESENTED_FIELD_'+key+'_'+label);
     check(body.response.includes(exact(d.debt)),'PRESENTED_EXACT_DEBT_'+label);
    }
    check(body.response.split('\n').filter(l=>l.startsWith('| ')).length===(r.data.length?r.data.length+2:0),'ALL_TABLE_ROWS_'+label);
    if(status==='settled'){
     check(body.response.includes('Facturas con deuda cancelada')&&body.response.includes('No indica que la factura esté anulada'),'ZERO_DEBT_NOT_ANNULMENT_'+label);
     if(!count)check(body.response.includes('No se encontraron facturas con deuda cancelada'),'VALID_ABSENCE_'+label);
     settledPages.push({label,page,hasRows:r.data.length>0,hasMore:r.hasMore});
    }else pendingPages.push({label,page,hasRows:r.data.length>0});
    check(trace.state.invoiceLastTool==='get_invoice_balances'&&trace.state.contexts.get_invoice_balances.debtStatus===status&&trace.state.contexts.get_invoice_balances.page===page,'COMMITTED_CONTEXT_'+label);return r;
   };
   const literal=await post('Mostrame las facturas de Impacto cuya deuda ya está cancelada');
   check(literal.trace.calls.length===2&&literal.trace.calls[0].name==='search_invoice_balance_customers'&&literal.trace.calls[0].input.query==='Impacto'&&literal.trace.calls[0].result.status==='RESOLVED','LITERAL_BALANCE_CATALOG');
   customerId=literal.trace.calls[0].result.customerId;
   const first=await verify(literal,'settled',1,'literal');
   if(first.hasMore)await verify(await post('Siguiente página'),'settled',2,'literal_page2');
   await verify(await post('facturas pendientes'),'pending',1,'pending');
   const followup=await verify(await post('ahora las canceladas'),'settled',1,'followup');
   if(followup.hasMore){
    const trimmed=await inspector.evaluate('globalThis.__invoiceSettledLive.trim()');check(trimmed.noToolReferences&&trimmed.cachedStatus==='success'&&trimmed.debtStatus==='settled'&&trimmed.nextPage===2,'ACTUAL_HISTORY_TRIM_PRESERVES_SETTLED_CURSOR');
    await verify(await post('Siguiente página'),'settled',2,'followup_page2_after_trim');report.actualHistoryTrimValidated=true;
   }else{
    const end=await post('Siguiente página',false);check(end.trace.calls.length===0&&end.body.response.includes('No hay más páginas'),'SINGLE_FINAL_PAGE');report.actualHistoryTrimValidated=false;
   }
   report.http={endpoint:5400,requests,literalAndFollowupReal:true,resultsSimulated:false,contextSeeded:false};report.settledPages=settledPages;report.pendingPages=pendingPages;
  });
  check(String((await getValidOracleSession(sessionId)).expires_at)===expiration,'SESSION_EXPIRATION_UNCHANGED');
 }
 report.success=true;
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^ORA-\d{5}$/.test(e?.code??'')?e.code:'SETTLED_LIVE_CONTROL_FAILED'};}
finally{
 if(installed)try{report.runtimeCleanup=await inspector.evaluate('globalThis.__invoiceSettledLive.dispose()');if(!report.runtimeCleanup.allConnectionsClosed||!report.runtimeCleanup.driverRestored||!report.runtimeCleanup.sdkRestored||report.runtimeCleanup.providerAttempts)report.success=false;}catch{report.success=false;report.runtimeCleanupFailed=true;}
 if(inspector)try{report.inspectorClosed=await inspector.close();if(!report.inspectorClosed)report.success=false;}catch{report.success=false;}
 driver.getConnection=original;await closeOracleSessionsPool();report.cleanup={opened,closed,closeErrors,allConnectionsClosed:opened===closed&&!closeErrors,driverRestored:driver.getConnection===original,postgresPoolClosed:true};if(!report.cleanup.allConnectionsClosed)report.success=false;sessionId=null;
}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
