// Isolated candidate listener; business values and session identifiers stay in memory.
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import express from 'express';
import driver from 'oracledb';
import config from '../config.js';
import * as store from '../src/state/conversation.store.js';
import {protectPiiDeep,restorePiiDeep} from '../src/services/ai/pii.service.js';
import {getValidOracleSession,withOracleProxySession} from '../src/services/sessions/oracleSession.service.js';
import {closeOracleSessionsPool} from '../src/database/oracleSessions.database.js';
import {getInvoiceBalances} from '../src/services/invoices/invoiceBalances.service.js';
import {invoiceBalanceCell} from '../src/services/ai/invoiceBalancePresentation.service.js';
const emit=process.stdout.write.bind(process.stdout);for(const key of ['log','info','warn','error','debug','trace','dir','table'])console[key]=()=>{};
const report={suite:'invoice-pending-dev',commit:process.argv[2],success:false,checks:[],cases:[],noDeployment:true};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error(code);};
let sessionId,opened=0,closed=0,server,modelCalls=0,mode='pending',calls=[],sqlCalls=[],customerId;
const originalConnection=driver.getConnection;
driver.getConnection=async(...args)=>{const c=await originalConnection.apply(driver,args);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);c.close=async()=>{await close();closed++;};c.execute=async(sql,binds,options)=>{check(/^\s*(?:SELECT|WITH)\b/i.test(sql),'ORACLE_READ_ONLY');sqlCalls.push({sql,binds});return execute(sql,binds,options);};return c;};
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const executor=await import('../src/services/ai/toolExecutor.service.js');
const traced={async executeTool(request){const result=await executor.executeTool(request);calls.push({name:request.name,input:request.arguments,result});return result;}};
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;if(mode==='generalDone')return {output:{message:{role:'assistant',content:[{text:'Consulta general realizada.'}]}},stopReason:'end_turn'};mode='generalDone';return {output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'general-'+modelCalls,name:'get_invoices',input:protectPiiDeep(sessionId,{customerIds:[customerId],dateFrom:'01/01/2023',dateTo:'31/12/2023',mode:'detail',page:1,rows:1})}}]}},stopReason:'tool_use'};}},ConverseCommand:class{constructor(input){this.input=input;}}};
const chat=await load('../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':traced});
const controller=await load('../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat});
const router=await load('../src/routes/index.js',{'../controllers/chat.controller.js':controller});
try{
 check(config.env==='development'&&!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,'SAFE_DEV');
 let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(raw).sessionId;raw='';
 const session=await getValidOracleSession(sessionId),expiry=session.expires_at;
 await withOracleProxySession(sessionId,async({connection,username})=>{
  const r=await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{}, {outFormat:4002});check(r.rows[0].U===username&&Boolean(r.rows[0].P),'POSTGRES_SESSION_PROXY_IDENTITY');
 });
 const app=express();app.use(express.json());app.use('/chatbot/api',router.router);server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const post=async message=>{calls=[];sqlCalls=[];const r=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message})});const b=await r.json();check(r.status===200&&b.success,'HTTP_SUCCESS');return b;};
 const original=await post('¿Qué facturas pendientes de pago tiene Impacto?');
 check(calls[0]?.name==='search_invoice_balance_customers','ORIGINAL_BALANCE_RESOLVER');
 const resolved=calls[0].result;report.originalResolution=resolved?.status;
 if(resolved?.status!=='RESOLVED'){report.reservation='Original customer requires clarification; no customer selected automatically';throw Error('ORIGINAL_CUSTOMER_NOT_UNAMBIGUOUS');}
 customerId=resolved.customerId;
 async function verify(label,body){
  const query=calls.find(c=>c.name==='get_invoice_balances');check(Boolean(query)&&!calls.some(c=>c.name==='get_invoices'),'PENDING_ONLY_BALANCE_TOOL');
  check(JSON.stringify(query.input.customerIds)===JSON.stringify([customerId])&&query.input.debtStatus==='pending'&&query.input.mode==='detail'&&query.input.page===1,'EFFECTIVE_CUSTOMER_PENDING_DETAIL');
  check(Object.keys(query.input).every(k=>['customerIds','mode','debtStatus','page','rows'].includes(k)),'NO_INCOMPATIBLE_FILTERS');
  check(sqlCalls.filter(q=>!q.sql.includes('ROWNUM<=21')).every(q=>q.sql.includes('VW_BOT_FACTURAS_SALDOS')&&q.sql.includes('DEUDA > 0')&&!/VW_BOT_FACTURAS\b/.test(q.sql)),'EFFECTIVE_SQL_BALANCE_POSITIVE');
  const r=query.result;
  await withOracleProxySession(sessionId,async({connection})=>{
   const expected=await connection.execute('SELECT SERIE_FACTURA,NRO_FACTURA,COD_CLIENTE,NOM_CLIENTE,VENCIMIENTO,COD_MONEDA,DEUDA FROM VW_BOT_FACTURAS_SALDOS WHERE COD_CLIENTE=:c AND DEUDA>0',{c:customerId},{outFormat:4002,fetchInfo:{DEUDA:{type:driver.STRING}}});
   check(expected.rows.length===r.totalRows,'INDEPENDENT_PENDING_COUNT');
   const tuple=x=>JSON.stringify([x.SERIE_FACTURA,x.NRO_FACTURA,x.COD_CLIENTE,x.NOM_CLIENTE,x.VENCIMIENTO?.trim(),x.COD_MONEDA,String(x.DEUDA)]);
   const bag=new Map();for(const row of expected.rows){const k=tuple(row);bag.set(k,(bag.get(k)??0)+1);}
   for(const row of r.data){const k=tuple({SERIE_FACTURA:row.invoiceSeries,NRO_FACTURA:row.invoiceNumber,COD_CLIENTE:row.customerId,NOM_CLIENTE:row.customerName,VENCIMIENTO:row.dueDate,COD_MONEDA:row.currencyCode,DEUDA:row.debt});check((bag.get(k)??0)>0,'INDEPENDENT_DETAIL_FIELDS_MULTIPLICITY');bag.set(k,bag.get(k)-1);check(Number(row.debt)>0,'NO_SETTLED_NEGATIVE_OR_UNKNOWN');}
  });
  if(r.data.length)for(const col of ['Serie de factura','Número de factura','Cliente','Vencimiento','Moneda (código)','Deuda'])check(body.response.includes(col),'RESPONSE_REQUIRED_COLUMN');
  check(r.data.length===Math.min(r.totalRows,20),'DETAIL_PAGE_COMPLETE');
  for(const row of r.data){
   for(const key of ['invoiceSeries','invoiceNumber','customerName','dueDate','currencyCode'])if(row[key]!=null)check(body.response.includes(invoiceBalanceCell(row[key])),'RESPONSE_INDEPENDENT_FIELD');
   const [whole,fraction='']=row.debt.split('.');const formatted=whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+fraction.padEnd(2,'0');check(body.response.includes(formatted),'RESPONSE_EXACT_DEBT');
  }
  report.cases.push({label,tool:query.name,effectiveArguments:{customerIds:'same resolved customer (redacted)',mode:query.input.mode,debtStatus:query.input.debtStatus,page:query.input.page,rows:query.input.rows},hasRows:r.data.length>0,independentOracle:true});
 }
 await verify('original',original);
 for(const message of ['facturas pendientes','pendientes de pago','cuánto debe'])await verify(message,await post(message));
 mode='general';const general=await post('Consulta facturas generales de 2023');check(calls.some(c=>c.name==='get_invoices'),'GENERAL_HTTP_GET_INVOICES');
 await verify('solo las pendientes after general HTTP',await post('solo las pendientes'));
 await withOracleProxySession(sessionId,async({connection})=>{
  const run=async sql=>(await connection.execute(sql,{}, {outFormat:4002})).rows;
  const signs=await run('SELECT CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA=0) THEN 1 ELSE 0 END Z, CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA<0) THEN 1 ELSE 0 END N FROM DUAL');report.signSamples={settled:signs[0].Z===1,negative:signs[0].N===1};
  for(const [kind,having]of [['equal','COUNT(DISTINCT DEUDA)=1'],['different','COUNT(DISTINCT DEUDA)>1']]){
   const rows=await run('SELECT SERIE_FACTURA,NRO_FACTURA FROM (SELECT SERIE_FACTURA,NRO_FACTURA FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA>=0 OR DEUDA IS NULL GROUP BY SERIE_FACTURA,NRO_FACTURA HAVING COUNT(*)>1 AND '+having+') WHERE SERIE_FACTURA IS NOT NULL AND NRO_FACTURA IS NOT NULL AND ROWNUM=1');
   report[kind+'DuplicateSample']=rows.length>0;if(!rows.length)continue;
   const invoices=rows.map(x=>({invoiceSeries:x.SERIE_FACTURA,invoiceNumber:x.NRO_FACTURA}));
   const result=await getInvoiceBalances({invoices,mode:'summary',debtStatus:'all'},connection);check(result.status==='INCONSISTENT_HISTORY'&&result.invoiceCount===null&&!result.data,'DUPLICATE_SUMMARY_BLOCKED_'+kind);
   const detail=await getInvoiceBalances({invoices,debtStatus:'all'},connection);check(detail.duplicateRows>1&&detail.warning&&detail.invoiceCount===null,'DUPLICATE_DETAIL_WARNING_'+kind);
  }
 });
 const after=await getValidOracleSession(sessionId);check(String(after.expires_at)===String(expiry),'SESSION_EXPIRATION_UNCHANGED');report.success=true;
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'PENDING_DEV_VALIDATION_FAILED'};}
finally{if(server)await new Promise(resolve=>server.close(resolve));if(sessionId)store.clearConversation(sessionId);driver.getConnection=originalConnection;await closeOracleSessionsPool();report.cleanup={opened,closed,allConnectionsClosed:opened===closed,driverRestored:driver.getConnection===originalConnection,serverClosed:!server?.listening,ownConversationCleared:true};report.controlledModelCalls=modelCalls;report.realProviderCalls=0;emit(JSON.stringify(report)+'\n');process.exitCode=report.success?0:1;}
