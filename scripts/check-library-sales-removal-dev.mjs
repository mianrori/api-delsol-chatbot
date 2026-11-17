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
const {clearConversation,getSearchResolutions,setConversation}=await app('src/state/conversation.store.js');
const {recordSearchToolResult}=await app('src/services/ai/searchSelection.service.js');
const {trimConversation}=await app('src/services/ai/conversation.service.js');
const {protectPiiDeep}=await app('src/services/ai/pii.service.js');
const {default:driver}=await import('oracledb');
const report={suite:'library-sales-local-removal',commit:process.argv[2],startedAt:new Date().toISOString(),success:false,checks:[],scope:'only contradictory-model local removal before/after actual history trimming and explicit period/grouping change; controlled model/history, legitimate Oracle cohorts; earlier real-model evidence reused'};
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

 const args={categoryIds:[r],dateFrom:'01/01/2023',dateTo:'31/12/2023',groupBy:['month'],metrics:'totalAmount'};
 const user=text=>({role:'user',content:[{text}]}),assistant=text=>({role:'assistant',content:[{text}]});
 const compareMonthly=()=>captured.result.data.length===monthly.length&&captured.result.data.every(row=>monthly.some(m=>m.M===row.month&&m.D===row.currency.description&&m.S===row.currency.abbreviation&&near(m.A,row.totalAmount)));
 for(const trimmed of [false,true]){
  clearConversation(sessionId);
  recordSearchToolResult(sessionId,'search_customers',{},protectPiiDeep(sessionId,{status:'RESOLVED',customer:{codCliente:c}}));recordSearchToolResult(sessionId,'search_categories',{},protectPiiDeep(sessionId,{status:'RESOLVED',category:{codRubro:r}}));
  const prior=protectPiiDeep(sessionId,{...args,customerIds:[c]});recordSearchToolResult(sessionId,'get_sales',prior,{data:[]});const categoryBefore=getSearchResolutions(sessionId).domains.search_categories;
  let history=[user('Consulta anterior controlada'),{role:'assistant',content:[{toolUse:{name:'get_sales',toolUseId:'old-sales',input:prior}}]},{role:'user',content:[{toolResult:{toolUseId:'old-sales',status:'success',content:[{json:{data:[]}}]}}]}];
  if(trimmed){for(let i=0;i<14;i++)history=trimConversation([...history,user(`Tema controlado ${i}`),assistant('Respuesta controlada')],10);check(!JSON.stringify(history).includes('old-sales'),'REAL_HISTORY_TRIM_REMOVES_PREVIOUS_TOOL_CALL');}
  setConversation(sessionId,history);
  statements=[];next={...args,customerIds:[c],dateFrom:'01/01/2024',dateTo:'31/12/2024',groupBy:['year'],metrics:['totalInvoices'],dayType:'weekend'};
  const answer=await chat.namespace.chatService({sessionId,message:'Todos los locales'});
  check(!captured.args.customerIds?.length&&same(captured.args.categoryIds,[r])&&captured.args.dateFrom===args.dateFrom&&captured.args.dateTo===args.dateTo&&same(captured.args.groupBy,['month'])&&captured.args.metrics===args.metrics&&captured.args.dayType===undefined,trimmed?'TRIMMED_ARGUMENTS_IGNORE_CONTRADICTORY_YEAR_GROUP_METRIC_DAY':'ARGUMENTS_IGNORE_CONTRADICTORY_YEAR_GROUP_METRIC_DAY');
  check(statements.length===1&&!/COD_CLIENTE\s+IN/i.test(statements[0].sql)&&/COD_RUBRO\s+IN/i.test(statements[0].sql)&&/TO_CHAR\(FECHA, 'MM'\)/.test(statements[0].sql)&&!statements[0].sql.includes('TRUNC(FECHA')&&statements[0].binds.dateFrom===args.dateFrom&&statements[0].binds.dateTo===args.dateTo,'EFFECTIVE_SQL_RETAINS_2023_MONTH_AND_ONLY_REMOVES_LOCAL');
  check(compareMonthly(),'ALL_2023_MONTHLY_GROUPS_AMOUNTS_CURRENCIES_MATCH_SQL');
  const state=getSearchResolutions(sessionId);check(state.domains.search_customers.kind==='cleared'&&same(state.domains.search_categories,categoryBefore)&&state.contexts.get_sales.dateFrom===args.dateFrom&&state.contexts.get_sales.dateTo===args.dateTo&&same(state.contexts.get_sales.groupBy,['month'])&&state.contexts.get_sales.dayType===undefined,'PERSISTENT_STATE_PRESERVES_CATEGORY_2023_MONTH');
  check(/todos los locales; rubros seleccionados/.test(answer.answer)&&answer.answer.includes('01/01/2023')&&answer.answer.includes('31/12/2023')&&!answer.answer.includes('2024'),'PRESENTATION_REFLECTS_EXECUTED_2023_SCOPE');
  check(opened===closed&&!closeErrors,'CONNECTIONS_CLOSED_AFTER_REMOVAL');
 }
 const annual=await query("SELECT TO_CHAR(FECHA,'YYYY') Y,DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A FROM VW_BOT_VENTAS_LOCALES WHERE COD_RUBRO=:r AND FECHA>=DATE '2024-01-01' AND FECHA<DATE '2025-01-01' GROUP BY TO_CHAR(FECHA,'YYYY'),DES_MONEDA,SIGLAS_MONEDA ORDER BY Y,D,S",{r});
 statements=[];next={...args,customerIds:[c],dateFrom:'01/01/2026',dateTo:'31/12/2026',groupBy:['day'],metrics:['totalInvoices'],dayType:'weekend'};
 const explicit=await chat.namespace.chatService({sessionId,message:'Todos los locales, durante 2024, por año'});
 check(!captured.args.customerIds?.length&&same(captured.args.categoryIds,[r])&&captured.args.dateFrom==='01/01/2024'&&captured.args.dateTo==='31/12/2024'&&same(captured.args.groupBy,['year'])&&captured.args.metrics===args.metrics&&captured.args.dayType===undefined,'EXPLICIT_USER_YEAR_AND_GROUP_OUTRANK_DIFFERENT_MODEL_PROPOSAL');
 check(statements.length===1&&!/COD_CLIENTE\s+IN/i.test(statements[0].sql)&&/COD_RUBRO\s+IN/i.test(statements[0].sql)&&/TO_CHAR\(FECHA, 'YYYY'\)/.test(statements[0].sql)&&statements[0].binds.dateFrom==='01/01/2024'&&statements[0].binds.dateTo==='31/12/2024','EFFECTIVE_SQL_MATCHES_EXPLICIT_2024_YEAR_SCOPE');
 check(captured.result.data.length===annual.length&&captured.result.data.every(row=>annual.some(g=>g.Y===row.year&&g.D===row.currency.description&&g.S===row.currency.abbreviation&&near(g.A,row.totalAmount))),'EXPLICIT_2024_YEAR_TOTALS_CURRENCIES_MATCH_SQL');
 const finalState=getSearchResolutions(sessionId);check(finalState.domains.search_customers.kind==='cleared'&&finalState.domains.search_categories.kind==='selected'&&finalState.contexts.get_sales.dateFrom==='01/01/2024'&&same(finalState.contexts.get_sales.groupBy,['year']),'PERSISTENT_STATE_ACCEPTS_EXPLICIT_PERIOD_GROUP_CHANGE');
 check(explicit.answer.includes('01/01/2024')&&explicit.answer.includes('31/12/2024')&&/todos los locales; rubros seleccionados/.test(explicit.answer),'PRESENTATION_REFLECTS_EXPLICIT_USER_CHANGE');
 check(external===0,'NO_REAL_MODEL_OR_CONVERSION_PROVIDER_CALL');check(opened===closed&&!closeErrors,'ALL_ORACLE_CONNECTIONS_CLOSED');report.success=true;
}catch(e){report.error={code:/^(ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'LIBRARY_CONTEXT_CONTROL_FAILED'};}
finally{if(sessionId)clearConversation(sessionId);sessionId=null;globalThis.fetch=nativeFetch;if(opened!==closed||closeErrors)report.success=false;}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
