// Read-only DEV validation. Business values stay in memory; reports contain checks only.
import fs from 'node:fs';
import vm from 'node:vm';import {createRequire} from 'node:module';import express from 'express';
import {getInvoiceBalances,searchInvoiceBalanceCustomers} from '../src/services/invoices/invoiceBalances.service.js';
import {protectPiiDeep,protectPiiValue,restorePiiDeep} from '../src/services/ai/pii.service.js';
import * as store from '../src/state/conversation.store.js';
import {clearPiiSession} from '../src/state/pii.store.js';
import crypto from 'node:crypto';
import config from '../config.js';
import driver from 'oracledb';
import {withOracleProxySession,getValidOracleSession} from '../src/services/sessions/oracleSession.service.js';
import {closeOracleSessionsPool} from '../src/database/oracleSessions.database.js';
const emit=process.stdout.write.bind(process.stdout);for(const key of ['log','info','warn','error','debug','trace','dir','table'])console[key]=()=>{};
const report={suite:'invoice-balances-dev',commit:process.argv[2],mode:process.argv[3],success:false,checks:[],startedAt:new Date().toISOString(),providerCalls:0,pdfDownloads:0};
export function parseBalanceDueDate(value){
 const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value??'').trim());if(!m)return null;
 const [,d,month,y]=m.map(Number),date=new Date(0);date.setUTCFullYear(y,month-1,d);date.setUTCHours(0,0,0,0);
 return y>=1&&date.getUTCFullYear()===y&&date.getUTCMonth()===month-1&&date.getUTCDate()===d?date:null;
}
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error(code);};
let sessionId,opened=0,closed=0,closeErrors=0;
const originalGetConnection=driver.getConnection;
driver.getConnection=async(...args)=>{const c=await originalGetConnection.apply(driver,args);opened++;c.callTimeout=60000;const close=c.close.bind(c);let done=false;c.close=async()=>{try{await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};return c;};
async function profile(connection){
 const run=async(sql,binds={})=>(await connection.execute(sql,binds,{outFormat:4002,maxRows:20})).rows;
 const meta=await connection.execute('SELECT * FROM VW_BOT_FACTURAS_SALDOS WHERE 1=0',{}, {outFormat:4002});
 const columns=meta.metaData.map(c=>c.name);report.columns=columns;report.columnTypes=meta.metaData.map(c=>({name:c.name,type:c.dbTypeName,precision:c.precision,scale:c.scale}));report.schemaContract='COD_MONEDA_DEUDA';check(!columns.includes('USER_CAN_CONSULT'),'NO_USER_CAN_CONSULT_COLUMN_ASSUMPTION');
 check(['NRO_FACTURA','SECTOR','VENCIMIENTO','COD_CLIENTE','NOM_CLIENTE','RAZON_SOCIAL','RUC','SIMBOLO_MONEDA','COD_MONEDA','DEUDA'].every(c=>columns.includes(c)),'EXPECTED_BALANCE_COLUMNS_PRESENT');
 const inventory=(await run(`SELECT COUNT(*) R,COUNT(DISTINCT NRO_FACTURA) I,
 SUM(CASE WHEN DEUDA>0 THEN 1 ELSE 0 END) P,SUM(CASE WHEN DEUDA=0 THEN 1 ELSE 0 END) Z,
 SUM(CASE WHEN DEUDA<0 THEN 1 ELSE 0 END) N,SUM(CASE WHEN DEUDA IS NULL THEN 1 ELSE 0 END) U,
 SUM(CASE WHEN VENCIMIENTO IS NULL THEN 1 ELSE 0 END) D,
 COUNT(DISTINCT SIMBOLO_MONEDA) M FROM VW_BOT_FACTURAS_SALDOS`))[0];
 report.samples={anyRows:Number(inventory.R)>0,positive:Number(inventory.P)>0,zero:Number(inventory.Z)>0,negative:Number(inventory.N)>0,nullBalance:Number(inventory.U)>0,nullDue:Number(inventory.D)>0,multipleSymbols:Number(inventory.M)>1,rowsEqualDistinctInvoiceNumbers:Number(inventory.R)===Number(inventory.I)};
 const duplicate=async(group,having)=>Number((await run(`SELECT CASE WHEN EXISTS (SELECT 1 FROM VW_BOT_FACTURAS_SALDOS WHERE NRO_FACTURA IS NOT NULL GROUP BY ${group} HAVING ${having}) THEN 1 ELSE 0 END V FROM DUAL`))[0].V)===1;
 report.granularity={repeatedInvoiceNumber:await duplicate('NRO_FACTURA','COUNT(*)>1'),
 invoiceAcrossCustomers:await duplicate('NRO_FACTURA','COUNT(DISTINCT COD_CLIENTE)>1'),
 invoiceAcrossSectors:await duplicate('NRO_FACTURA','COUNT(DISTINCT SECTOR)>1'),
 invoiceAcrossSymbols:await duplicate('NRO_FACTURA','COUNT(DISTINCT SIMBOLO_MONEDA)>1'),
 invoiceAcrossCurrencyCodes:await duplicate('NRO_FACTURA','COUNT(DISTINCT COD_MONEDA)>1'),
 repeatedCandidateKey:await duplicate('NRO_FACTURA,COD_CLIENTE,SECTOR,COD_MONEDA','COUNT(*)>1'),
 identicalVisibleRows:await duplicate('NRO_FACTURA,SECTOR,VENCIMIENTO,COD_CLIENTE,NOM_CLIENTE,RAZON_SOCIAL,RUC,COD_MONEDA,SIMBOLO_MONEDA,DEUDA','COUNT(*)>1'),
 businessKeyProven:false};
 const dates=await connection.execute('SELECT DISTINCT VENCIMIENTO FROM VW_BOT_FACTURAS_SALDOS',{}, {outFormat:4002,resultSet:true});
 let seen=0,valid=0,invalid=0,nulls=0,iso=0,complete=false;
 try{while(seen<=10000){const rows=await dates.resultSet.getRows(500);if(!rows.length){complete=true;break;}for(const r of rows){seen++;if(r.VENCIMIENTO==null||!String(r.VENCIMIENTO).trim())nulls++;else if(parseBalanceDueDate(r.VENCIMIENTO))valid++;else{invalid++;if(/^\d{4}-\d{2}-\d{2}$/.test(String(r.VENCIMIENTO).trim()))iso++;}}}}finally{await dates.resultSet.close();}
 report.dueDate={scanComplete:complete,distinctValuesCapped:!complete,validDDMMYYYYPresent:valid>0,invalidPresent:invalid>0,nullOrBlankPresent:nulls>0,isoShapePresent:iso>0,allNonBlankValidDDMMYYYY:complete&&invalid===0&&valid>0};
 const nonce=crypto.randomBytes(32);report.definition={readable:false};
 try{
  const defs=await run('SELECT TEXT FROM ALL_VIEWS WHERE VIEW_NAME=:name',{name:'VW_BOT_FACTURAS_SALDOS'});
  if(defs.length===1&&typeof defs[0].TEXT==='string'){
   const text=defs[0].TEXT;report.definition={readable:true,opaque:crypto.createHmac('sha256',nonce).update(text).digest('hex'),hasGrouping:/\bGROUP\s+BY\b/i.test(text),hasUnion:/\bUNION\b/i.test(text),mentionsNativeCurrencyKey:/\b(?:COD_MONEDA|MONEDA_ID|CURRENCY_ID)\b/i.test(text),saldoExpressionUsesSum:/\bSUM\s*\([^)]*\bSALDO\b/i.test(text),businessMeaningNotEstablished:true};
  }
 }catch(e){report.definition={readable:false,technicalCode:/^(?:ORA-\d{5}|NJS-\d{3})$/.test(e?.code??'')?e.code:'DEFINITION_UNAVAILABLE'};}
 report.currency={nativeIdentifierExposed:columns.some(c=>['COD_MONEDA','MONEDA_ID','CURRENCY_ID','ISO_CURRENCY_CODE'].includes(c)),symbolsAreNotProvenCurrencyKeys:true,conversionPerformed:false};
 report.currency.sameSymbolMultipleCodes=Number((await run("SELECT CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS_SALDOS GROUP BY SIMBOLO_MONEDA HAVING COUNT(DISTINCT COD_MONEDA)>1) THEN 1 ELSE 0 END V FROM DUAL"))[0].V)===1;
 report.currency.sameCodeMultipleSymbols=Number((await run("SELECT CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS_SALDOS GROUP BY COD_MONEDA HAVING COUNT(DISTINCT SIMBOLO_MONEDA)>1) THEN 1 ELSE 0 END V FROM DUAL"))[0].V)===1;
 report.semanticLimits=['zero balance does not prove payment','negative balance does not prove credit/refund without business contract','observed uniqueness is not a documented invoice business key'];
}
async function validate(connection){
 const run=async(sql,binds={},maxRows=101)=>(await connection.execute(sql,binds,{outFormat:4002,maxRows,fetchInfo:{DEUDA:{type:driver.STRING}}})).rows;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Asuncion',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date()),part=t=>parts.find(x=>x.type===t).value;
 const asOfDate=part('day')+'/'+part('month')+'/'+part('year'),ref=parseBalanceDueDate(asOfDate),day=d=>String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
 report.reference={asOfDate,timezone:'America/Asuncion',calendarArithmetic:'UTC calendar days after Asuncion date extraction'};
 const dateSql="CASE WHEN VALIDATE_CONVERSION(TRIM(VENCIMIENTO) AS DATE,'FXDD/MM/YYYY')=1 THEN TO_DATE(TRIM(VENCIMIENTO),'FXDD/MM/YYYY') END";
 const independentScope=args=>{
  const clauses=[],binds={};for(const[key,col]of [['customerIds','COD_CLIENTE'],['invoiceNumbers','NRO_FACTURA'],['sectors','SECTOR'],['currencies','SIMBOLO_MONEDA']])if(args[key]?.length){const list=args[key].map((v,i)=>{binds[key+i]=v;return ':'+key+i;});clauses.push(col+' IN ('+list.join(',')+')');}
  const signs={positive:'DEUDA>0',zero:'DEUDA=0',negative:'DEUDA<0',unknown:'DEUDA IS NULL'};if(signs[args.balanceStatus])clauses.push(signs[args.balanceStatus]);
  if(args.dueStatus&&args.dueStatus!=='all'){if(args.dueStatus!=='undated')binds.ref=asOfDate;const ds={overdue:dateSql+"<TO_DATE(:ref,'DD/MM/YYYY')",dueToday:dateSql+"=TO_DATE(:ref,'DD/MM/YYYY')",upcoming:dateSql+">TO_DATE(:ref,'DD/MM/YYYY')",undated:dateSql+' IS NULL'};clauses.push(ds[args.dueStatus]);}
  for(const[key,op]of [['dueDateFrom','>='],['dueDateTo','<=']])if(args[key]){binds[key]=args[key];clauses.push(dateSql+op+"TO_DATE(:"+key+",'DD/MM/YYYY')");}
  if(args.minDaysOverdue!==undefined){binds.ref=asOfDate;binds.days=args.minDaysOverdue;clauses.push("GREATEST(TO_DATE(:ref,'DD/MM/YYYY')-"+dateSql+',0)>=:days');}
  return {where:clauses.length?clauses.join(' AND '):'1=1',binds};
 };
 const reconcile=async(args,label)=>{
  const scope={rows:2,page:1,asOfDate,...args},{where,binds}=independentScope(scope);
  const count=(await run('SELECT COUNT(*) R,COUNT(DISTINCT NRO_FACTURA) I,COUNT(DISTINCT COD_CLIENTE) C FROM VW_BOT_FACTURAS_SALDOS WHERE '+where,binds))[0];
  const order=scope.orderBy==='overdueDaysDesc'?"GREATEST(TO_DATE(:sortRef,'DD/MM/YYYY')-"+dateSql+',0) DESC NULLS LAST':dateSql+' ASC NULLS LAST';
  const offset=(scope.page-1)*scope.rows,expected=await run('SELECT * FROM (SELECT v.*,ROW_NUMBER() OVER(ORDER BY '+order+',NRO_FACTURA,COD_CLIENTE,SECTOR,SIMBOLO_MONEDA,VENCIMIENTO,NOM_CLIENTE,RAZON_SOCIAL,RUC,DEUDA) RN FROM VW_BOT_FACTURAS_SALDOS v WHERE '+where+') WHERE RN>:lo AND RN<=:hi ORDER BY RN',{...binds,...(scope.orderBy==='overdueDaysDesc'?{sortRef:asOfDate}:{}),lo:offset,hi:offset+scope.rows});
  const actual=await getInvoiceBalances(scope,connection);
  check(actual.totalRows===Number(count.R)&&actual.matchedInvoiceNumbers===Number(count.I)&&actual.matchedCustomers===Number(count.C),label+'_ROWS_VS_NUMBERS_VS_CUSTOMERS');
  check(actual.returnedRows===expected.length&&actual.totalPages===Math.ceil(Number(count.R)/scope.rows)&&actual.hasMore===(scope.page<actual.totalPages),label+'_PAGINATION');
  check(expected.every((e,i)=>{const r=actual.data[i],d=parseBalanceDueDate(e.VENCIMIENTO),delta=d?(ref-d)/86400000:null,status=d?(delta>0?'overdue':delta===0?'dueToday':'upcoming'):'undated',band=d?(delta<0?'notDue':delta===0?'dueToday':delta<=30?'1-30':delta<=60?'31-60':delta<=90?'61-90':delta<=180?'91-180':'181+'):'undated';
   return r.invoiceNumber===(e.NRO_FACTURA??null)&&r.customerId===(e.COD_CLIENTE??null)&&r.sector===(e.SECTOR??null)&&r.currencySymbol===(e.SIMBOLO_MONEDA??null)&&r.balance===(e.DEUDA==null?null:String(e.DEUDA))&&r.dueStatus===status&&r.agingBand===band&&r.daysOverdue===(d?Math.max(delta,0):null);
  }),label+'_EXACT_DECIMAL_ROWS_AND_INDEPENDENT_JS_AGING');
  check(!('totalsByCurrency' in actual)&&!actual.monetaryAggregationAvailable,label+'_NO_SYMBOL_BASED_MONETARY_TOTALS');
  report.cases.push({label,hasSample:expected.length>0,passed:true});return actual;
 };
 report.cases=[];
 const chosen=(await run('SELECT COD_CLIENTE FROM (SELECT COD_CLIENTE,COUNT(*) N FROM VW_BOT_FACTURAS_SALDOS WHERE COD_CLIENTE IS NOT NULL GROUP BY COD_CLIENTE HAVING COUNT(*) BETWEEN 3 AND 60 ORDER BY N DESC,COD_CLIENTE) WHERE ROWNUM=1'))[0]?.COD_CLIENTE;
 const base=chosen?{customerIds:[chosen]}:{};
 const first=report.mode==='--validate-remaining'?null:await reconcile(base,'DETAIL_FIRST');if(report.mode!=='--validate-remaining')await reconcile({...base,page:2},'DETAIL_SECOND');
 for(const dueStatus of (report.mode==='--validate-remaining'?['undated']:['overdue','dueToday','upcoming','undated']))await reconcile({dueStatus},'DUE_'+dueStatus);
 for(const balanceStatus of ['positive','zero','negative','unknown'])await reconcile({balanceStatus},'SIGN_'+balanceStatus);
 await reconcile({dueDateFrom:asOfDate,dueDateTo:asOfDate},'ASUNCION_TODAY_INCLUSIVE');
 await reconcile({dueDateFrom:day(new Date(+ref+86400000)),dueDateTo:day(new Date(+ref+7*86400000))},'NEXT_SEVEN_DAYS');
 await reconcile({minDaysOverdue:30,orderBy:'overdueDaysDesc'},'AGING_30_DAYS');
 for(const [label,args]of [['TOTALS',{mode:'summary'}],['CUSTOMER_RANKING',{mode:'summary',groupBy:['customer'],orderBy:'balanceDesc'}],['BALANCE_ORDER',{orderBy:'balanceDesc'}]]){
  const r=await getInvoiceBalances({...args,asOfDate},connection);check(r.status==='REQUIRES_SOURCE_IDENTITY'&&!r.data&&!r.totalsByCurrency,label+'_BLOCKED_WITHOUT_NATIVE_CURRENCY_AND_INVOICE_KEYS');
 }
 const raw=(await run('SELECT * FROM VW_BOT_FACTURAS_SALDOS WHERE '+independentScope(base).where,independentScope(base).binds,1))[0];
 if(raw?.COD_CLIENTE){const found=await searchInvoiceBalanceCustomers({query:String(raw.COD_CLIENTE)},connection);const options=found.status==='RESOLVED'?[found]:found.options??[];
  check(options.some(o=>o.customerId===raw.COD_CLIENTE),'CUSTOMER_EXACT_ID_PRESENT');
  const missing='NO_MATCH_'+crypto.randomBytes(16).toString('hex');check((await searchInvoiceBalanceCustomers({query:missing},connection)).status==='NOT_FOUND','CUSTOMER_ABSENCE');
  await reconcile({customerIds:[raw.COD_CLIENTE]},'FRESH_HTTP_SCOPE');await httpValidation(raw,asOfDate,first);
 }else report.missingHttpCustomerSample=true;
 const src=fs.readFileSync(new URL('../src/repositories/invoices/invoiceBalances.repository.js',import.meta.url),'utf8'),conversion=/const dueDateSql=`([\s\S]*?)`;/m.exec(src)?.[1];check(Boolean(conversion),'ACTUAL_DATE_EXPRESSION_AVAILABLE');
 const dateCases=[null,'','31/02/2026','29/02/2024','29/02/2025','01/13/2026','01/01/0000','2026-11-12'];
 for(const value of dateCases){const result=(await run('SELECT TO_CHAR(('+conversion.replaceAll('VENCIMIENTO',':v')+"),'DD/MM/YYYY') D FROM DUAL",{v:value}))[0].D;check((result??null)===(parseBalanceDueDate(value)?day(parseBalanceDueDate(value)):null),'NULL_INVALID_LEAP_DATE_CONVERSION_'+dateCases.indexOf(value));}
 report.missingSamples=report.cases.filter(c=>!c.hasSample).map(c=>c.label);
 report.semanticReservations=['native currency identity unavailable; totals and monetary rankings blocked','invoice business key not proven; only rows and distinct number strings counted','zero/negative accounting meaning not established','real permission-denied identity not supplied; injected denial only'];
}

async function httpValidation(raw,asOfDate){
 const executor=await import('../src/services/ai/toolExecutor.service.js'),context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
 const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
 async function load(path,overrides={}){const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
 const directPii={customerId:raw.COD_CLIENTE,customerName:raw.NOM_CLIENTE,businessName:raw.RAZON_SOCIAL,taxId:raw.RUC,invoiceNumber:raw.NRO_FACTURA},protectedPii=protectPiiDeep(sessionId,directPii);
 check(Object.entries(directPii).every(([k,v])=>v==null||String(v).trim()===''||/^\[PII_/.test(protectedPii[k])),'REAL_FIELDS_PSEUDONYMIZED');
 let stage=0,modelCalls=0,injectDenied=false,httpCalls=0;const calls=[];
 const sdk={BedrockRuntimeClient:class{async send(command){modelCalls++;const messages=command.input.messages,serialized=JSON.stringify(messages);
  for(const value of Object.values(directPii).filter(v=>typeof v==='string'&&v.length>=6))check(!serialized.includes(value),'MODEL_INPUT_NO_RAW_PII_'+modelCalls);
  if(stage++===0)return {output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'balance-lookup',name:'search_invoice_balance_customers',input:{query:protectPiiValue(sessionId,'CUSTOMER_ID',raw.COD_CLIENTE)}}}]}},stopReason:'tool_use'};
  const lookup=messages.flatMap(m=>m.content??[]).map(b=>b.toolResult?.content?.find(c=>c.json)?.json).filter(Boolean).at(-1),id=lookup?.customerId??lookup?.options?.[0]?.customerId??protectedPii.customerId;
  return {output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'balance-detail-'+modelCalls,name:'get_invoice_balances',input:{customerIds:[id],asOfDate,rows:2}}}]}},stopReason:'tool_use'};
 }},ConverseCommand:class{constructor(input){this.input=input;}}};
 const wrapped=async req=>{check(req.context.sessionId===sessionId,'HTTP_TOOL_USES_OWNED_SESSION_ID');
  if(injectDenied){const get=driver.getConnection;driver.getConnection=async(...args)=>{const c=await get(...args);c.execute=async()=>{throw Object.assign(Error('INJECTED_DENIAL'),{errorNum:1031});};return c;};try{return await executor.executeTool(req);}finally{driver.getConnection=get;}}
  const result=await executor.executeTool(req);calls.push({name:req.name,input:req.arguments,result});return result;};
 const chat=await load('../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':{executeTool:wrapped}}),controller=await load('../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat}),router=await load('../src/routes/index.js',{'../controllers/chat.controller.js':controller});
 const app=express();app.use(express.json());app.use('/chatbot/api',router.router);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const post=async(message,id=sessionId)=>{httpCalls++;const response=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,message,username:'UNTRUSTED_FRONTEND'})});return {status:response.status,body:await response.json()};};
 try{
  store.clearConversation(sessionId);
  const denied=await post('Consulta saldos',crypto.randomUUID());check(denied.status===404&&modelCalls===0,'INVALID_SESSION_REJECTED_BEFORE_MODEL_OR_ORACLE');
  const result=await post('Consulta el saldo del local '+String(raw.NOM_CLIENTE??raw.COD_CLIENTE));check(result.status===200&&result.body.success,'REAL_HTTP_BALANCE_CONTRACT');
  const detail=calls.find(c=>c.name==='get_invoice_balances')?.result;check(detail?.data.length>0,'REAL_HTTP_HAS_AUTHORIZED_DETAIL');
  const escape=v=>String(v??'Sin datos').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');
  check(detail.data.every(r=>result.body.response.includes(escape(r.invoiceNumber))&&result.body.response.includes(escape(r.customerName))),'AUTHORIZED_IDENTITIES_RESTORED_IN_FINAL_RESPONSE');
  const history=JSON.stringify(store.getConversation(sessionId));for(const value of Object.values(directPii).filter(v=>typeof v==='string'&&v.length>=6))check(!history.includes(value),'HISTORY_NO_RAW_PII');
  const before=modelCalls;if(detail.hasMore){const next=await post('Siguiente página');check(next.status===200&&modelCalls===before,'REAL_HTTP_PAGINATION_WITHOUT_MODEL');}else report.httpNextPageMissing=true;
  injectDenied=true;const d=await post('Consulta nuevamente el saldo');check(d.status===200&&d.body.response==='El usuario no tiene permisos para consultar esta información.'&&Object.keys(d.body.actions??{}).length===0,'INJECTED_ORACLE_DENIAL_NO_DATA_OR_ACTIONS');
  report.http={requests:httpCalls,controlledSdkCalls:modelCalls,realProviderCalls:0,denialEvidence:'injected ORA-01031 on real proxy connection; not a real denied account',modelAndHistoryProtected:true,authorizedFinalIdentityRestored:true};
 }finally{store.clearConversation(sessionId);clearPiiSession(sessionId);await new Promise(resolve=>server.close(resolve));report.httpCleanup={serverClosed:!server.listening,ownConversationCleared:true};}
}

try{
 check(config.env==='development'&&!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,'SAFE_DEV_CONFIGURATION');
 if(report.mode==='--preflight'){report.success=true;}
 else{
  let raw='';for await(const c of process.stdin){raw+=c;if(raw.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(raw).sessionId;raw='';check(/^[a-f0-9-]{36}$/i.test(sessionId??''),'OWNED_LOGIN_SESSION_REQUIRED');
  const owned=await getValidOracleSession(sessionId);
  await withOracleProxySession(sessionId,async({connection})=>{
   const id=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','SESSION_USER') S,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{}, {outFormat:4002})).rows[0],norm=v=>String(v??'').trim().toUpperCase();
   check(norm(id.U)===norm(owned.username)&&norm(id.S)===norm(owned.username)&&Boolean(id.P),'SESSION_ID_RESOLVES_POSTGRES_ORACLE_PROXY_IDENTITY');
   if(report.mode==='--profile')await profile(connection);else if(['--validate','--validate-remaining'].includes(report.mode))await validate(connection);else throw Error('VALIDATION_MODE_NOT_PREPARED');
  });report.success=true;
 }
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'BALANCE_DEV_CONTROL_FAILED'};}
finally{driver.getConnection=originalGetConnection;await closeOracleSessionsPool();report.cleanup={driverRestored:driver.getConnection===originalGetConnection,opened,closed,closeErrors,allConnectionsClosed:opened===closed&&!closeErrors,postgresPoolClosed:true};if(!report.cleanup.allConnectionsClosed)report.success=false;sessionId=null;}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
