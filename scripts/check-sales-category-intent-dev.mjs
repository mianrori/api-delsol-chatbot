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
const {restorePiiDeep}=await app('src/services/ai/pii.service.js');
const {runWithRequestSignal}=await app('src/services/requestContext.service.js');
const {default:driver}=await import('oracledb');
const sdk=await import('@aws-sdk/client-bedrock-runtime');
const report={suite:'sales-category-intent-real',commit:process.argv[2],startedAt:new Date().toISOString(),success:false,checks:[],model:'real Bedrock; no stubs',oracle:'independent SELECT on unchanged authorized views'};
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
const wrapped={...sdk,BedrockRuntimeClient:class extends sdk.BedrockRuntimeClient{async send(...args){modelCalls++;if(++turnCalls>6||modelCalls>40)throw Error('MODEL_LIMIT');return super.send(...args);}}};
const url=new URL('src/services/ai/chat.service.js',root),chat=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
await chat.link(async spec=>synthetic(spec==='@aws-sdk/client-bedrock-runtime'?wrapped:spec==='./toolExecutor.service.js'?{executeTool:async request=>{
 if(!['search_customers','search_categories','get_sales'].includes(request.name))throw Error('TOOL_OUT_OF_SCOPE');
 active=true;try{const result=await executeTool(request);captured.push({name:request.name,args:structuredClone(request.arguments),result});return result;}finally{active=false;}
}}:await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
await chat.evaluate();
async function turn(message){
 captured=[];statements=[];turnCalls=0;const abort=new AbortController();timer=setTimeout(()=>abort.abort(),120000);
 try{await runWithRequestSignal(abort.signal,()=>chat.namespace.chatService({sessionId,message}));}finally{clearTimeout(timer);timer=null;}
 const sales=captured.filter(c=>c.name==='get_sales');check(sales.length===1,'ONE_FRESH_SALES_QUERY_PER_TURN');return sales[0];
}
async function verify(sales,expected,label){
 const a=sales.args;check(a.dateFrom===expected.dateFrom&&a.dateTo===expected.dateTo&&same(a.groupBy,['month'])&&!a.dayType&&same(a.customerIds??[],expected.customerIds??[])&&same(a.categoryIds??[],expected.categoryIds??[]),label+'_FINAL_ARGUMENTS');
 check(statements.length===1&&/COD_CLIENTE\s+IN/i.test(statements[0].sql)===Boolean(expected.customerIds?.length)&&/COD_RUBRO\s+IN/i.test(statements[0].sql)===Boolean(expected.categoryIds?.length)&&statements[0].binds.dateFrom===expected.dateFrom&&statements[0].binds.dateTo===expected.dateTo,label+'_EFFECTIVE_SQL');
 const binds={f:expected.dateFrom,t:expected.dateTo},where=["FECHA>=TO_DATE(:f,'DD/MM/YYYY')","FECHA<TO_DATE(:t,'DD/MM/YYYY')+1"];
 for(const[col,ids,p]of [['COD_CLIENTE',expected.customerIds,'c'],['COD_RUBRO',expected.categoryIds,'r']])if(ids?.length)where.push(`${col} IN (${ids.map((id,i)=>{binds[p+i]=id;return ':'+p+i;}).join(',')})`);
 const control=await query(`SELECT TO_CHAR(FECHA,'MM') M,DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A,SUM(NVL(CANTIDAD_FACTURAS,0)) I FROM VW_BOT_VENTAS_LOCALES WHERE ${where.join(' AND ')} GROUP BY TO_CHAR(FECHA,'MM'),DES_MONEDA,SIGLAS_MONEDA ORDER BY M,D,S`,binds);
 const rows=sales.result.data??[];check(!sales.result.resultSet?.truncated&&rows.length===control.length&&rows.every(row=>control.some(c=>c.M===row.month&&c.D===row.currency.description&&c.S===row.currency.abbreviation&&(!Object.hasOwn(row,'totalAmount')||near(row.totalAmount,c.A))&&(!Object.hasOwn(row,'totalInvoices')||near(row.totalInvoices,c.I)))),label+'_ALL_MONTHS_AMOUNTS_INVOICES_CURRENCIES_MATCH_ORACLE');
 const state=store.getSearchResolutions(sessionId),persisted=restorePiiDeep(sessionId,state.contexts.get_sales);
 check(same(persisted,a),label+'_PERSISTENT_ARGUMENTS');
 check(opened===closed&&!closeErrors,label+'_CONNECTIONS_CLOSED');
}
try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads&&/^[a-f0-9]{40}$/.test(report.commit??''),'SAFE_DEV_COMMITTED_CANDIDATE');
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
 check(categories.length===1&&eligible.length===1,'INDEPENDENT_UNIQUE_REQUESTED_CATALOG_IDENTITIES');const r=String(categories[0].R),c=String(eligible[0].C);
 store.clearConversation(sessionId);
 const first=await turn('¿Cuánto vendieron los locales de enero a mayo de 2023, por mes?');await verify(first,{dateFrom:'01/01/2023',dateTo:'31/05/2023'},'ALL_LOCALS');
 const nike=await turn('Ventas de Nike de enero a abril de 2023');await verify(nike,{dateFrom:'01/01/2023',dateTo:'30/04/2023',customerIds:[c]},'NIKE');
 const history=structuredClone(store.getConversation(sessionId)),state=store.getSearchResolutions(sessionId);
 for(const trimmed of [false,true])for(const autonomous of [true,false]){
  store.setSearchResolutions(sessionId,state);let messages=structuredClone(history);
  if(trimmed){for(let i=0;i<14;i++)messages=trimConversation([...messages,{role:'user',content:[{text:`Tema de control ${i}`}]},{role:'assistant',content:[{text:'Respuesta de control'}]}],10);check(!messages.some(m=>m.content?.some(b=>b.toolUse)),'ACTUAL_TRIM_EVICTS_PRIOR_TOOL_CALLS');}
  store.setConversation(sessionId,messages);
  const label=(autonomous?'AUTONOMOUS':'ADDITIVE')+(trimmed?'_TRIMMED':'_FULL');
  const sales=await turn(autonomous?'Ventas del rubro librería durante 2023, por mes':'Filtra también por librería');
  await verify(sales,{dateFrom:'01/01/2023',dateTo:autonomous?'31/12/2023':'30/04/2023',categoryIds:[r],...(autonomous?{}:{customerIds:[c]})},label);
  const final=store.getSearchResolutions(sessionId);check(final.domains.search_customers.kind===(autonomous?'cleared':'selected')&&final.domains.search_categories.kind==='selected',label+'_RESOLUTION_STATE');
 }
 report.success=true;
}catch(e){report.error={code:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4}|SEARCH_[A-Z_]+)$/.test(e?.code??'')?e.code:'SALES_CATEGORY_CONTROL_FAILED'};}
finally{if(timer)clearTimeout(timer);if(sessionId)store.clearConversation(sessionId);sessionId=null;report.connectionsClosed=opened===closed&&!closeErrors;if(!report.connectionsClosed)report.success=false;}
report.modelCalls=modelCalls;report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
