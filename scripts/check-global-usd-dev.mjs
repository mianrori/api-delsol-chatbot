// Isolated candidate HTTP + independent Oracle; results and identities stay in memory.
import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import express from 'express';import driver from 'oracledb';
import config from '../config.js';import * as store from '../src/state/conversation.store.js';import {restorePiiDeep} from '../src/services/ai/pii.service.js';import {trimConversation} from '../src/services/ai/conversation.service.js';
import {getValidOracleSession,withOracleProxySession} from '../src/services/sessions/oracleSession.service.js';import {closeOracleSessionsPool} from '../src/database/oracleSessions.database.js';import {invoiceCell} from '../src/services/ai/invoicePresentation.service.js';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'global-usd-candidate',commit:process.argv[2],success:false,checks:[],startedAt:new Date().toISOString(),noDeployment:true};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error(code);};
let sessionId,server,opened=0,closed=0,closeErrors=0,modelCalls=0;const calls=[],queries=[];
const original=driver.getConnection;driver.getConnection=async(...args)=>{const c=await original.apply(driver,args);opened++;c.callTimeout=60000;const execute=c.execute.bind(c),close=c.close.bind(c);c.execute=async(sql,binds,options)=>{check(/^\s*(SELECT|WITH)\b/i.test(sql),'READ_ONLY');queries.push({sql,binds});return execute(sql,binds,options);};c.close=async()=>{try{await close();closed++;}catch(e){closeErrors++;throw e;}};return c;};
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const executor=await import('../src/services/ai/toolExecutor.service.js');
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;throw Error('MODEL_BLOCKED');}},ConverseCommand:class{}};
const chat=await load('../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':{async executeTool(request){const result=await executor.executeTool(request);calls.push({name:request.name,input:request.arguments,result});return result;}}});
const controller=await load('../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat}),router=await load('../src/routes/index.js',{'../controllers/chat.controller.js':controller});
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'SAFE_DEV');
 let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(raw).sessionId;raw='';
 const owned=await getValidOracleSession(sessionId),expiration=String(owned.expires_at);
 const app=express();app.use(express.json());app.use('/chatbot/api',router.router);server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 let requestCount=0;
 const post=async message=>{const start=calls.length;const r=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,username:'IGNORED'}),signal:AbortSignal.timeout(60000)});requestCount++;const body=await r.json();check(r.status===200&&body.success,'HTTP_'+requestCount);check(Object.keys(body.actions??{}).length===0,'NO_GENERAL_ACTIONS');check(!/\[PII_|<think>|<analysis>|₮|≈|aproximad/i.test(body.response),'PUBLIC_OUTPUT');return {body,calls:calls.slice(start)};};
 const first=await post('Deudas pendientes total de todos los clientes por monedas hasta la fecha');
 check(first.calls.length===1&&first.calls[0].name==='get_invoice_balances','ONE_GLOBAL_SUMMARY_NO_CLIENT_FANOUT');
 const initial=first.calls[0];check(initial.input.customerIds.length===0&&initial.input.debtStatus==='pending'&&initial.input.mode==='summary'&&!initial.input.dueDateTo&&!initial.input.dueStatus,'GLOBAL_CURRENT_PENDING_NO_DUE_FILTER');
 report.summaryStatus=initial.result.status;
 if(initial.result.status==='INCONSISTENT_HISTORY')check(first.body.response.includes('total confiable')&&!first.body.response.includes('| Deuda'),'SUMMARY_INTEGRITY_BLOCK_VISIBLE');
 if(process.argv.includes('--summary-only')){
  report.summaryOnly=true;check(initial.result.status==='OK_SUMMARY','CLEAN_SUMMARY_OBSERVED');
  await withOracleProxySession(sessionId,async({connection,username})=>{
   const run=async sql=>(await connection.execute(sql,{},{outFormat:4002,maxRows:201})).rows;
   const identity=(await run("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL"))[0];check(identity.U===owned.username&&username===owned.username&&Boolean(identity.P),'SUMMARY_PROXY_IDENTITY');
   const catalogue=await run('SELECT DISTINCT COD_MONEDA,SIMBOLO_MONEDA FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA>0 AND COD_MONEDA IS NOT NULL');
   check(catalogue.length<=200,'COMPLETE_VISIBLE_CATALOGUE');
   for(const row of initial.result.data){const labels=catalogue.filter(c=>c.COD_MONEDA===row.currencyCode).map(c=>String(c.SIMBOLO_MONEDA??'').trim().toUpperCase());
    if(labels.some(label=>['USD','US$','U$S'].includes(label))){check(row.currencySymbol==='USD'&&first.body.response.includes('| USD |'),'SUMMARY_USD_FROM_INDEPENDENT_NATIVE_CODE');report.usdLabelObserved=true;}
    if(labels.some(label=>['PYG','GS','GS.','₲'].includes(label)))check(row.currencySymbol==='PYG'&&first.body.response.includes('| Gs. |'),'SUMMARY_PYG_FROM_INDEPENDENT_NATIVE_CODE');
   }
   check(report.usdLabelObserved,'REAL_USD_SUMMARY_LABEL');
  });
 }else{
 const detail=await post('Detalla las que son en dólares');
 const currency=detail.calls.find(c=>c.name==='resolve_invoice_balance_currency');report.currencyResolution=currency?.result?.status;
 check(currency?.result?.status==='RESOLVED','USD_CODE_AUTHORIZED');const code=currency.result.currencyCode;
 check(detail.calls.length===2&&detail.calls[1].name==='get_invoice_balances','ONE_CATALOGUE_AND_ONE_GLOBAL_DETAIL');
 const pages=[detail];if(detail.calls[1].result.hasMore)pages.push(await post('Siguiente página'));
 const history=store.getConversation(sessionId);for(let i=0;i<12;i++)history.push({role:'user',content:[{text:'Tema independiente '+i}]},{role:'assistant',content:[{text:'Recibido.'}]});store.setConversation(sessionId,trimConversation(history,10));
 check(!JSON.stringify(store.getConversation(sessionId)).includes('toolUse'),'ACTUAL_HISTORY_TRIM');
 const cursor=store.getInvoiceBalancePageState(sessionId);if(cursor?.hasMore)pages.push(await post('Siguiente página'));report.pageCount=pages.length;
 await withOracleProxySession(sessionId,async({connection,username})=>{
  const run=async(sql,binds={})=>(await connection.execute(sql,binds,{outFormat:4002,maxRows:201,fetchInfo:{DEUDA:{type:driver.STRING}}})).rows;
  const identity=(await run("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL"))[0];check(identity.U===owned.username&&username===owned.username&&Boolean(identity.P),'SAME_POSTGRES_ORACLE_PROXY_IDENTITY');
  const labels=await run('SELECT DISTINCT COD_MONEDA,SIMBOLO_MONEDA FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA>0 AND COD_MONEDA=:code',{code});check(labels.length>0&&labels.some(row=>['USD','US$','U$S'].includes(String(row.SIMBOLO_MONEDA).trim().toUpperCase())||String(row.COD_MONEDA).trim().toUpperCase()==='USD'),'INDEPENDENT_USD_IDENTITY');
  const count=Number((await run('SELECT COUNT(*) N FROM VW_BOT_FACTURAS_SALDOS WHERE DEUDA>0 AND COD_MONEDA=:code',{code}))[0].N);
  const date="CASE WHEN VALIDATE_CONVERSION(TRIM(VENCIMIENTO) AS DATE,'FXDD/MM/YYYY')=1 THEN TO_DATE(TRIM(VENCIMIENTO),'FXDD/MM/YYYY') END";
  for(const entry of pages){const c=entry.calls.at(-1),r=c.result,page=c.input.page??1;
   check(c.name==='get_invoice_balances'&&c.input.customerIds?.length===0&&c.input.debtStatus==='pending'&&c.input.mode==='detail'&&c.input.currencyCodes?.length===1&&c.input.currencyCodes[0]===code&&c.input.groupBy?.length===0,'PRESERVED_GLOBAL_USD_DETAIL_CONTEXT');
   check(!c.input.dueDateFrom&&!c.input.dueDateTo&&(!c.input.dueStatus||c.input.dueStatus==='all'),'NO_INFERRED_DUE_FILTER');
   const expected=await run(`SELECT * FROM (SELECT v.*,${date} CONTROL_DUE_DATE,ROW_NUMBER() OVER(ORDER BY ${date} ASC NULLS LAST,SERIE_FACTURA,NRO_FACTURA,COD_CLIENTE,SECTOR,COD_MONEDA,SIMBOLO_MONEDA,VENCIMIENTO,NOM_CLIENTE,RAZON_SOCIAL,RUC,DEUDA) RN FROM VW_BOT_FACTURAS_SALDOS v WHERE DEUDA>0 AND COD_MONEDA=:code) WHERE RN>:offset AND RN<=:last ORDER BY RN`,{code,offset:(page-1)*r.rows,last:page*r.rows});
   check(r.totalRows===count&&r.data.length===expected.length&&r.totalPages===Math.ceil(count/r.rows)&&r.hasMore===(page<Math.ceil(count/r.rows)),'INDEPENDENT_COUNTS_AND_PAGINATION');
   const table=entry.body.response.split('\n').filter(line=>line.startsWith('| '));check(table.length===(expected.length?expected.length+2:0),'ALL_PRESENTED_ROWS');
   for(let i=0;i<expected.length;i++){const d=r.data[i],e=expected[i];check(d.invoiceSeries===(e.SERIE_FACTURA??null)&&d.invoiceNumber===(e.NRO_FACTURA??null)&&d.customerId===(e.COD_CLIENTE??null)&&d.currencyCode===e.COD_MONEDA&&d.debt===String(e.DEUDA)&&Number(d.debt)>0,'INDEPENDENT_IDENTIFIERS_CURRENCY_EXACT_DEBT');
    const cells=table[i+2].split(/(?<!\\)\|/).slice(1,-1).map(v=>v.trim()),headers=table[0].split('|').slice(1,-1).map(v=>v.trim()),at=name=>cells[headers.indexOf(name)];
    check(at('Serie')===invoiceCell(d.invoiceSeries)&&at('Número')===invoiceCell(d.invoiceNumber)&&at('Cliente')===invoiceCell(d.customerName??d.businessName)&&at('Moneda')==='USD','EXACT_COMMERCIAL_ROW_PRESENTATION');
    if(/^\./.test(String(e.DEUDA)))report.sourceDecimalWithoutIntegerPartObserved=true;
    const [whole,fraction='']=String(e.DEUDA).split('.'),amount=(whole||'0').replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+fraction.padEnd(2,'0');check(at('Deuda')===amount,'PRESENTED_DECIMAL_EXACTNESS');
   }
   if(r.duplicateRows>0)check(entry.body.response.includes('históricos duplicados')&&r.invoiceCount===null,'DUPLICATES_RETAINED_AND_TOTAL_BLOCKED');
   const state=restorePiiDeep(sessionId,store.getSearchResolutions(sessionId));check(state.contexts.get_invoice_balances.customerIds.length===0&&state.contexts.get_invoice_balances.currencyCodes[0]===code,'PERSISTED_SCOPE_AFTER_PAGE');
   const saved=JSON.stringify(store.getConversation(sessionId).filter(m=>m.role==='assistant'));check(r.data.every(d=>!d.customerName||d.customerName.length<=3||!saved.includes(d.customerName)),'PII_PROTECTED_HISTORY');
  }
 });
 }
 check(modelCalls===0,'ZERO_MODEL_OR_PROVIDER_ATTEMPTS');check(String((await getValidOracleSession(sessionId)).expires_at)===expiration,'SESSION_EXPIRATION_UNCHANGED');
 report.http={requests:requestCount,usual5400:false,candidateEphemeral:true,resultsSimulated:false,contextSeeded:false};report.success=true;
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^ORA-\d{5}$/.test(e?.code??'')?e.code:'GLOBAL_USD_CONTROL_FAILED'};}
finally{if(server)await new Promise(resolve=>server.close(resolve));if(sessionId)store.clearConversation(sessionId);driver.getConnection=original;await closeOracleSessionsPool();report.cleanup={opened,closed,closeErrors,allConnectionsClosed:opened===closed&&!closeErrors,driverRestored:driver.getConnection===original,serverClosed:!server?.listening,ownConversationCleared:true,postgresPoolClosed:true};if(!report.cleanup.allConnectionsClosed)report.success=false;report.modelCalls=modelCalls;report.realProviderCalls=0;report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;}
