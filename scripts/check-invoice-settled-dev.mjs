// Candidate-only HTTP listener. Real values remain in memory, never in reports.
import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import express from 'express';import driver from 'oracledb';
import config from '../config.js';import * as store from '../src/state/conversation.store.js';
import {getValidOracleSession,withOracleProxySession} from '../src/services/sessions/oracleSession.service.js';
import {closeOracleSessionsPool} from '../src/database/oracleSessions.database.js';
import {invoiceBalanceCell} from '../src/services/ai/invoiceBalancePresentation.service.js';
const emit=process.stdout.write.bind(process.stdout);for(const key of ['log','info','warn','error','debug','trace','dir','table'])console[key]=()=>{};
const report={suite:'invoice-settled-dev',commit:process.argv[2],success:false,checks:[],startedAt:new Date().toISOString(),noDeployment:true};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error(code);};
let sessionId,server,opened=0,closed=0,closeErrors=0,modelCalls=0;const queries=[],calls=[];
const original=driver.getConnection;driver.getConnection=async(...args)=>{const c=await original.apply(driver,args);opened++;c.callTimeout=60000;const execute=c.execute.bind(c),close=c.close.bind(c);c.execute=async(sql,binds,options)=>{check(/^\s*(?:SELECT|WITH)\b/i.test(sql),'READ_ONLY_ORACLE');queries.push({sql,binds});return execute(sql,binds,options);};c.close=async()=>{try{await close();closed++;}catch(e){closeErrors++;throw e;}};return c;};
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const executor=await import('../src/services/ai/toolExecutor.service.js');
const traced={async executeTool(request){const result=await executor.executeTool(request);calls.push({name:request.name,input:request.arguments,result});return result;}};
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;throw Error('MODEL_NOT_ALLOWED');}},ConverseCommand:class{constructor(input){this.input=input;}}};
const chat=await load('../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':traced});
const controller=await load('../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat}),router=await load('../src/routes/index.js',{'../controllers/chat.controller.js':controller});
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'SAFE_DEV');
 let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(raw).sessionId;raw='';
 const owned=await getValidOracleSession(sessionId),expiration=String(owned.expires_at);
 const app=express();app.use(express.json());app.use('/chatbot/api',router.router);server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message:'Mostrame las facturas de Impacto cuya deuda ya está cancelada'})}),body=await response.json();
 check(response.status===200&&body.success,'LITERAL_HTTP_SUCCESS');
 check(calls[0]?.name==='search_invoice_balance_customers'&&calls[0]?.input.query==='Impacto','LITERAL_BALANCE_CATALOG_QUERY');
 report.customerResolution=calls[0]?.result?.status;
 check(report.customerResolution==='RESOLVED','LITERAL_CUSTOMER_UNAMBIGUOUS');
 const customerId=calls[0].result.customerId,query=calls[1];
 check(calls.length===2&&query?.name==='get_invoice_balances','ONLY_CATALOG_AND_BALANCE_TOOLS');
 check(query.input.customerIds?.length===1&&query.input.customerIds[0]===customerId&&query.input.mode==='detail'&&query.input.debtStatus==='settled'&&query.input.page===1&&query.input.rows===20&&Object.keys(query.input).sort().join(',')==='customerIds,debtStatus,mode,page,rows','EFFECTIVE_SETTLED_ARGUMENTS');
 check(!calls.some(c=>c.name==='get_invoices'),'NO_GENERAL_INVOICE_FALLBACK');
 const balanceQueries=queries.filter(q=>q.sql.includes('VW_BOT_FACTURAS_SALDOS')&&!q.sql.includes('ROWNUM<=21'));
 check(balanceQueries.length===2&&balanceQueries.every(q=>q.sql.includes('AND DEUDA = 0')&&!q.sql.includes('AND DEUDA > 0')&&!/VW_BOT_FACTURAS\b|ANULADO/.test(q.sql)&&q.binds.customerIds0===customerId),'EFFECTIVE_ZERO_DEBT_SQL_AND_CUSTOMER');
 const r=query.result;
 await withOracleProxySession(sessionId,async({connection,username})=>{
  const run=async(sql,binds={})=>(await connection.execute(sql,binds,{outFormat:4002,maxRows:100,fetchInfo:{DEUDA:{type:driver.STRING}}})).rows;
  const identity=(await run("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL"))[0];check(identity.U===owned.username&&username===owned.username&&Boolean(identity.P),'POSTGRES_SESSION_ORACLE_PROXY_IDENTITY');
  const count=Number((await run('SELECT COUNT(*) N FROM VW_BOT_FACTURAS_SALDOS WHERE COD_CLIENTE=:c AND DEUDA=0',{c:customerId}))[0].N);
  const date="CASE WHEN VALIDATE_CONVERSION(TRIM(VENCIMIENTO) AS DATE,'FXDD/MM/YYYY')=1 THEN TO_DATE(TRIM(VENCIMIENTO),'FXDD/MM/YYYY') END";
  const expected=await run(`SELECT * FROM (SELECT v.*,${date} CONTROL_DUE_DATE,ROW_NUMBER() OVER(ORDER BY ${date} ASC NULLS LAST,SERIE_FACTURA,NRO_FACTURA,COD_CLIENTE,SECTOR,COD_MONEDA,SIMBOLO_MONEDA,VENCIMIENTO,NOM_CLIENTE,RAZON_SOCIAL,RUC,DEUDA) CONTROL_RN FROM VW_BOT_FACTURAS_SALDOS v WHERE COD_CLIENTE=:c AND DEUDA=0) WHERE CONTROL_RN<=20 ORDER BY CONTROL_RN`,{c:customerId});
  check(r.status==='OK_DETAIL_ONLY'&&r.totalRows===count&&r.returnedRows===expected.length&&r.data.length===expected.length,'INDEPENDENT_ZERO_COUNT_AND_PAGE');
  check(r.page===1&&r.rows===20&&r.totalPages===Math.ceil(count/20)&&r.hasMore===(count>20)&&r.nextPage===(count>20?2:null),'INDEPENDENT_PAGINATION');
  report.sample={hasZeroDebtRows:count>0,absenceObserved:count===0};
  for(let i=0;i<expected.length;i++){
   const e=expected[i],d=r.data[i];check(d.invoiceSeries===e.SERIE_FACTURA&&d.invoiceNumber===e.NRO_FACTURA&&d.customerId===customerId&&d.customerName===(e.NOM_CLIENTE??null)&&d.currencyCode===(e.COD_MONEDA??null)&&d.dueDate===(e.CONTROL_DUE_DATE==null?null:e.VENCIMIENTO.trim())&&Number(d.debt)===0&&d.debtState==='settled','INDEPENDENT_ZERO_FIELDS_AND_ORDER');
   for(const key of ['invoiceSeries','invoiceNumber','customerName','dueDate','currencyCode'])if(d[key]!=null)check(body.response.includes(invoiceBalanceCell(d[key])),'RESPONSE_SETTLED_FIELD');
  }
  if(count===0)check(body.response.includes('No se encontraron facturas con deuda cancelada')&&!body.response.includes('| Serie de factura'),'VALID_ABSENCE_NO_FABRICATED_ROWS');
  else check(body.response.includes('0,00')&&body.response.includes('Deuda cancelada'),'RESPONSE_ZERO_DEBT');
 });
 check(body.response.includes('No indica que la factura esté anulada')&&!body.response.includes('[PII_'),'DEBT_NOT_ANNULMENT_AND_PII_RESTORED');
 check(Object.keys(body.actions??{}).length===0,'NO_GENERAL_ACTIONS');
 const history=JSON.stringify(store.getConversation(sessionId));check(!history.includes('Impacto'),'CUSTOMER_NAME_PROTECTED_IN_HISTORY');
 check(modelCalls===0,'NO_MODEL_INVOCATION');check(String((await getValidOracleSession(sessionId)).expires_at)===expiration,'SESSION_EXPIRATION_UNCHANGED');
 report.effectiveArguments={customerIds:'same customer resolved by balance catalog (redacted)',mode:'detail',debtStatus:'settled',page:1,rows:20};report.success=true;
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^ORA-\d{5}$/.test(e?.code??'')?e.code:'SETTLED_CONTROL_FAILED'};}
finally{if(server)await new Promise(resolve=>server.close(resolve));if(sessionId)store.clearConversation(sessionId);driver.getConnection=original;await closeOracleSessionsPool();report.cleanup={opened,closed,closeErrors,allConnectionsClosed:opened===closed&&!closeErrors,driverRestored:driver.getConnection===original,serverClosed:!server?.listening,ownConversationCleared:true,postgresPoolClosed:true};if(!report.cleanup.allConnectionsClosed)report.success=false;report.modelCalls=modelCalls;report.realProviderCalls=0;report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;}
