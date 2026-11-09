// Read-only DEV contrast. All identities, arguments, binds and rows stay in memory.
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
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
const {runWithRequestSignal}=await app('src/services/requestContext.service.js');
const {default:driver}=await import('oracledb');
let plans=[],categoryId,modelCustomerId,alternateCategoryId,alternateCategoryName,lastAnswer,positiveSnapshot;
const monthly={dateFrom:'01/01/2023',dateTo:'31/05/2023',groupBy:['month'],metrics:['totalAmount']};
const step=(name,input)=>({name,input});
const controlledPlans=message=>{
 const text=String(message).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^[^a-z0-9]+/,'');
 if(text==='cuanto vendieron los locales de enero a mayo de 2023, por mes?')return [step('get_sales',monthly)];
 if(text==='ventas de nike de enero a abril de 2023')return [step('search_customers',{search:'Nike'})];
 if(text==='ventas del rubro libreria durante 2023, por mes')return [step('search_categories',{search:'libreria'}),step('get_sales',{...monthly,customerIds:[modelCustomerId],categoryIds:[categoryId],dateFrom:'01/01/2024',dateTo:'31/12/2024',groupBy:['year'],dayType:'weekend'})];
 if(text==='filtra tambien por libreria')return [step('search_categories',{search:'libreria'}),step('get_sales',{categoryIds:[categoryId]})];
 if(/^\d+$/.test(text))return [step('get_sales',{...monthly,customerIds:[modelCustomerId],dateFrom:'01/01/2024',dateTo:'31/12/2024',groupBy:['year'],dayType:'weekend'})];
 if(text==='muestra solo el importe')return [step('get_sales',{metrics:['totalAmount','totalInvoices']})];
 if(text==='solo cantidad de facturas'||text==='ambas metricas')return [step('get_sales',{metrics:['totalAmount']})];
 if(text==='cambia el rubro')return [step('search_categories',{search:alternateCategoryName}),step('get_sales',{metrics:['totalAmount']})];
 if(text==='todos los locales')return [step('get_sales',{customerIds:[modelCustomerId],dateFrom:'01/01/2024',dateTo:'31/12/2024',groupBy:['year'],metrics:['totalAmount']})];
 if(text==='todos los rubros')return [step('get_sales',{metrics:['totalAmount']})];
 throw Error('CONTROL_MESSAGE_NOT_PLANNED');
};
const sdk={BedrockRuntimeClient:class{async send(){const next=plans.shift();return {stopReason:next?'tool_use':'end_turn',output:{message:{role:'assistant',content:next?[{toolUse:{name:next.name,toolUseId:'controlled-'+modelCalls,input:['search_categories','search_customers'].includes(next.name)?next.input:protectPiiDeep(sessionId,next.input)}}]:[{text:'Consulta controlada completada.'}]}}};}},ConverseCommand:class{}};
const nativeFetch=globalThis.fetch;let external=0;globalThis.fetch=()=>{external++;throw Error('EXTERNAL_HTTP_DISABLED');};
const report={suite:'sales-scope-metrics-dev',commit:process.argv[2],startedAt:new Date().toISOString(),success:false,checks:[],model:'controlled amount-only proposals; isolated candidate chat/service/repositories with real Oracle; authorized catalog scope; no real model',oracle:'independent SELECT on unchanged authorized views'};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CONTROL_FAILED');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),near=(a,b)=>Math.abs(Number(a)-Number(b))<=Math.max(.000001,Math.abs(Number(b))*1e-10);
let sessionId,opened=0,closed=0,closeErrors=0,modelCalls=0,turnCalls=0,active=false,timer;
let captured=[],statements=[];
const connect=driver.getConnection.bind(driver);
driver.getConnection=async(...a)=>{const c=await connect(...a);opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);let done=false;
 c.execute=async(...args)=>{if(active&&typeof args[0]==='string'&&args[0].includes('VW_BOT_VENTAS_LOCALES'))statements.push({sql:args[0],binds:structuredClone(args[1])});return execute(...args);};
 c.close=async()=>{try{await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};return c;};
const query=(sql,binds={})=>withOracleProxySession(sessionId,async({connection})=>{
 if(!/^\s*SELECT\b/i.test(sql))throw Error('READ_ONLY_REQUIRED');
 const rows=(await connection.execute(sql,binds,{outFormat:4002,maxRows:1001})).rows;if(rows.length>1000)throw Error('ROW_LIMIT');return rows;
});
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});
const wrapped={...sdk,BedrockRuntimeClient:class extends sdk.BedrockRuntimeClient{async send(...args){modelCalls++;if(++turnCalls>6||modelCalls>80)throw Error('MODEL_LIMIT');return super.send(...args);}}};
const url=new URL('src/services/ai/chat.service.js',root),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?wrapped:spec==='./toolExecutor.service.js'?{executeTool:async request=>{
 if(!['search_customers','search_categories','get_sales'].includes(request.name))throw Error('TOOL_OUT_OF_SCOPE');
 active=true;try{const result=await executeTool(request);if(request.name==='search_customers'&&result.status==='RESOLVED')plans.push(step('get_sales',{...monthly,dateTo:'30/04/2023',customerIds:[result.customer.codCliente]}));captured.push({name:request.name,args:structuredClone(request.arguments),result});return result;}finally{active=false;}
}}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
await chat.evaluate();
async function turn(message,{allowPending=false}={}){
 captured=[];statements=[];turnCalls=0;plans=controlledPlans(message);const abort=new AbortController();timer=setTimeout(()=>abort.abort(),120000);
 try{const response=await runWithRequestSignal(abort.signal,()=>chat.namespace.chatService({sessionId,message}));lastAnswer=response.answer;}finally{clearTimeout(timer);timer=null;}
 const sales=captured.filter(c=>c.name==='get_sales');check(sales.length===1||allowPending&&sales.length===0,'FRESH_SALES_QUERY_OR_EXPLICIT_PENDING_LOOKUP');return sales[0];
}
async function verify(sales,expected,label){
 const a=sales.args,metrics=expected.metrics??['totalAmount','totalInvoices'];check(same(a.metrics,metrics),label+'_EFFECTIVE_METRICS_MATCH_USER_POLICY');check(a.dateFrom===expected.dateFrom&&a.dateTo===expected.dateTo&&same(a.groupBy,['month'])&&!a.dayType&&same(a.customerIds??[],expected.customerIds??[])&&same(a.categoryIds??[],expected.categoryIds??[]),label+'_FINAL_ARGUMENTS');
 check(statements.length===1&&/COD_CLIENTE\s+IN/i.test(statements[0].sql)===Boolean(expected.customerIds?.length)&&/COD_RUBRO\s+IN/i.test(statements[0].sql)===Boolean(expected.categoryIds?.length)&&statements[0].binds.dateFrom===expected.dateFrom&&statements[0].binds.dateTo===expected.dateTo,label+'_EFFECTIVE_SQL');
 const binds={f:expected.dateFrom,t:expected.dateTo},where=["FECHA>=TO_DATE(:f,'DD/MM/YYYY')","FECHA<TO_DATE(:t,'DD/MM/YYYY')+1"];
 for(const[col,ids,p]of [['COD_CLIENTE',expected.customerIds,'c'],['COD_RUBRO',expected.categoryIds,'r']])if(ids?.length)where.push(`${col} IN (${ids.map((id,i)=>{binds[p+i]=id;return ':'+p+i;}).join(',')})`);
 const control=await query(`SELECT TO_CHAR(FECHA,'MM') M,DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A,SUM(NVL(CANTIDAD_FACTURAS,0)) I FROM VW_BOT_VENTAS_LOCALES WHERE ${where.join(' AND ')} GROUP BY TO_CHAR(FECHA,'MM'),DES_MONEDA,SIGLAS_MONEDA ORDER BY M,D,S`,binds);
 check(/SUM\(CANTIDAD_FACTURAS\)/.test(statements[0].sql)===metrics.includes('totalInvoices')&&/SUM\(MONTO_TOTAL\)/.test(statements[0].sql)===metrics.includes('totalAmount'),label+'_SQL_SELECTS_ONLY_EFFECTIVE_METRICS');
 const rows=sales.result.data??[];check(!sales.result.resultSet?.truncated&&rows.length===control.length&&rows.every(row=>control.some(c=>c.M===row.month&&c.D===row.currency.description&&c.S===row.currency.abbreviation&&(metrics.includes('totalAmount')?Object.hasOwn(row,'totalAmount')&&near(row.totalAmount,c.A):!Object.hasOwn(row,'totalAmount'))&&(metrics.includes('totalInvoices')?Object.hasOwn(row,'totalInvoices')&&near(row.totalInvoices,c.I):!Object.hasOwn(row,'totalInvoices')))),label+'_ALL_MONTHS_AMOUNTS_INVOICES_CURRENCIES_MATCH_ORACLE');
 const expectedScope={customers:[],categories:[]};
 for(const id of expected.customerIds??[]){const names=await query('SELECT COD_CLIENTE I,NOMBRE_FANTASIA N FROM VW_BOT_CLIENTES WHERE COD_CLIENTE=:id',{id});check(names.length===1,label+'_CUSTOMER_CATALOG_ID_UNIQUE');expectedScope.customers.push({customerId:String(id),customerName:names[0].N.trim()});}
 for(const id of expected.categoryIds??[]){const names=await query('SELECT COD_RUBRO I,DESCRIPCION N FROM VW_BOT_RUBROS_LOCALES WHERE COD_RUBRO=:id',{id});check(names.length===1,label+'_CATEGORY_CATALOG_ID_UNIQUE');expectedScope.categories.push({categoryId:String(id),categoryName:names[0].N.trim()});}
 check(same(sales.result.scope,expectedScope),label+'_SCOPE_NAMES_MATCH_INDEPENDENT_AUTHORIZED_IDS');
 const escaped=value=>String(value).replace(/([\\\x60*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');
 check([...expectedScope.customers.map(x=>x.customerName),...expectedScope.categories.map(x=>x.categoryName)].every(name=>lastAnswer.includes(escaped(name)))&&!/locales seleccionados|rubros seleccionados|\[PII_/.test(lastAnswer),label+'_PRESENTATION_USES_AUTHORIZED_NAMES_NO_STALE_PLACEHOLDERS');
 check(!rows.length||(lastAnswer.includes('Ventas totales')===metrics.includes('totalAmount'))&&(lastAnswer.includes('Cantidad de facturas')===metrics.includes('totalInvoices')),label+'_PRESENTATION_METRIC_COLUMNS_OR_EMPTY_RESULT');
 report.positiveAmountAndInvoiceGroups=(report.positiveAmountAndInvoiceGroups??0)+rows.filter(row=>Number(row.totalAmount)>0&&Number(row.totalInvoices)>0).length;
 const state=store.getSearchResolutions(sessionId),persisted=restorePiiDeep(sessionId,state.contexts.get_sales);
 check(same(persisted,a),label+'_PERSISTENT_ARGUMENTS');
 check(opened===closed&&!closeErrors,label+'_CONNECTIONS_CLOSED');
}
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads&&/^[a-f0-9]{40}$/.test(report.commit??''),'SAFE_DEV_COMMITTED_CANDIDATE');
 check(controlledPlans('\u00bfCu\u00e1nto vendieron los locales de enero a mayo de 2023, por mes?')[0].name==='get_sales'&&controlledPlans('Ventas del rubro librer\u00eda durante 2023, por mes')[0].input.search==='libreria'&&controlledPlans('Filtra tambi\u00e9n por librer\u00eda').length===2&&controlledPlans('2')[0].name==='get_sales','CONTROLLED_PLAN_GRAMMAR_VALID');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({success:true,preflight:true}));process.exit(0);}
 let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error();}sessionId=JSON.parse(input).sessionId;input='';
 if(!/^[a-f0-9-]{36}$/i.test(sessionId??''))throw Error();
 const valid=await getValidOracleSession(sessionId);
 await withOracleProxySession(sessionId,async({connection})=>{const r=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{},{outFormat:4002})).rows[0];check(String(r.U).toUpperCase()===valid.username&&Boolean(r.P),'PROXY_IDENTITY_MATCHES_SESSION');});
 const categories=await query("SELECT COD_RUBRO R FROM VW_BOT_RUBROS_LOCALES WHERE REGEXP_REPLACE(TRANSLATE(UPPER(DESCRIPCION),'ÁÉÍÓÚÜÑ','AEIOUUN'),'[^A-Z0-9]','')='LIBRERIA'");
 // Match the requested brand independently, allowing catalog punctuation and
 // suffixes. An exact match outranks partial matches; never choose among peers.
 const customers=await query("SELECT C.COD_CLIENTE C,CASE WHEN REGEXP_REPLACE(UPPER(C.NOMBRE_FANTASIA),'[^A-Z0-9]','')='NIKE' THEN 1 ELSE 0 END E FROM VW_BOT_CLIENTES C WHERE INSTR(REGEXP_REPLACE(UPPER(C.NOMBRE_FANTASIA),'[^A-Z0-9]',''),'NIKE')>0 AND EXISTS(SELECT 1 FROM VW_BOT_CONTRATOS_LOCALES L WHERE L.COD_CLIENTE=C.COD_CLIENTE AND L.TIP_CONTRATO='CNT' AND L.ESTADO='A')");
 const exact=customers.filter(row=>row.E===1),eligible=exact.length?exact:customers;
 report.catalog={categoryExactMatches:categories.length,customerExactMatches:exact.length,customerPartialMatches:customers.length,eligibleCustomerMatches:eligible.length};
 check(categories.length===1&&eligible.length>=1&&eligible.length<=5,'INDEPENDENT_REQUESTED_CATALOG_COHORTS');const r=String(categories[0].R),customerIds=new Set(eligible.map(row=>String(row.C)));categoryId=r;modelCustomerId=String(eligible[0].C);
 store.clearConversation(sessionId);
 const first=await turn('¿Cuánto vendieron los locales de enero a mayo de 2023, por mes?');await verify(first,{dateFrom:'01/01/2023',dateTo:'31/05/2023'},'ALL_LOCALS');
 const nikeQuestion='Ventas de Nike de enero a abril de 2023',nike=await turn(nikeQuestion,{allowPending:true});
 const profiles=[];
 const saveProfile=c=>profiles.push({c,history:structuredClone(store.getConversation(sessionId)),state:store.getSearchResolutions(sessionId)});
 if(nike){
  check(nike.args.customerIds?.length===1&&customerIds.has(String(nike.args.customerIds[0])),'NIKE_RESOLUTION_BELONGS_TO_INDEPENDENT_CATALOG');
  await verify(nike,{dateFrom:'01/01/2023',dateTo:'30/04/2023',customerIds:nike.args.customerIds},'NIKE');saveProfile(nike.args.customerIds[0]);
 }else{
  const pendingState=store.getSearchResolutions(sessionId),pendingHistory=structuredClone(store.getConversation(sessionId));
  const pending=restorePiiDeep(sessionId,pendingState.domains.search_customers);
  const matchedOptions=(pending?.result?.options??[]).filter(o=>customerIds.has(String(o.codCliente)));
  report.catalog.resolverOptions=pending?.result?.options?.length??0;report.catalog.independentlyMatchedOptions=matchedOptions.length;
  check(pending?.kind==='pending'&&matchedOptions.length===customerIds.size&&new Set(matchedOptions.map(o=>String(o.codCliente))).size===customerIds.size,'NIKE_AMBIGUITY_CONTAINS_ENTIRE_INDEPENDENT_COHORT');
  report.catalogSelection='controlled numeric choices cover every independently matched Nike candidate; isolated candidate with real Oracle; no real-model or HTTP chat claim';
  const literalThird=await turn('Ventas del rubro librería durante 2023, por mes');await verify(literalThird,{dateFrom:'01/01/2023',dateTo:'31/12/2023',categoryIds:[r]},'LITERAL_THIRD_AFTER_PENDING_NIKE');
  check(store.getSearchResolutions(sessionId).domains.search_customers.kind==='cleared','LITERAL_THIRD_CLEARS_PENDING_NIKE');
  for(const option of matchedOptions){
   store.setSearchResolutions(sessionId,pendingState);store.setConversation(sessionId,structuredClone(pendingHistory));
   const choice=String(option.optionId??option.option),selected=await turn(choice);
   check(String(restorePiiDeep(sessionId,store.getSearchResolutions(sessionId).domains.search_customers).selected?.codCliente)===String(option.codCliente),'CONTROLLED_CHOICE_SELECTS_ONLY_ITS_LEGITIMATE_NIKE');
   await verify(selected,{dateFrom:'01/01/2023',dateTo:'30/04/2023',customerIds:[String(option.codCliente)]},'SELECTED_NIKE');saveProfile(String(option.codCliente));
  }
 }
 report.selectedNikeProfiles=profiles.length;
 for(const [profileIndex,{c,history,state}] of profiles.entries())for(const trimmed of [false,true])for(const autonomous of [true,false]){
  store.setSearchResolutions(sessionId,state);let messages=structuredClone(history);
  if(trimmed){for(let i=0;i<14;i++)messages=trimConversation([...messages,{role:'user',content:[{text:`Tema de control ${i}`}]},{role:'assistant',content:[{text:'Respuesta de control'}]}],10);check(!messages.some(m=>m.content?.some(b=>b.toolUse)),'ACTUAL_TRIM_EVICTS_PRIOR_TOOL_CALLS');}
  store.setConversation(sessionId,messages);
  const label=`NIKE_PROFILE_${profileIndex+1}_`+(autonomous?'AUTONOMOUS':'ADDITIVE')+(trimmed?'_TRIMMED':'_FULL');
  const sales=await turn(autonomous?'Ventas del rubro librería durante 2023, por mes':'Filtra también por librería');
  await verify(sales,{dateFrom:'01/01/2023',dateTo:autonomous?'31/12/2023':'30/04/2023',categoryIds:[r],...(autonomous?{}:{customerIds:[c]})},label);
  if(autonomous)positiveSnapshot={state:store.getSearchResolutions(sessionId),history:structuredClone(store.getConversation(sessionId))};
  const final=store.getSearchResolutions(sessionId);check(final.domains.search_customers.kind===(autonomous?'cleared':'selected')&&final.domains.search_categories.kind==='selected',label+'_RESOLUTION_STATE');
 }
 const crop=()=>{let h=store.getConversation(sessionId);for(let i=0;i<14;i++)h=trimConversation([...h,{role:'user',content:[{text:'Tema controlado'}]},{role:'assistant',content:[{text:'Respuesta'}]}],10);check(!h.some(m=>m.content?.some(b=>b.toolUse)),'EXTRA_CASES_ACTUAL_HISTORY_TRIM');store.setConversation(sessionId,h);};
 store.setSearchResolutions(sessionId,positiveSnapshot.state);store.setConversation(sessionId,positiveSnapshot.history);
 for(const [message,metrics,label]of [['Muestra solo el importe',['totalAmount'],'ONLY_AMOUNT'],['Solo cantidad de facturas',['totalInvoices'],'ONLY_INVOICES'],['Ambas metricas',['totalAmount','totalInvoices'],'RESTORE_BOTH']]){
  crop();const result=await turn(message);await verify(result,{dateFrom:'01/01/2023',dateTo:'31/12/2023',categoryIds:[r],metrics},label);
 }
 const profile=profiles[0];store.setSearchResolutions(sessionId,profile.state);store.setConversation(sessionId,profile.history);crop();
 const beforeRemoval=await turn('Filtra tambi\u00e9n por librer\u00eda');await verify(beforeRemoval,{dateFrom:'01/01/2023',dateTo:'30/04/2023',customerIds:[profile.c],categoryIds:[r]},'REMOVAL_PRECONDITION_CONFIRMS_LOCAL_CATEGORY_PERIOD');
 const removed=await turn('Todos los locales');await verify(removed,{dateFrom:'01/01/2023',dateTo:'30/04/2023',categoryIds:[r]},'EXPLICIT_LOCAL_REMOVAL_KEEPS_CATEGORY_PERIOD_GROUP');
 const alternate=await query("SELECT C.COD_RUBRO R,C.DESCRIPCION N FROM VW_BOT_RUBROS_LOCALES C WHERE C.COD_RUBRO<>:r AND NOT EXISTS(SELECT 1 FROM VW_BOT_RUBROS_LOCALES X WHERE UPPER(TRIM(X.DESCRIPCION))=UPPER(TRIM(C.DESCRIPCION)) AND X.COD_RUBRO<>C.COD_RUBRO) ORDER BY C.COD_RUBRO FETCH FIRST 1 ROWS ONLY",{r});
 check(alternate.length===1,'ALTERNATE_LEGITIMATE_CATEGORY_AVAILABLE');alternateCategoryId=String(alternate[0].R);alternateCategoryName=alternate[0].N;crop();
 const changed=await turn('Cambia el rubro');await verify(changed,{dateFrom:'01/01/2023',dateTo:'30/04/2023',categoryIds:[alternateCategoryId]},'CATEGORY_CHANGE_REPLACES_ONLY_ITS_AUTHORIZED_LABEL');
 const cleared=await turn('Todos los rubros');await verify(cleared,{dateFrom:'01/01/2023',dateTo:'30/04/2023'},'CATEGORY_REMOVAL_HAS_NO_OLD_CATEGORY_LABEL');
 check(report.positiveAmountAndInvoiceGroups>0,'POSITIVE_AMOUNT_AND_INVOICE_GROUPS_RECONCILED');check(external===0,'NO_REAL_MODEL_OR_PROVIDER_HTTP_CALL');report.success=true;
}catch(e){report.error={code:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4}|SEARCH_[A-Z_]+)$/.test(e?.code??'')?e.code:'SALES_CATEGORY_CONTROL_FAILED'};}
finally{globalThis.fetch=nativeFetch;if(timer)clearTimeout(timer);if(sessionId)store.clearConversation(sessionId);sessionId=null;report.connectionsClosed=opened===closed&&!closeErrors;if(!report.connectionsClosed)report.success=false;}
report.controlledModelCalls=modelCalls;report.realModelCalls=0;report.providerCalls=external;report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
