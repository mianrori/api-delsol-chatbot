// Isolated candidate HTTP/Oracle contrast; all business fields and URLs stay in memory.
import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import express from 'express';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const root=new URL('../',import.meta.url),app=p=>import(new URL(p,root));
const {default:config}=await app('config.js');const sessions=await app('src/services/sessions/oracleSession.service.js');const {executeTool}=await app('src/services/ai/toolExecutor.service.js');const store=await app('src/state/conversation.store.js');const {protectPiiDeep}=await app('src/services/ai/pii.service.js');const {default:driver}=await import('oracledb');
const report={suite:'invoice-pdf-diagnostic-dev',commit:process.argv[2],success:false,startedAt:new Date().toISOString(),checks:[],scope:'candidate router/controller/chat/services/repository over isolated loopback HTTP with controlled model and real authorized Oracle; bounded configured PDF GETs and read-only ERP file audit; not deployed'};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CONTROL_FAILED');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),strip=s=>String(s).toUpperCase().replace(/[-\s]/g,'');
let sessionId,plans=[],calls=[],queries=[],active=false,opened=0,closed=0,closeErrors=0,modelCalls=0,server;
const connect=driver.getConnection.bind(driver);driver.getConnection=async(...args)=>{const c=await connect(...args);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);let done=false;c.execute=async(...a)=>{if(active&&a[0]?.includes('VW_BOT_FACTURAS'))queries.push({sql:a[0],binds:structuredClone(a[1])});return execute(...a);};c.close=async()=>{try{await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};return c;};
const query=(sql,binds={})=>sessions.withOracleProxySession(sessionId,async({connection})=>{if(!/^\s*SELECT\b/i.test(sql))throw Error();const r=(await connection.execute(sql,binds,{outFormat:4002,maxRows:1001})).rows;if(r.length>1000)throw Error();return r;});
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});
async function load(path,overrides={}){const url=new URL(path,root),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;}
const sdk={BedrockRuntimeClient:class{async send(){modelCalls++;const input=plans.shift();if(!input||modelCalls>3)throw Error('UNEXPECTED_MODEL_CALL');return {stopReason:'tool_use',output:{message:{role:'assistant',content:[{toolUse:{name:'get_invoices',toolUseId:'invoice-'+modelCalls,input:protectPiiDeep(sessionId,input)}}]}}};}},ConverseCommand:class{}};
const chat=await load('src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':{async executeTool(req){if(req.name!=='get_invoices'||req.context.sessionId!==sessionId)throw Error('TOOL_OUT_OF_SCOPE');active=true;try{const result=await executeTool(req);calls.push({args:structuredClone(req.arguments),result});return result;}finally{active=false;}}}});
const controller=await load('src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat});const router=await load('src/routes/index.js',{'../controllers/chat.controller.js':controller});
async function post(body){const res=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});return {status:res.status,body:await res.json()};}
let privateFileAuditValues=[];
async function inspectPdf(row,source){
 const value=String(row.D),base=String(config.urlEndPointDePdf).replace(/\/+$/,''),url=new URL(base+'/'+value.replace(/^\/+/,''));
 const observation={sequence:report.pdfSamples.length,source,pdfAlreadyHasExtension:/\.pdf$/i.test(value),singleRouteParameter:!/[\/?#]/.test(value),routeParameterEqualsOracle:decodeURIComponent(url.pathname.split('/').at(-1))===value};
 check(url.origin===new URL(base).origin,'PDF_GET_CONFIGURED_ORIGIN_UNCHANGED');
 const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(30000)});observation.status=res.status;observation.pdfContentType=/application\/pdf/i.test(res.headers.get('content-type')??'');
 const bytes=[];const reader=res.body?.getReader();if(reader)try{while(bytes.length<4096){const v=await reader.read();if(v.done)break;bytes.push(...v.value.subarray(0,4096-bytes.length));}}finally{await reader.cancel();}
 observation.pdfSignature=String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
 let body;try{body=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{}
 observation.erpMissingFilePayload=res.status===404&&body?.success===false&&body?.message==='Archivo no encontrado';
 observation.expressRouteMissing=res.status===404&&/Cannot GET\s/.test(Buffer.from(bytes).toString('utf8'));
 privateFileAuditValues.push(value);report.pdfSamples.push(observation);return observation;
}
async function verifyPage(response,args,expected,page,label){
 check(response.status===200&&response.body.success===true,label+'_HTTP_CONTRACT');const actual=calls.at(-1),result=actual.result,row=result.data[0],oracle=expected[page-1];
 check(same(actual.args,args),label+'_ARGUMENTS_PRESERVE_FILTERS');
 check(result.totalRows===expected.length&&result.totalInvoices===new Set(expected.map(r=>r.N)).size&&result.returnedRows===1&&row.invoiceNumber===oracle.N&&row.plate===oracle.P&&Number(row.amount)===Number(oracle.A),label+'_COUNTS_AND_ROW_MATCH_ORACLE');
 const canonical=strip(args.plate);check(!args.plate||strip(row.plate)===canonical,label+'_NO_LONGER_OR_SHORTER_PLATE_MATCH');
 check(queries.length===2&&queries.every(q=>(!args.plate||q.binds.plate===canonical&&q.sql.includes(' = :plate')&&!q.sql.includes('LIKE :plate'))&&q.binds.customerId0===args.customerIds[0]&&q.binds.conceptId0===args.conceptIds[0]&&q.sql.includes("NVL(USER_CAN_CONSULT, 'S') <> 'N'")),label+'_EXACT_BINDS_AND_ORACLE_PERMISSIONS');
 const url=oracle.D?String(config.urlEndPointDePdf).replace(/\/+$/,'')+'/'+String(oracle.D).replace(/^\/+/,''):null;
 check(row.pdfUrl===url,label+'_URL_BASE_PLUS_UNMODIFIED_ORACLE_PDF');
 check(url?response.body.response.includes('[Ver PDF](<'+url.replace(/[\s<>"|\\]/g,c=>encodeURIComponent(c))+'>)'):!response.body.response.includes('Ver PDF'),label+'_RESPONSE_LINK_MATCHES_ROW');
 check(response.body.actions.invoicePagination.page===page&&response.body.actions.invoicePagination.totalRows===expected.length,label+'_PAGINATION_CONTRACT');
 check(opened===closed&&!closeErrors,label+'_CONNECTIONS_CLOSED');
}
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads&&/^[a-f0-9]{40}$/.test(report.commit??''),'SAFE_DEV_CANDIDATE');
 const base=String(config.urlEndPointDePdf??'').replace(/\/+$/,'');const endpoint=new URL(base);
 check(endpoint.pathname.replace(/\/+$/,'')==='/delsolerp/api/factura/pdf'&&!endpoint.search&&!endpoint.hash,'CONFIGURATION_MATCHES_ERP_MOUNT_AND_CDC_ROUTE');
 const repository=await readFile(new URL('src/repositories/invoices/invoices.repository.js',root),'utf8');const predicate=repository.match(/REGEXP_REPLACE\(UPPER\(MATRICULA\),[^\n]+ = :plate/)?.[0];check(Boolean(predicate),'ACTUAL_REPOSITORY_USES_EXACT_PLATE_PREDICATE');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({suite:report.suite,commit:report.commit,success:true}));process.exit(0);}
 check(process.env.INVOICE_PRIVATE_IPC==='1','PROTECTED_WRAPPER_REQUIRED');
 let input='';for await(const c of process.stdin){input+=c;if(input.length>32768)throw Error();}const payload=JSON.parse(input);sessionId=payload.sessionId;const localFiles=payload.localFiles??[];input='';if(!/^[a-f0-9-]{36}$/i.test(sessionId??''))throw Error();
 const valid=await sessions.getValidOracleSession(sessionId);const identity=await query("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL");check(String(identity[0].U).toUpperCase()===valid.username&&Boolean(identity[0].P),'SESSION_PROXY_IDENTITY');
 const literalCases=['AB 123','ab-123','XAB123','AB1234','AB%123','AB_123','A\tB1\n23'];const syntheticBinds={plate:'AB123'};literalCases.forEach((v,i)=>syntheticBinds['v'+i]=v);
 const literal=await query('SELECT I FROM ('+literalCases.map((_,i)=>'SELECT '+i+' I,:v'+i+' MATRICULA FROM DUAL').join(' UNION ALL ')+') WHERE '+predicate+' ORDER BY I',syntheticBinds);check(same(literal.map(r=>r.I),[0,1,6]),'ORACLE_PREDICATE_EQUIVALENT_FORMATS_ONLY_NO_PREFIX_OR_WILDCARDS');
 const cohorts=await query("SELECT * FROM (SELECT REGEXP_REPLACE(UPPER(MATRICULA),'[-[:space:]]','') P,COD_CLIENTE C,COD_CONCEPTO K,NVL(ANULADO,'N') A,TO_CHAR(MIN(FECHA_EMISION),'DD/MM/YYYY') F,TO_CHAR(MAX(FECHA_EMISION),'DD/MM/YYYY') T FROM VW_BOT_FACTURAS WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND REGEXP_LIKE(REGEXP_REPLACE(UPPER(MATRICULA),'[-[:space:]]',''),'^[A-Z0-9]{5,10}$') GROUP BY REGEXP_REPLACE(UPPER(MATRICULA),'[-[:space:]]',''),COD_CLIENTE,COD_CONCEPTO,NVL(ANULADO,'N') HAVING COUNT(*)>=2 AND SUM(CASE WHEN PDF IS NOT NULL THEN 1 ELSE 0 END)>0 ORDER BY MAX(FECHA_EMISION) DESC) WHERE ROWNUM<=1");
 check(cohorts.length===1,'AUTHORIZED_FORMER_COHORT_RECONSTRUCTED');const c=cohorts[0],plate=String(c.P),spaced=plate.split('').join(' \t');
 const independent=await query("SELECT MATRICULA P,NRO_FACTURA N,PDF D,IMPORTE A,COD_CLIENTE C,COD_CONCEPTO K,TO_CHAR(FECHA_EMISION,'DD/MM/YYYY') F,NVL(ANULADO,'N') X FROM VW_BOT_FACTURAS WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND COD_CLIENTE=:c AND COD_CONCEPTO=:k AND NVL(ANULADO,'N')=:a AND FECHA_EMISION>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA_EMISION<TO_DATE(:t,'DD/MM/YYYY')+1 AND INSTR(REPLACE(TRANSLATE(UPPER(MATRICULA),' -'||CHR(9)||CHR(10)||CHR(11)||CHR(12)||CHR(13),' '),' ',''),:p)>0 ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC,COD_CONCEPTO",{c:String(c.C),k:String(c.K),a:c.A,f:c.F,t:c.T,p:plate});
 const exact=independent.filter(r=>strip(r.P)===plate);report.excludedSubstringRows=independent.length-exact.length;check(exact.length>=2,'EXACT_COHORT_TWO_PAGES');
 const application=express();application.use(express.json());application.use('/chatbot/api',router.router);server=await new Promise(resolve=>{const x=application.listen(0,'127.0.0.1',()=>resolve(x));});store.clearConversation(sessionId);
 const known={plate:spaced,customerIds:[String(c.C)],conceptIds:[String(c.K)],dateFrom:c.F,dateTo:c.T,cancelled:c.A==='S',mode:'detail',page:1,rows:1};
 for(const page of [1,2]){queries=[];plans=[page===1?known:{page}];const response=await post({sessionId,message:page===1?'Facturas de la matr\u00edcula '+spaced:'Siguiente p\u00e1gina',username:'IGNORED_IDENTITY'});await verifyPage(response,{...known,page},exact,page,'EXACT_PAGE_'+page);}
 report.pdfSamples=[];const former=independent.find(r=>r.D);check(Boolean(former),'FORMER_SAMPLE_HAS_ORACLE_PDF');const formerStatus=await inspectPdf(former,'former cohort reconstructed; historical filename was not retained');
 let positive=formerStatus.status===200&&formerStatus.pdfContentType&&formerStatus.pdfSignature?former:null;
 const cols="PDF D,MATRICULA P,COD_CLIENTE C,COD_CONCEPTO K,NRO_FACTURA N,TO_CHAR(FECHA_EMISION,'DD/MM/YYYY') F,NVL(ANULADO,'N') X";
 const sampleSql=condition=>"SELECT * FROM (SELECT "+cols+" FROM (SELECT Q.*,ROW_NUMBER() OVER(PARTITION BY PDF ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC,COD_CLIENTE,COD_CONCEPTO) Z FROM VW_BOT_FACTURAS Q WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND PDF IS NOT NULL "+condition+") WHERE Z=1 ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC) WHERE ROWNUM<=12";
 let available=[];if(localFiles.length){const binds={};const values=localFiles.slice(0,64).map((v,i)=>{binds['d'+i]=v;return ':d'+i;});available=await query(sampleSql('AND PDF IN ('+values.join(',')+')'),binds);}
 const newest=await query(sampleSql(''));const candidates=[...available.map(r=>({...r,source:'authorized Oracle and local ERP file intersection'})),...newest.map(r=>({...r,source:'newest authorized Oracle PDFs'}))];
 report.availableLocalOracleMatches=available.length;report.newestAuthorizedPdfCandidates=newest.length;const seen=new Set([String(former.D)]);
 for(const candidate of candidates){if(positive||report.pdfSamples.length>=13)break;if(seen.has(String(candidate.D)))continue;seen.add(String(candidate.D));const result=await inspectPdf(candidate,candidate.source);if(result.status===200&&result.pdfContentType&&result.pdfSignature)positive=candidate;}
 report.pdfDownloadApproved=Boolean(positive);report.sampleSearchBound=13;report.configuredTargetIsLocalErp=['localhost','127.0.0.1','host.docker.internal'].includes(endpoint.hostname)&&endpoint.port==='5300';
 if(positive){store.clearConversation(sessionId);const args={customerIds:[String(positive.C)],conceptIds:[String(positive.K)],invoiceNumber:String(positive.N),dateFrom:positive.F,dateTo:positive.F,cancelled:positive.X==='S',mode:'detail',page:1,rows:1};if(positive.P&&strip(positive.P))args.plate=String(positive.P);
  const binds={c:String(positive.C),k:String(positive.K),n:String(positive.N),f:positive.F,a:positive.X};let where="NVL(USER_CAN_CONSULT,'S')<>'N' AND COD_CLIENTE=:c AND COD_CONCEPTO=:k AND INSTR(UPPER(NRO_FACTURA),UPPER(:n))>0 AND FECHA_EMISION>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA_EMISION<TO_DATE(:f,'DD/MM/YYYY')+1 AND NVL(ANULADO,'N')=:a";if(args.plate){binds.p=strip(args.plate);where+=" AND REPLACE(TRANSLATE(UPPER(MATRICULA),' -'||CHR(9)||CHR(10)||CHR(11)||CHR(12)||CHR(13),' '),' ','')=:p";}
  const expected=await query('SELECT MATRICULA P,NRO_FACTURA N,PDF D,IMPORTE A FROM VW_BOT_FACTURAS WHERE '+where+' ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC,COD_CONCEPTO',binds);check(expected.length>0,'AVAILABLE_PDF_INDEPENDENT_DETAIL');queries=[];plans=[args];const response=await post({sessionId,message:'Ver PDF de la factura autorizada'});await verifyPage(response,args,expected,1,'AVAILABLE_PDF_PAGE');
 }else report.remainingReservation='No available PDF found within bounded authorized sample; do not invent a positive or modify the endpoint';
 check(opened===closed&&!closeErrors,'ALL_CONNECTIONS_CLOSED');report.success=true;
}catch(e){report.error={code:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'PDF_DIAGNOSTIC_FAILED'};}
finally{if(server)await new Promise(resolve=>server.close(resolve));if(sessionId)store.clearConversation(sessionId);sessionId=null;report.connectionsClosed=opened===closed&&!closeErrors;if(!report.connectionsClosed)report.success=false;}
report.privateFileAuditValues=privateFileAuditValues;report.controlledModelCalls=modelCalls;report.realModelCalls=0;report.providerCalls=0;report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
