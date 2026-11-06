// Affected final control: controlled model/state, legitimate Oracle cohorts.
// The two real-model reproductions are reused by hash, not repeated here.
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const root=new URL('../',import.meta.url);
const app=path=>import(new URL(path,root));
const {default:config}=await app('config.js');
const {getValidOracleSession,withOracleProxySession}=await app('src/services/sessions/oracleSession.service.js');
const {executeTool}=await app('src/services/ai/toolExecutor.service.js');
const {clearConversation,getSearchResolutions}=await app('src/state/conversation.store.js');
const {recordSearchToolResult}=await app('src/services/ai/searchSelection.service.js');
const {protectPiiDeep}=await app('src/services/ai/pii.service.js');
const {default:driver}=await import('oracledb');
const report={suite:'library-sales-context-final',commit:process.argv[2],startedAt:new Date().toISOString(),success:false,checks:[],scope:'controlled model and resolution state from legitimate Oracle IDs; same empty-intersection profile, not asserted same original local; no new real-model or HTTP claim'};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('LIBRARY_CONTEXT_CONTROL_FAILED');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),near=(a,b)=>Math.abs(Number(a)-Number(b))<=Math.max(.000001,Math.abs(Number(b))*1e-10);
let sessionId,opened=0,closed=0,closeErrors=0,next,captured,active=false,statements=[];
const connect=driver.getConnection.bind(driver);
driver.getConnection=async(...args)=>{const c=await connect(...args);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);let done=false;c.execute=async(...a)=>{if(active&&typeof a[0]==='string'&&a[0].includes('VW_BOT_VENTAS_LOCALES'))statements.push({sql:a[0],binds:structuredClone(a[1]??{})});return execute(...a);};c.close=async()=>{try{await close();if(!done){closed++;done=true;}}catch(e){closeErrors++;throw e;}};return c;};
const query=(sql,binds={})=>withOracleProxySession(sessionId,async({connection})=>{if(!/^\s*SELECT\b/i.test(sql))throw Error();const r=(await connection.execute(sql,binds,{outFormat:4002,maxRows:1001})).rows;if(r.length>1000)throw Error('CONTROL_LIMIT');return r;});
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
const model={BedrockRuntimeClient:class{async send(){const input=next;next=null;return {stopReason:input?'tool_use':'end_turn',output:{message:{role:'assistant',content:input?[{toolUse:{name:'get_sales',toolUseId:'controlled-library-sales',input:protectPiiDeep(sessionId,input)}}]:[{text:'Consulta completada.'}]}}};}},ConverseCommand:class{}};
const url=new URL('src/services/ai/chat.service.js',root),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?model:spec==='./toolExecutor.service.js'?{executeTool:async request=>{check(request.name==='get_sales','ONLY_AFFECTED_TOOL');active=true;try{const result=await executeTool(request);captured={args:structuredClone(request.arguments),result};return result;}finally{active=false;}}}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
await chat.evaluate();
const nativeFetch=globalThis.fetch;let external=0;globalThis.fetch=()=>{external++;throw Error('EXTERNAL_HTTP_DISABLED');};
try{
 check(/^[a-f0-9]{40}$/.test(report.commit??'')&&config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'SAFE_COMMITTED_DEV_CANDIDATE');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({success:true,preflight:true}));process.exit(0);}
 let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error();}sessionId=JSON.parse(input).sessionId;input='';if(!/^[a-f0-9-]{36}$/i.test(sessionId??''))throw Error();
 const valid=await getValidOracleSession(sessionId);await withOracleProxySession(sessionId,async({connection})=>{const r=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{},{outFormat:4002})).rows[0];check(String(r.U).toUpperCase()===valid.username&&Boolean(r.P),'PROXY_IDENTITY_MATCHES_SESSION');});
 const categories=await query("SELECT COD_RUBRO R FROM VW_BOT_RUBROS_LOCALES WHERE REGEXP_REPLACE(TRANSLATE(UPPER(DESCRIPCION),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]','')='LIBRERIA'");check(categories.length===1,'LEGITIMATE_UNIQUE_LIBRARY_CATEGORY');const r=String(categories[0].R);
 const locals=await query("SELECT V.COD_CLIENTE C FROM VW_BOT_VENTAS_LOCALES V WHERE V.FECHA>=DATE '2023-01-01' AND V.FECHA<DATE '2024-01-01' AND V.COD_CLIENTE IS NOT NULL AND NOT EXISTS (SELECT 1 FROM VW_BOT_VENTAS_LOCALES W WHERE W.COD_CLIENTE=V.COD_CLIENTE AND W.COD_RUBRO=:r AND W.FECHA>=DATE '2023-01-01' AND W.FECHA<DATE '2024-01-01') GROUP BY V.COD_CLIENTE ORDER BY V.COD_CLIENTE FETCH FIRST 1 ROWS ONLY",{r});check(locals.length===1,'LEGITIMATE_LOCAL_WITH_EMPTY_LIBRARY_INTERSECTION');const c=String(locals[0].C);
 const monthly=await query("SELECT TO_CHAR(FECHA,'MM') M,DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A FROM VW_BOT_VENTAS_LOCALES WHERE COD_RUBRO=:r AND FECHA>=DATE '2023-01-01' AND FECHA<DATE '2024-01-01' GROUP BY TO_CHAR(FECHA,'MM'),DES_MONEDA,SIGLAS_MONEDA ORDER BY M,D,S",{r});check(monthly.length>0,'INDEPENDENT_CATEGORY_ONLY_HAS_MONTHLY_SALES');
 const count=await query("SELECT COUNT(*) N FROM VW_BOT_VENTAS_LOCALES WHERE COD_RUBRO=:r AND COD_CLIENTE=:c AND FECHA>=DATE '2023-01-01' AND FECHA<DATE '2024-01-01'",{r,c});check(Number(count[0].N)===0,'INDEPENDENT_COMBINED_FILTERS_HAVE_NO_RECORDS');
 const args={categoryIds:[r],dateFrom:'01/01/2023',dateTo:'31/12/2023',groupBy:['month'],metrics:'totalAmount'};clearConversation(sessionId);
 recordSearchToolResult(sessionId,'search_customers',{},protectPiiDeep(sessionId,{status:'RESOLVED',customer:{codCliente:c}}));recordSearchToolResult(sessionId,'search_categories',{},protectPiiDeep(sessionId,{status:'RESOLVED',category:{codRubro:r}}));recordSearchToolResult(sessionId,'get_sales',protectPiiDeep(sessionId,{...args,customerIds:[c]}),{data:[]});
 next=args;const first=await chat.namespace.chatService({sessionId,message:'Ventas del rubro librería durante 2023, por mes'});
 check(same(captured.args.customerIds,[c])&&same(captured.args.categoryIds,[r])&&captured.args.dateFrom===args.dateFrom&&captured.args.dateTo===args.dateTo&&same(captured.args.groupBy,['month']),'FINAL_FILTERS_RETAIN_LOCAL_CATEGORY_YEAR_MONTH');check(captured.result.data.length===0,'EMPTY_TOOL_RESULT_AGREES_WITH_ORACLE');
 check(/locales seleccionados; rubros seleccionados/.test(first.answer)&&/combina el local y el rubro/.test(first.answer)&&/no describe las ventas del rubro en todos los locales/.test(first.answer)&&/todos los locales/.test(first.answer),'EMPTY_PRESENTATION_EXPLAINS_SCOPE_AND_EXPLICIT_REMOVAL');
 check(statements.length===1&&/COD_CLIENTE\s+IN/i.test(statements[0].sql)&&/COD_RUBRO\s+IN/i.test(statements[0].sql),'EFFECTIVE_SQL_RETAINS_BOTH_FILTERS');
 statements=[];next={...args,customerIds:[c]};const second=await chat.namespace.chatService({sessionId,message:'Todos los locales'});
 check(!captured.args.customerIds?.length&&same(captured.args.categoryIds,[r])&&captured.args.dateFrom===args.dateFrom&&captured.args.dateTo===args.dateTo&&same(captured.args.groupBy,['month']),'EXPLICIT_REMOVAL_ONLY_CLEARS_LOCAL');
 check(statements.length===1&&!/COD_CLIENTE\s+IN/i.test(statements[0].sql)&&/COD_RUBRO\s+IN/i.test(statements[0].sql),'EFFECTIVE_SQL_REMOVES_ONLY_LOCAL');
 const rows=captured.result.data;check(rows.length===monthly.length&&rows.every(row=>monthly.some(m=>m.M===row.month&&m.D===row.currency.description&&m.S===row.currency.abbreviation&&near(m.A,row.totalAmount))),'FULL_MONTHLY_TOTALS_CURRENCIES_MATCH_INDEPENDENT_ORACLE');
 check(/todos los locales; rubros seleccionados/.test(second.answer)&&!/No se encontraron ventas/.test(second.answer),'POSITIVE_PRESENTATION_REPORTS_BROADER_REQUESTED_SCOPE');check(getSearchResolutions(sessionId).domains.search_customers.kind==='cleared'&&getSearchResolutions(sessionId).domains.search_categories.kind==='selected','RESOLUTION_STATES_RETAIN_CATEGORY_CLEAR_LOCAL');
 check(external===0,'NO_REAL_MODEL_OR_CONVERSION_PROVIDER_CALL');check(opened===closed&&!closeErrors,'ALL_ORACLE_CONNECTIONS_CLOSED');report.success=true;
}catch(e){report.error={code:/^(ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'LIBRARY_CONTEXT_CONTROL_FAILED'};}
finally{if(sessionId)clearConversation(sessionId);sessionId=null;globalThis.fetch=nativeFetch;if(opened!==closed||closeErrors)report.success=false;}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
