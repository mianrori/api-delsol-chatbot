// Read-only contrast. Catalog identities, binds, business rows and model text stay in memory.
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const emit=process.stdout.write.bind(process.stdout);
for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const root=new URL('../',import.meta.url),app=p=>import(new URL(p,root));
const {default:config}=await app('config.js');
const {getValidOracleSession,withOracleProxySession}=await app('src/services/sessions/oracleSession.service.js');
const {executeTool}=await app('src/services/ai/toolExecutor.service.js');
const store=await app('src/state/conversation.store.js');
const {trimConversation}=await app('src/services/ai/conversation.service.js');
const {restorePiiDeep,protectPiiDeep}=await app('src/services/ai/pii.service.js');
const {recordSearchToolResult}=await app('src/services/ai/searchSelection.service.js');
const {runWithRequestSignal}=await app('src/services/requestContext.service.js');
const {default:driver}=await import('oracledb');
const sdk=await import('@aws-sdk/client-bedrock-runtime');
const report={suite:'sales-monthly-comparison-real',commit:process.argv[2],startedAt:new Date().toISOString(),success:false,checks:[],scope:'real Bedrock planning probes plus exact candidate chat/service/repository paths and independent Oracle SELECT; deterministic paths intentionally bypass Bedrock; not HTTP chat'};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CONTROL_FAILED');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''),near=(a,b)=>Math.abs(Number(a)-Number(b))<=Math.max(.000001,Math.abs(Number(b))*1e-10);
let sessionId,opened=0,closed=0,closeErrors=0,modelCalls=0,active=false,timer,lastAnswer='';
let captured=[],statements=[];
const connect=driver.getConnection.bind(driver);
driver.getConnection=async(...args)=>{const c=await connect(...args);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);let done=false;
 c.execute=async(...a)=>{if(active&&typeof a[0]==='string'&&a[0].includes('VW_BOT_VENTAS_LOCALES'))statements.push({sql:a[0],binds:structuredClone(a[1])});return execute(...a);};
 c.close=async()=>{try{await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};return c;};
const query=(sql,binds={})=>withOracleProxySession(sessionId,async({connection})=>{if(!/^\s*SELECT\b/i.test(sql))throw Error();const r=(await connection.execute(sql,binds,{outFormat:4002,maxRows:1001})).rows;if(r.length>1000)throw Error();return r;});
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
const wrapped={...sdk,BedrockRuntimeClient:class extends sdk.BedrockRuntimeClient{async send(...args){if(++modelCalls>6)throw Error('MODEL_LIMIT');return super.send(...args);}}};
const url=new URL('src/services/ai/chat.service.js',root),chat=new vm.SourceTextModule((await readFile(url,'utf8'))+'\nexport {getSystemPrompt,RUNTIME_CAPABILITIES_PROMPT};',{context});
await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?wrapped:spec==='./toolExecutor.service.js'?{executeTool:async request=>{
 if(!['search_customers','search_categories','get_sales'].includes(request.name))throw Error('TOOL_OUT_OF_SCOPE');active=true;try{const r=await executeTool(request);captured.push({name:request.name,args:structuredClone(request.arguments),result:r});return r;}finally{active=false;}
}}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
await chat.evaluate();
const questions={category:'Compara las ventas mensuales del rubro ropa femenina de 2022 con las de 2023',global:'Compara las ventas mensuales de 2022 con las de 2023'};
async function probe(message){
 const {tools}=await app('src/tools/index.js');const client=new wrapped.BedrockRuntimeClient({region:config.awsRegion||'us-east-1'});
 try{const response=await client.send(new sdk.ConverseCommand({modelId:config.awsBedrockModelId,system:[{text:chat.namespace.getSystemPrompt({currentDate:'2026-11-09'})},{text:chat.namespace.RUNTIME_CAPABILITIES_PROMPT}],messages:[{role:'user',content:[{text:message}]}],toolConfig:{tools:tools.filter(t=>['search_customers','search_categories','get_sales'].includes(t.toolSpec?.name))},inferenceConfig:{maxTokens:2048,temperature:Number(config.awsBedrockTemperature||0.1)}}),{abortSignal:AbortSignal.timeout(90000)});
 const calls=(response.output?.message?.content??[]).map(b=>b.toolUse).filter(Boolean);
 return {stopReason:response.stopReason,searchCategories:calls.filter(c=>c.name==='search_categories').length,getSales:calls.filter(c=>c.name==='get_sales').length,requestedCategoryQuery:calls.some(c=>c.name==='search_categories'&&norm(c.input?.search)==='ROPAFEMENINA'),bothRequestedYearsInSales:calls.some(c=>String(c.input?.dateFrom).endsWith('2022'))&&calls.some(c=>String(c.input?.dateFrom).endsWith('2023')),proposalsOnly:true};
 }finally{client.destroy();}
}
async function turn(message){captured=[];statements=[];const abort=new AbortController();timer=setTimeout(()=>abort.abort(),120000);try{lastAnswer=(await runWithRequestSignal(abort.signal,()=>chat.namespace.chatService({sessionId,message}))).answer;}finally{clearTimeout(timer);timer=null;}return captured.filter(c=>c.name==='get_sales');}
async function verify(sales,{categoryIds=[],customerIds=[],years=['2022','2023'],dayType,metrics=['totalAmount','totalInvoices']}={},label){
 check(sales.length===2,label+'_TWO_FRESH_YEAR_QUERIES');
 for(const [i,c]of sales.entries()){
  const a=c.args,y=years[i];check(a.dateFrom==='01/01/'+y&&a.dateTo==='31/12/'+y&&same(a.groupBy,['month'])&&same(a.categoryIds??[],categoryIds)&&same(a.customerIds??[],customerIds)&&a.dayType===dayType&&same(a.metrics,metrics),label+'_YEAR_'+y+'_FINAL_ARGUMENTS');
  const binds={f:a.dateFrom,t:a.dateTo},where=["FECHA>=TO_DATE(:f,'DD/MM/YYYY')","FECHA<TO_DATE(:t,'DD/MM/YYYY')+1"];
  for(const[col,ids,p]of [['COD_CLIENTE',customerIds,'c'],['COD_RUBRO',categoryIds,'r']])if(ids.length)where.push(`${col} IN (${ids.map((id,j)=>{binds[p+j]=id;return ':'+p+j;}).join(',')})`);
  if(dayType==='weekday')where.push("TRUNC(FECHA)-TRUNC(FECHA,'IW') BETWEEN 0 AND 4");
  const independent=await query(`SELECT TO_CHAR(FECHA,'MM') M,DES_MONEDA D,SIGLAS_MONEDA S,SUM(MONTO_TOTAL) A,SUM(CANTIDAD_FACTURAS) I FROM VW_BOT_VENTAS_LOCALES WHERE ${where.join(' AND ')} GROUP BY TO_CHAR(FECHA,'MM'),DES_MONEDA,SIGLAS_MONEDA`,binds);
  const rows=c.result.data??[];check(!c.result.resultSet?.truncated&&rows.length===independent.length&&rows.every(row=>independent.some(v=>v.M===row.month&&v.D===row.currency.description&&v.S===row.currency.abbreviation&&metrics.every(m=>row[m]===null?(m==='totalAmount'?v.A:v.I)===null:near(row[m],m==='totalAmount'?v.A:v.I)))),label+'_YEAR_'+y+'_ALL_MONTHS_AMOUNTS_INVOICES_CURRENCIES_MATCH_ORACLE');
  check(rows.every(r=>metrics.every(m=>Object.hasOwn(r,m))),label+'_YEAR_'+y+'_METRICS_PRESENT');
  report.groupsChecked=(report.groupsChecked??0)+rows.length;report.zeroGroups=(report.zeroGroups??0)+rows.filter(r=>r.totalAmount===0||r.totalInvoices===0).length;
  report.missingMonthGroups=(report.missingMonthGroups??0)+(12-new Set(rows.map(r=>r.month)).size);
  const sql=statements[i];check(Boolean(sql)&&sql.binds.dateFrom===a.dateFrom&&sql.binds.dateTo===a.dateTo&&/COD_CLIENTE\s+IN/i.test(sql.sql)===Boolean(customerIds.length)&&/COD_RUBRO\s+IN/i.test(sql.sql)===Boolean(categoryIds.length)&&/SUM\(CANTIDAD_FACTURAS\)/.test(sql.sql)===metrics.includes('totalInvoices'),label+'_YEAR_'+y+'_EFFECTIVE_SQL');
  const expectedScope={customers:[],categories:[]};for(const id of customerIds){const n=await query('SELECT NOMBRE_FANTASIA N FROM VW_BOT_CLIENTES WHERE COD_CLIENTE=:id',{id});check(n.length===1,label+'_CUSTOMER_AUTHORIZED');expectedScope.customers.push({customerId:String(id),customerName:n[0].N.trim()});}for(const id of categoryIds){const n=await query('SELECT DESCRIPCION N FROM VW_BOT_RUBROS_LOCALES WHERE COD_RUBRO=:id',{id});check(n.length===1,label+'_CATEGORY_AUTHORIZED');expectedScope.categories.push({categoryId:String(id),categoryName:n[0].N.trim()});}
  check([...expectedScope.customers.map(n=>n.customerName),...expectedScope.categories.map(n=>n.categoryName)].every(n=>lastAnswer.includes(String(n).replace(/([\\\x60*_[\]<>|])/g,'\\$1'))),label+'_YEAR_'+y+'_PRESENTATION_AUTHORIZED_NAMES');
  check(same(c.result.scope,expectedScope),label+'_YEAR_'+y+'_NAMES_MATCH_EFFECTIVE_AUTHORIZED_IDS');
  check(lastAnswer.includes(a.dateFrom)&&lastAnswer.includes(a.dateTo),label+'_YEAR_'+y+'_PRESENTATION_PERIOD');
 }
 check(lastAnswer.includes('Alcance: ')&&(!categoryIds.length?!customerIds.length&&lastAnswer.includes('todos los locales; todos los rubros'):lastAnswer.includes('rubro')),label+'_EXPLICIT_SCOPE');
 const present=sales.some(c=>c.result.data?.length);check(!present||lastAnswer.includes('Ventas '+years[0])===metrics.includes('totalAmount')&&lastAnswer.includes('Facturas '+years[0])===metrics.includes('totalInvoices'),label+'_PRESENTATION_METRICS');
 if(present)check(lastAnswer.includes('no se reemplaza por cero'),label+'_MISSING_ROWS_NOT_ZERO');else check(/No se encontraron registros para ninguno/.test(lastAnswer),label+'_EMPTY_IS_NOT_MISSING_CATEGORY');
 const state=restorePiiDeep(sessionId,store.getSearchResolutions(sessionId));check(same(state.contexts.get_sales,sales[1].args)&&same(state.salesComparison.inputs,sales.map(c=>c.args))&&!state.salesComparison.pending,label+'_PERSISTENT_ARGUMENTS_AND_COMPARISON');check(opened===closed&&!closeErrors,label+'_CONNECTIONS_CLOSED');
}
const crop=()=>{let h=store.getConversation(sessionId);for(let i=0;i<14;i++)h=trimConversation([...h,{role:'user',content:[{text:'Tema neutral'}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);check(!h.some(m=>m.content?.some(b=>b.toolUse)),'ACTUAL_TRIM_EVICTS_TOOLS');store.setConversation(sessionId,h);};
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads&&/^[a-f0-9]{40}$/.test(report.commit??''),'SAFE_COMMITTED_DEV');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({suite:report.suite,commit:report.commit,success:true}));process.exit(0);}
 let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error();}sessionId=JSON.parse(input).sessionId;input='';if(!/^[a-f0-9-]{36}$/i.test(sessionId??''))throw Error();
 const valid=await getValidOracleSession(sessionId);await withOracleProxySession(sessionId,async({connection})=>{const r=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{},{outFormat:4002})).rows[0];check(String(r.U).toUpperCase()===valid.username&&Boolean(r.P),'SESSION_PROXY_IDENTITY');});
 const catalog=await query("SELECT COD_RUBRO R,DESCRIPCION N,UTL_MATCH.JARO_WINKLER_SIMILARITY(UPPER(REGEXP_REPLACE(TRANSLATE(DESCRIPCION,'\u00c1\u00c9\u00cd\u00d3\u00da\u00dc\u00d1\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1','AEIOUUNAEIOUUN'),'[^A-Za-z0-9]','')),:q) S FROM VW_BOT_RUBROS_LOCALES",{q:'ROPAFEMENINA'});
 const matches=catalog.filter(c=>norm(c.N).includes('ROPAFEMENINA')||Number(c.S)>=Number(config.minSimilarity||70)),exact=matches.filter(c=>norm(c.N)==='ROPAFEMENINA'),eligible=exact.length?exact:matches;
 report.catalog={authorizedCount:catalog.length,exactMatches:exact.length,relevantMatches:eligible.length,status:eligible.length===0?'NOT_FOUND':eligible.length===1?'RESOLVED':'AMBIGUOUS'};
 check(catalog.length>0,'AUTHORIZED_CATALOG_READ_INDEPENDENTLY');
 report.realModelPlanning={category:await probe(questions.category),global:await probe(questions.global)};check(modelCalls===2,'TWO_REAL_BEDROCK_PLANNING_PROBES_NO_STUB');
 const clients=await query("SELECT COD_CLIENTE C FROM VW_BOT_CLIENTES WHERE COD_CLIENTE IN (SELECT COD_CLIENTE FROM VW_BOT_CONTRATOS_LOCALES WHERE TIP_CONTRATO='CNT' AND ESTADO='A') ORDER BY COD_CLIENTE FETCH FIRST 1 ROWS ONLY");check(clients.length===1,'AUTHORIZED_PRIOR_FILTER_FIXTURE');
 for(const prior of [false,true])for(const trimmed of [false,true])for(const kind of ['global','category']){
  store.clearConversation(sessionId);
  if(prior){recordSearchToolResult(sessionId,'search_customers',{},protectPiiDeep(sessionId,{status:'RESOLVED',customer:{codCliente:String(clients[0].C)}}));recordSearchToolResult(sessionId,'search_categories',{},protectPiiDeep(sessionId,{status:'RESOLVED',category:{codRubro:String(catalog[0].R)}}));const state=store.getSearchResolutions(sessionId);state.contexts.get_sales=protectPiiDeep(sessionId,{customerIds:[String(clients[0].C)],categoryIds:[String(catalog[0].R)],dateFrom:'01/01/2023',dateTo:'30/04/2023',groupBy:['customer'],dayType:'weekday',metrics:['totalAmount']});state.salesMetrics=['totalAmount'];store.setSearchResolutions(sessionId,state);}
  if(trimmed)crop();let sales=await turn(questions[kind]);const label=kind.toUpperCase()+(prior?'_PRIOR':'_FRESH')+(trimmed?'_TRIMMED':'_FULL');
  if(kind==='global')await verify(sales,{},label);
  else{
   const lookup=captured.find(c=>c.name==='search_categories');check(lookup?.result.status===report.catalog.status,label+'_CATALOG_STATUS_MATCHES_ORACLE');
   if(eligible.length===0){check(sales.length===0&&/cat\u00e1logo autorizado/.test(lastAnswer),label+'_NOT_FOUND_NO_SALES');continue;}
   let selected;
   if(eligible.length>1){check(sales.length===0&&/Selecciona un rubro/.test(lastAnswer),label+'_AMBIGUOUS_WAITS');const options=lookup.result.options;check(options.length>0&&options.every(o=>eligible.some(c=>String(c.R)===String(o.codRubro)))&&lookup.result.totalMatches===eligible.length,label+'_OPTIONS_MATCH_AUTHORIZED_COHORT');if(trimmed)crop();selected=String(options[0].codRubro);sales=await turn(String(options[0].optionId));}else selected=String(eligible[0].R);
   await verify(sales,{categoryIds:[selected]},label);
   // Explicit anaphoric follow-up retains the selected category and full-year window.
   if(prior){if(trimmed)crop();const followup=await turn('Compara ese mismo rubro con 2022');await verify(followup,{categoryIds:[selected],years:['2023','2022']},label+'_SAME_CATEGORY_FOLLOWUP');}
  }
 }
 check(modelCalls===2,'EXACT_CHAT_PATHS_DETERMINISTIC_NO_EXTRA_BEDROCK');report.success=true;
}catch(e){report.error={code:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'MONTHLY_COMPARISON_CONTROL_FAILED'};}
finally{if(timer)clearTimeout(timer);if(sessionId)store.clearConversation(sessionId);sessionId=null;report.connectionsClosed=opened===closed&&!closeErrors;if(!report.connectionsClosed)report.success=false;}
report.realModelCalls=modelCalls;report.providerCalls=0;report.finishedAt=new Date().toISOString();await writeFile(new URL('monthly-comparison-sanitized-report.json',root),JSON.stringify(report));emit(JSON.stringify(report));process.exitCode=report.success?0:1;
