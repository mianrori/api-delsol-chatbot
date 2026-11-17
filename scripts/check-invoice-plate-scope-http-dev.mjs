// Focused authorization HTTP controls. Business rows, IDs, URLs and credentials stay in memory.
import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import express from 'express';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const root=new URL('../',import.meta.url),app=p=>import(new URL(p,root));
const {default:config}=await app('config.js');const sessions=await app('src/services/sessions/oracleSession.service.js');const {executeTool}=await app('src/services/ai/toolExecutor.service.js');const store=await app('src/state/conversation.store.js');const {restorePiiDeep,protectPiiDeep}=await app('src/services/ai/pii.service.js');const {default:driver}=await import('oracledb');
const report={suite:'invoice-plate-scope-http-dev',commit:process.argv[2],success:false,checks:[],startedAt:new Date().toISOString(),scope:'two real HTTP sequences over isolated candidate and real session/proxy Oracle; typed deterministic route; SDK rejects invocation; no real model or deployed-5400 claim'};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CONTROL_FAILED');},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''),near=(a,b)=>a===b||a!=null&&b!=null&&Math.abs(Number(a)-Number(b))<.000001;
let plans=[],sessionId,server,calls=[],sqlCalls=[],active=false,opened=0,closed=0,closeErrors=0,modelCalls=0,httpCalls=0;
const connect=driver.getConnection.bind(driver);driver.getConnection=async(...a)=>{const c=await connect(...a);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);let done=false;c.execute=async(...args)=>{if(active&&args[0]?.includes('VW_BOT_FACTURAS'))sqlCalls.push({sql:args[0],binds:structuredClone(args[1])});return execute(...args);};c.close=async()=>{try{await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};return c;};
const query=(sql,binds={})=>sessions.withOracleProxySession(sessionId,async({connection})=>{if(!/^\s*SELECT\b/i.test(sql))throw Error();const rows=(await connection.execute(sql,binds,{outFormat:4002,maxRows:1001})).rows;if(rows.length>1000)throw Error();return rows;});
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});const synthetic=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,root),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;throw Error('REMOTE_MODEL_NOT_ALLOWED');}},ConverseCommand:class{}};
const chat=await load('src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':{async executeTool(req){if(!['search_invoice_concepts','search_invoice_customers','get_invoices'].includes(req.name)||req.context.sessionId!==sessionId)throw Error('TOOL_OUT_OF_SCOPE');active=req.name==='get_invoices';try{const result=await executeTool(req);calls.push({name:req.name,args:structuredClone(req.arguments),result});return result;}catch(e){calls.push({name:req.name,args:structuredClone(req.arguments),errorCode:e.code});throw e;}finally{active=false;}}}});
const controller=await load('src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat});const router=await load('src/routes/index.js',{'../controllers/chat.controller.js':controller});
const {trimConversation}=await app('src/services/ai/conversation.service.js');
const {normalizeInvoicePlate}=await app('src/utils/invoicePlate.js');
const clean=c=>"REGEXP_REPLACE(TRANSLATE(UPPER("+c+"),'\u00c1\u00c9\u00cd\u00d3\u00da\u00dc\u00d1','AEIOUUN'),'[^A-Z0-9]','')";
function filter(args){const clauses=[],binds={};for(const [key,col,b]of [['customerIds','COD_CLIENTE','c'],['conceptIds','COD_CONCEPTO','k']])if(args[key]){clauses.push(col+'=:'+b);binds[b]=args[key][0];}
 if(args.dateFrom){clauses.push("FECHA_EMISION>=TO_DATE(:f,'DD/MM/YYYY')");binds.f=args.dateFrom;}if(args.dateTo){clauses.push("FECHA_EMISION<TO_DATE(:t,'DD/MM/YYYY')+1");binds.t=args.dateTo;}
 if(args.plate){clauses.push("REGEXP_REPLACE(UPPER(MATRICULA),'[-[:space:]]','')=:p");binds.p=normalizeInvoicePlate(args.plate);}
 return {where:clauses.length?clauses.join(' AND '):'1=1',binds};
}
async function classify(where,binds){const a=(await query("SELECT COUNT(*) R,COUNT(DISTINCT NRO_FACTURA) I FROM VW_BOT_FACTURAS WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND "+where,binds))[0];const n=(await query("SELECT CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS WHERE USER_CAN_CONSULT='N' AND "+where+") THEN 1 ELSE 0 END D FROM DUAL",binds))[0];return {authorized:Number(a.R),invoices:Number(a.I),restricted:Number(n.D)===1,kind:Number(a.R)>0?(Number(n.D)===1?'MIXED':'AUTHORIZED'):(Number(n.D)===1?'RESTRICTED':'ABSENT')};}
async function post(message){const start=calls.length;const response=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,username:'IGNORED_FRONTEND_IDENTITY'}),signal:AbortSignal.timeout(120000)});httpCalls++;const body=await response.json();check(response.status===200&&body.env==='development'&&body.success===true&&same(Object.keys(body).sort(),['actions','env','response','success']),'HTTP_CONTRACT_'+httpCalls);return {body,calls:calls.slice(start)};}
async function reconcile(call,body,label){
 const args=call.args,{where,binds}=filter(args),status=await classify(where,binds);
 if(status.kind==='RESTRICTED'){check(call.errorCode==='ACCESS_DENIED'&&/no tiene permisos/i.test(body.response)&&!/(?:Ver PDF|https?:|\| )/.test(body.response)&&Object.keys(body.actions??{}).length===0,label+'_DENIED_WITHOUT_DATA_OR_LINKS');return status.kind;}
 const result=call.result;check(!call.errorCode&&result.totalRows===status.authorized&&result.totalInvoices===status.invoices&&Boolean(result.hasRestrictedData)===status.restricted,label+'_COUNTS_AND_PERMISSION_CLASS_MATCH_ORACLE');
 const expected=await query('SELECT * FROM (SELECT NRO_FACTURA N,NOM_CLIENTE C,DES_CONCEPTO K,IMPORTE A,PDF D FROM VW_BOT_FACTURAS WHERE '+"NVL(USER_CAN_CONSULT,'S')<>'N' AND "+where+' ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC,COD_CONCEPTO) WHERE ROWNUM<=20',binds);
 check(result.data.length===expected.length&&result.data.every((r,i)=>r.invoiceNumber===expected[i].N&&r.customer.name===expected[i].C&&r.concept.description===expected[i].K&&near(r.amount,expected[i].A)),label+'_FULL_AUTHORIZED_PAGE_MATCHES_ORACLE');
 const p=body.actions?.invoicePagination;check(p?.page===1&&p.rows===20&&p.totalRows===status.authorized&&p.totalInvoices===status.invoices&&p.returnedRows===expected.length&&p.totalPages===Math.ceil(status.authorized/20)&&p.hasMore===(status.authorized>20),label+'_AUTHORIZED_PAGINATION');
 check(status.kind==='ABSENT'?/No se encontraron registros/.test(body.response)&&!/no tiene permisos/.test(body.response):status.kind==='MIXED'?/No est\u00e1 autorizado a consultar parte/.test(body.response):!/no tiene permisos|No est\u00e1 autorizado/.test(body.response),label+'_CORRECT_DENIAL_ABSENCE_OR_PARTIAL_WORDING');
 const cell=v=>String(v).replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' '),base=String(config.urlEndPointDePdf??'').replace(/\/+$/,'');let links=0;
 check((body.response.match(/^\| /gm)??[]).length===(expected.length?expected.length+2:0)&&expected.every(r=>body.response.includes(cell(r.N))&&body.response.includes(cell(r.C))&&body.response.includes(cell(r.K))),label+'_PRESENTATION_HAS_EVERY_AUTHORIZED_ROW');
 check(expected.every((r,i)=>{const url=r.D&&base?base+'/'+String(r.D).replace(/^\/+/,''):null;if(result.data[i].pdfUrl!==url)return false;if(!url)return true;links++;return body.response.includes('[Ver PDF](<'+url.replace(/[\s<>"|\\]/g,c=>encodeURIComponent(c))+'>)');})&&(body.response.match(/\[Ver PDF\]/g)??[]).length===links,label+'_ONLY_AUTHORIZED_PDF_LINKS_NO_DOWNLOAD');return status.kind;
}
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads&&/^[a-f0-9]{40}$/.test(report.commit??''),'SAFE_COMMITTED_DEV');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({suite:report.suite,commit:report.commit,success:true}));process.exit(0);}
 let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error();}sessionId=JSON.parse(input).sessionId;input='';if(!/^[a-f0-9-]{36}$/i.test(sessionId??''))throw Error();
 const application=express();application.use(express.json());application.use('/chatbot/api',router.router);server=await new Promise(resolve=>{const x=application.listen(0,'127.0.0.1',()=>resolve(x));});report.sequences=[];
 const initialWhere="FECHA_EMISION>=TO_DATE('01/01/2023','DD/MM/YYYY') AND FECHA_EMISION<TO_DATE('01/01/2024','DD/MM/YYYY') AND (INSTR("+clean('NOM_CLIENTE')+",:q)>0 OR INSTR("+clean('RAZON_SOCIAL')+",:q)>0) AND "+clean('DES_CONCEPTO')+'=:k';
 const initialIndependent=await classify(initialWhere,{q:'IMPACTO',k:'ARRENDAMIENTOMINIMO'});
 report.samples={initialNamedScopeClass:initialIndependent.kind,initialDeniedSampleAvailable:initialIndependent.kind==='RESTRICTED',plateClassification:null,missing:[]};if(initialIndependent.kind!=='RESTRICTED')report.samples.missing.push('real initially denied named scope for this session');
 for(const intent of ['autonomous','additive']){
  store.clearConversation(sessionId);const initial=await post('facturas de arrendamiento m\u00ednimo del 2023 del local Impacto');
  const initialDenied=initial.calls.some(c=>c.errorCode==='ACCESS_DENIED');
  check(initial.calls[0]?.name==='search_invoice_concepts'&&initial.calls[0].args.query==='arrendamiento m\u00ednimo','INITIAL_CONCEPT_ROLE_'+intent);
  const customer=initial.calls.find(c=>c.name==='search_invoice_customers');if(customer)check(customer.args.query==='Impacto'&&customer.args.dateFrom==='01/01/2023'&&customer.args.dateTo==='31/12/2023','INITIAL_CUSTOMER_AND_2023_'+intent);
  const initialInvoice=initial.calls.find(c=>c.name==='get_invoices');
  if(initialInvoice){check(initialInvoice.args.dateFrom==='01/01/2023'&&initialInvoice.args.dateTo==='31/12/2023'&&initialInvoice.args.customerIds?.length===1&&initialInvoice.args.conceptIds?.length===1,'INITIAL_FINAL_FILTERS_'+intent);await reconcile(initialInvoice,initial.body,'INITIAL_'+intent);}
  if(initialDenied)check(/no tiene permisos/.test(initial.body.response)&&Object.keys(initial.body.actions??{}).length===0&&!/Ver PDF/.test(initial.body.response),'INITIAL_DENIAL_WITHOUT_DATA_'+intent);
  if(initialIndependent.kind==='RESTRICTED')check(initialDenied,'REQUESTED_INITIAL_DENIAL_REAL_'+intent);
  const before=restorePiiDeep(sessionId,store.getSearchResolutions(sessionId));let h=store.getConversation(sessionId);for(let i=0;i<14;i++)h=trimConversation([...h,{role:'user',content:[{text:'Tema neutral'}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);store.setConversation(sessionId,h);check(!h.some(m=>m.content?.some(b=>b.toolUse)),'ORIGINAL_TOOLS_TRIMMED_'+intent);
  const next=await post(intent==='autonomous'?'facturas de la matr\u00edcula anx123':'filtra tambi\u00e9n por matr\u00edcula anx123');
  if(intent==='additive'&&before.invoiceNamedRequest?.phase==='denied'){
   check(next.calls.length===0&&/no tiene permisos/.test(next.body.response)&&Object.keys(next.body.actions??{}).length===0&&!/Ver PDF/.test(next.body.response),'UNRESOLVED_DENIED_FOLLOWUP_NEVER_BROADENS');report.sequences.push({intent,initialDenied,trimmed:true,followup:'BLOCKED_UNRESOLVED_DENIED_SCOPE'});continue;
  }
  check(next.calls.length===1&&next.calls[0].name==='get_invoices','DIRECT_PLATE_ONLY_TOOL_'+intent);const call=next.calls[0],a=call.args;
  check(normalizeInvoicePlate(a.plate)==='ANX123'&&a.mode==='detail'&&a.page===1&&a.rows===20,'NORMALIZED_PLATE_AND_PAGE_'+intent);
  if(intent==='autonomous')check(same(Object.keys(a).sort(),['mode','page','plate','rows']),'AUTONOMOUS_REMOVES_CUSTOMER_CONCEPT_AND_ALL_PERIOD_FILTERS');
  else{const expected={...before.contexts.get_invoices,plate:a.plate,mode:'detail',page:1};check(same(a,expected)&&a.customerIds?.length===1&&a.conceptIds?.length===1&&a.dateFrom==='01/01/2023'&&a.dateTo==='31/12/2023','ADDITIVE_PRESERVES_EFFECTIVE_CUSTOMER_CONCEPT_2023');}
  const kind=await reconcile(call,next.body,'PLATE_'+intent);if(intent==='autonomous')report.samples.plateClassification=kind;
  const metadata=restorePiiDeep(sessionId,store.getSearchResolutions(sessionId).contexts.get_invoices);check(same(metadata,a)&&!Object.hasOwn(metadata,'data'),'PERSISTENT_SCOPE_MATCHES_FINAL_ARGS_'+intent);
  if(intent==='autonomous')check(store.getSearchResolutions(sessionId).invoiceNamedRequest===undefined,'OLD_NAMED_METADATA_RETIRED');
  report.sequences.push({intent,initialDenied,trimmed:true,resultClass:kind});
 }
 check(modelCalls===0,'TYPED_HTTP_PATH_NO_SDK_REAL_MODEL_OR_PROVIDER');check(opened===closed&&!closeErrors,'ALL_ORACLE_CONNECTIONS_CLOSED');report.success=true;
}catch(e){report.error={code:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'INVOICE_PLATE_SCOPE_HTTP_CONTROL_FAILED'};}
finally{if(server)await new Promise(resolve=>server.close(resolve));if(sessionId)store.clearConversation(sessionId);sessionId=null;report.serverClosed=!server||!server.listening;report.connectionsClosed=opened===closed&&!closeErrors;if(!report.connectionsClosed||!report.serverClosed)report.success=false;}
report.httpConversationRequests=httpCalls;report.controlledModelCalls=modelCalls;report.realModelCalls=0;report.providerCalls=0;report.pdfDownloads=0;report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
