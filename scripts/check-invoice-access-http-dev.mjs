// Focused authorization HTTP controls. Business rows, IDs, URLs and credentials stay in memory.
import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import express from 'express';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const root=new URL('../',import.meta.url),app=p=>import(new URL(p,root));
const {default:config}=await app('config.js');const sessions=await app('src/services/sessions/oracleSession.service.js');const {executeTool}=await app('src/services/ai/toolExecutor.service.js');const store=await app('src/state/conversation.store.js');const {restorePiiDeep,protectPiiDeep}=await app('src/services/ai/pii.service.js');const {default:driver}=await import('oracledb');
const report={suite:'invoice-access-http-dev',commit:process.argv[2],success:false,checks:[],startedAt:new Date().toISOString(),scope:'bounded HTTP controls with real candidate router/controller/chat/services/repositories and independent Oracle SELECTs; controlled SDK supplies tool arguments; not model-real or deployed-5400 evidence'};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CONTROL_FAILED');},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''),near=(a,b)=>a===b||a!=null&&b!=null&&Math.abs(Number(a)-Number(b))<.000001;
let plans=[],sessionId,server,calls=[],sqlCalls=[],active=false,opened=0,closed=0,closeErrors=0,modelCalls=0,httpCalls=0;
const connect=driver.getConnection.bind(driver);driver.getConnection=async(...a)=>{const c=await connect(...a);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);let done=false;c.execute=async(...args)=>{if(active&&args[0]?.includes('VW_BOT_FACTURAS'))sqlCalls.push({sql:args[0],binds:structuredClone(args[1])});return execute(...args);};c.close=async()=>{try{await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};return c;};
const query=(sql,binds={})=>sessions.withOracleProxySession(sessionId,async({connection})=>{if(!/^\s*SELECT\b/i.test(sql))throw Error();const rows=(await connection.execute(sql,binds,{outFormat:4002,maxRows:1001})).rows;if(rows.length>1000)throw Error();return rows;});
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});const synthetic=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,root),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;const input=plans.shift();return input?{stopReason:'tool_use',output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'access-'+modelCalls,name:'get_invoices',input:protectPiiDeep(sessionId,input)}}]}}}:{stopReason:'end_turn',output:{message:{role:'assistant',content:[{text:'Resumen de registros autorizados.'}]}}};}},ConverseCommand:class{}};
const chat=await load('src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':{async executeTool(req){if(!['search_invoice_concepts','search_invoice_customers','get_invoices'].includes(req.name)||req.context.sessionId!==sessionId)throw Error('TOOL_OUT_OF_SCOPE');active=req.name==='get_invoices';try{const result=await executeTool(req);calls.push({name:req.name,args:structuredClone(req.arguments),result});return result;}catch(e){calls.push({name:req.name,args:structuredClone(req.arguments),errorCode:e.code});throw e;}finally{active=false;}}}});
const controller=await load('src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat});const router=await load('src/routes/index.js',{'../controllers/chat.controller.js':controller});
const currency=v=>['PYG','GS','GS.','GUARANI','GUARANIES'].includes(String(v??'').trim().toUpperCase())?'\u20b2':v;
const dateString=d=>String(d).slice(6,8)+'/'+String(d).slice(4,6)+'/'+String(d).slice(0,4);
const scoped=sample=>sample?{customerIds:[String(sample.C)],conceptIds:[String(sample.K)],dateFrom:dateString(sample.D),dateTo:dateString(sample.D)}:{};
function oracleFilter(args){const parts=[],binds={};
 if(args.customerIds){parts.push('COD_CLIENTE=:c');binds.c=args.customerIds[0];}if(args.conceptIds){parts.push('COD_CONCEPTO=:k');binds.k=args.conceptIds[0];}
 if(args.dateFrom){parts.push("FECHA_EMISION>=TO_DATE(:f,'DD/MM/YYYY')");binds.f=args.dateFrom;}if(args.dateTo){parts.push("FECHA_EMISION<TO_DATE(:t,'DD/MM/YYYY')+1");binds.t=args.dateTo;}
 return {where:parts.length?parts.join(' AND '):'1=1',binds};
}
async function reconcile(kind,args){
 const {where,binds}=oracleFilter(args),allowed="NVL(USER_CAN_CONSULT,'S')<>'N' AND "+where;
 const counts=(await query("SELECT COUNT(*) A,COUNT(DISTINCT NRO_FACTURA) I FROM VW_BOT_FACTURAS WHERE "+allowed,binds))[0];
 const denied=(await query("SELECT CASE WHEN EXISTS (SELECT 1 FROM VW_BOT_FACTURAS WHERE USER_CAN_CONSULT='N' AND "+where+") THEN 1 ELSE 0 END D FROM DUAL",binds))[0].D===1;
 check(kind==='restricted'?Number(counts.A)===0&&denied:kind==='mixed'?Number(counts.A)>0&&denied:kind==='permitted'?Number(counts.A)>0&&!denied:Number(counts.A)===0&&!denied,kind+'_INDEPENDENT_SCOPE_CLASSIFICATION');
 const start=calls.length;plans=[args];store.clearConversation(sessionId);
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message:'Consulta las facturas solicitadas',username:'IGNORED_FRONTEND_IDENTITY'}),signal:AbortSignal.timeout(120000)});httpCalls++;const body=await response.json();
 check(response.status===200&&body.env==='development'&&body.success===true,kind+'_'+args.mode+'_HTTP_CONTRACT');
 const call=calls[start];check(calls.length===start+1&&call.name==='get_invoices'&&same(call.args,args),kind+'_'+args.mode+'_FINAL_ARGUMENTS_SESSION_SCOPED');
 if(kind==='restricted'){
  check(call.errorCode==='ACCESS_DENIED'&&/no tiene permisos/i.test(body.response)&&!/(?:Ver PDF|https?:|\| )/.test(body.response)&&Object.keys(body.actions??{}).length===0,kind+'_'+args.mode+'_NO_DATA_LINKS_ACTIONS_AND_EXPLICIT_DENIAL');return;
 }
 check(!call.errorCode&&Boolean(call.result.hasRestrictedData)===denied,kind+'_'+args.mode+'_PERMISSION_BIT_MATCHES_ORACLE');
 check(kind==='mixed'?/No est\u00e1 autorizado a consultar parte/.test(body.response):!/no tiene permisos|No est\u00e1 autorizado/i.test(body.response),kind+'_'+args.mode+'_PARTIAL_WARNING_OR_TRUE_ABSENCE');
 if(args.mode==='summary'){
  const expected=await query('SELECT SIMBOLO_MONEDA C,SUM(IMPORTE) A,COUNT(DISTINCT NRO_FACTURA) I FROM VW_BOT_FACTURAS WHERE '+allowed+' GROUP BY SIMBOLO_MONEDA ORDER BY SIMBOLO_MONEDA',binds);
  const actual=Array.isArray(call.result.data)?call.result.data:[call.result];
  check(expected.length===actual.length&&expected.every((r,i)=>currency(r.C)===actual[i].currencySymbol&&near(r.A,actual[i].totalAmount)&&Number(r.I)===actual[i].invoiceCount),kind+'_SUMMARY_TOTALS_AND_DISTINCT_INVOICES_AUTHORIZED_ONLY');return;
 }
 const page=args.page??1,rows=args.rows??2,expected=await query('SELECT * FROM (SELECT NRO_FACTURA N,NOM_CLIENTE C,DES_CONCEPTO K,IMPORTE A,PDF D,ROW_NUMBER() OVER (ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC,COD_CONCEPTO) RN FROM VW_BOT_FACTURAS WHERE '+allowed+') WHERE RN>:o AND RN<=:m ORDER BY RN',{...binds,o:(page-1)*rows,m:page*rows});
 const result=call.result,p=body.actions?.invoicePagination;
 check(result.totalRows===Number(counts.A)&&result.totalInvoices===Number(counts.I)&&result.data.length===expected.length&&result.data.every((r,i)=>r.invoiceNumber===expected[i].N&&r.customer.name===expected[i].C&&r.concept.description===expected[i].K&&near(r.amount,expected[i].A)),kind+'_DETAIL_ROWS_AND_COUNTS_AUTHORIZED_ONLY');
 check(p?.page===page&&p.rows===rows&&p.totalRows===Number(counts.A)&&p.totalInvoices===Number(counts.I)&&p.totalPages===Math.ceil(Number(counts.A)/rows)&&p.hasMore===(page<Math.ceil(Number(counts.A)/rows))&&p.returnedRows===expected.length,kind+'_PAGINATION_EXCLUDES_RESTRICTED');
 const base=String(config.urlEndPointDePdf??'').replace(/\/+$/,'');let links=0;
 check(expected.every((r,i)=>{const url=r.D&&base?base+'/'+String(r.D).replace(/^\/+/,''):null;if(result.data[i].pdfUrl!==url)return false;if(url){links++;return body.response.includes('[Ver PDF](<'+url.replace(/[\s<>"|\\]/g,c=>encodeURIComponent(c))+'>)');}return true;})&&(body.response.match(/\[Ver PDF\]/g)??[]).length===links&&(body.response.match(/^\| /gm)??[]).length===(expected.length?expected.length+2:0),kind+'_ONLY_AUTHORIZED_ROWS_AND_PDF_LINKS_RENDERED');
 if(kind==='absent')check(/No se encontraron registros/.test(body.response),'ABSENCE_IS_NOT_DENIAL');
}
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads&&/^[a-f0-9]{40}$/.test(report.commit??''),'SAFE_COMMITTED_DEV');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({suite:report.suite,commit:report.commit,success:true}));process.exit(0);}
 let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error();}sessionId=JSON.parse(input).sessionId;input='';if(!/^[a-f0-9-]{36}$/i.test(sessionId??''))throw Error();
 const application=express();application.use(express.json());application.use('/chatbot/api',router.router);server=await new Promise(resolve=>{const x=application.listen(0,'127.0.0.1',()=>resolve(x));});
 // Metadata for existing scopes stays in memory; no restricted invoice/PDF rows are selected.
 const group="COD_CLIENTE,COD_CONCEPTO,TO_CHAR(FECHA_EMISION,'YYYYMMDD')";
 const base="FROM VW_BOT_FACTURAS WHERE COD_CLIENTE IS NOT NULL AND COD_CONCEPTO IS NOT NULL AND FECHA_EMISION IS NOT NULL GROUP BY "+group;
 const restricted=(await query("SELECT * FROM (SELECT COD_CLIENTE C,COD_CONCEPTO K,TO_CHAR(FECHA_EMISION,'YYYYMMDD') D "+base+" HAVING SUM(CASE WHEN NVL(USER_CAN_CONSULT,'S')<>'N' THEN 1 ELSE 0 END)=0) WHERE ROWNUM<=1"))[0];
 const permitted=(await query("SELECT * FROM (SELECT COD_CLIENTE C,COD_CONCEPTO K,TO_CHAR(FECHA_EMISION,'YYYYMMDD') D "+base+" HAVING SUM(CASE WHEN USER_CAN_CONSULT='N' THEN 1 ELSE 0 END)=0) WHERE ROWNUM<=1"))[0];
 const mixedYear=(await query("SELECT * FROM (SELECT TO_CHAR(FECHA_EMISION,'YYYY') Y FROM VW_BOT_FACTURAS WHERE FECHA_EMISION IS NOT NULL GROUP BY TO_CHAR(FECHA_EMISION,'YYYY') HAVING SUM(CASE WHEN USER_CAN_CONSULT='N' THEN 1 ELSE 0 END)>0 AND SUM(CASE WHEN NVL(USER_CAN_CONSULT,'S')<>'N' THEN 1 ELSE 0 END)>0) WHERE ROWNUM<=1"))[0];
 report.samples={restricted:{available:Boolean(restricted),discovery:'customer/concept/day scopes with no authorized rows'},permitted:{available:Boolean(permitted)},mixed:{available:Boolean(mixedYear),discovery:'year scopes with both permission classes'}};
 for(const [kind,scope]of [['restricted',restricted&&scoped(restricted)],['permitted',permitted&&scoped(permitted)],['mixed',mixedYear&&{dateFrom:'01/01/'+mixedYear.Y,dateTo:'31/12/'+mixedYear.Y}]]){
  if(!scope)continue;
  await reconcile(kind,{...scope,mode:'detail',page:1,rows:2});
  if(kind==='mixed')await reconcile(kind,{...scope,mode:'detail',page:2,rows:2});
  await reconcile(kind,{...scope,mode:'summary'});
 }
 await reconcile('absent',{dateFrom:'01/01/9999',dateTo:'01/01/9999',mode:'detail',page:1,rows:2});
 check(opened===closed&&!closeErrors,'ALL_ORACLE_CONNECTIONS_CLOSED');report.success=true;
}catch(e){report.error={code:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'INVOICE_ACCESS_HTTP_CONTROL_FAILED'};}
finally{if(server)await new Promise(resolve=>server.close(resolve));if(sessionId)store.clearConversation(sessionId);sessionId=null;report.serverClosed=!server||!server.listening;report.connectionsClosed=opened===closed&&!closeErrors;if(!report.connectionsClosed||!report.serverClosed)report.success=false;}
report.httpConversationRequests=httpCalls;report.controlledModelCalls=modelCalls;report.realModelCalls=0;report.providerCalls=0;report.pdfDownloads=0;report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
