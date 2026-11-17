import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'search-reselection-dev',startedAt:new Date().toISOString(),checks:[],pending:[],success:false};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('RESELECTION_CONTROL_FAILED');};
const safeCode=e=>typeof e?.code==='string'&&/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e.code)&&!/[\r\n]/.test(e.code)?e.code:'SEARCH_RESELECTION_CHECK_FAILED';
let opened=0,closed=0,closeErrors=0,input='';
try{
 for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error('INPUT_LIMIT');}const {authorizedSessionId,deniedSessionId,commit}=JSON.parse(input);input='';
 for(const s of [authorizedSessionId,deniedSessionId])if(typeof s!=='string'||!/^[a-f0-9-]{36}$/i.test(s))throw Error('INVALID_INPUT');
 report.validatedCommit=/^[a-f0-9]{40}$/.test(commit??'')?commit:null;
 const {default:config}=await import('../config.js');check(config.env==='development'&&!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,'DEV_SAFE_CONFIGURATION');
 const prior=JSON.parse((await readFile(new URL('../prior-search-reselection-evidence.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 check(prior.validatedCommit==='0668b1b6ec981ec19f0b0e3953dca1136f68601b'&&prior.success&&prior.checks.length===452&&prior.checks.every(c=>c.passed)&&prior.cleanup?.length===2&&prior.cleanup.every(c=>c.passed)&&createHash('sha256').update(JSON.stringify(prior.checks)).digest('hex')==='103bbb1748b055eb87984ef1232748dfcc196e825bb86eab65228e0a0f1a2a0f','PRIOR_452_CHECK_EVIDENCE_VERIFIED');
 report.reusedEvidence={validatedCommit:prior.validatedCommit,checks:452,notRerun:true,scope:'Prior 452-check evidence retained with its SHA; only focused reselection, invalid/foreign choices, arguments and isolation before/after trimming are rechecked.'};
 const {default:driver}=await import('oracledb'),connect=driver.getConnection.bind(driver);
 driver.getConnection=async(...args)=>{const c=await connect(...args);opened++;c.callTimeout=60000;const close=c.close.bind(c);let done=false;c.close=async()=>{try{await close();if(!done){closed++;done=true;}}catch(e){closeErrors++;throw e;}};return c;};
 const {getValidOracleSession,withOracleProxySession}=await import('../src/services/sessions/oracleSession.service.js');
 const {executeTool}=await import('../src/services/ai/toolExecutor.service.js');
 const identities=[];for(const s of [authorizedSessionId,deniedSessionId]){const session=await getValidOracleSession(s);await withOracleProxySession(s,async({connection})=>{const row=(await connection.execute("SELECT USER ORACLE_USER,SYS_CONTEXT('USERENV','PROXY_USER') PROXY_USER FROM DUAL")).rows[0];check(String(row.ORACLE_USER).toUpperCase()===session.username&&Boolean(row.PROXY_USER),'ORACLE_SESSION_IDENTITY_MATCHES');identities.push(row.ORACLE_USER);});}
 check(identities[0]!==identities[1],'ORACLE_USERS_DISTINCT');identities.length=0;
 const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 let customers,categories;
 await withOracleProxySession(authorizedSessionId,async({connection})=>{
  const read=async sql=>{const rows=(await connection.execute(sql,{}, {maxRows:10001})).rows??[];check(rows.length<=10000,'ORACLE_INDEPENDENT_CATALOG_BOUNDED');return rows;};
  customers=await read("SELECT C.COD_CLIENTE ID,C.NOMBRE_FANTASIA LABEL FROM VW_BOT_CLIENTES C JOIN (SELECT DISTINCT COD_CLIENTE FROM VW_BOT_CONTRATOS_LOCALES WHERE TIP_CONTRATO='CNT' AND ESTADO='A') A ON A.COD_CLIENTE=C.COD_CLIENTE WHERE C.NOMBRE_FANTASIA IS NOT NULL");
  categories=await read('SELECT COD_RUBRO ID,DESCRIPCION LABEL FROM VW_BOT_RUBROS_LOCALES WHERE DESCRIPCION IS NOT NULL');
 });
 const profile=rows=>{
  const counts=new Map();for(const r of rows)counts.set(norm(r.LABEL),(counts.get(norm(r.LABEL))??0)+1);
  const unique=rows.filter(r=>counts.get(norm(r.LABEL))===1&&norm(r.LABEL));
  const distinct=[];for(const r of unique)if(!distinct.some(s=>s.id===String(r.ID)))distinct.push({search:r.LABEL,id:String(r.ID)});
  const ambiguous=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(c=>!counts.has(c)&&rows.filter(r=>norm(r.LABEL).includes(c)).length>=2);
  return distinct.length>=2&&ambiguous?{options:distinct.slice(0,2),ambiguous}:null;
 };
 const cProfile=profile(customers),rProfile=profile(categories);
 if(!cProfile||!rProfile)report.pending.push('COMBINED_CUSTOMER_CATEGORY_REAL_PROFILE_MISSING');else{
  report.phase='HTTP_PERSISTENT_RESELECTION';const start=Date.now();
  const {checkSearchCorrectionsHttp}=await import('./check-search-corrections-http.mjs');
  await checkSearchCorrectionsHttp({sessionId:authorizedSessionId,deniedSessionId,reselectionProfile:true,compositionProfile:{customers:cProfile.options,categories:rProfile.options,ambiguousCustomerSearch:cProfile.ambiguous,ambiguousCategorySearch:rProfile.ambiguous},
   lookup:async(args,context,name)=>{
    const result=await executeTool({name,arguments:args,context});
    const customer=name==='search_customers',source=customer?customers:categories,selected=customer?result.customer?.codCliente:result.category?.codRubro;
    const exact=source.filter(r=>norm(r.LABEL)===norm(args.search));
    if(exact.length===1)check(result.status==='RESOLVED'&&String(selected)===String(exact[0].ID),'ORACLE_EXACT_LOOKUP_AGREES_WITH_INDEPENDENT_'+name);
    else if(result.status==='AMBIGUOUS')check(result.options.every(o=>source.some(r=>String(r.ID)===String(customer?o.codCliente:o.codRubro))),'ORACLE_OPTIONS_BELONG_TO_AUTHORIZED_CATALOG_'+name);
    return result;
   },check});
  report.httpMilliseconds=Date.now()-start;report.httpScope={routeControllerChat:'candidate source',authentication:'real DEV session validation',lookups:'real Oracle DEV independently checked',model:'controlled with protected PII inputs',otherCatalog:'controlled search_members options',businessConsumers:'input spies; no sales or purchases queried',history:'prior message objects unchanged after every request, including history trimming'};
 }
 check(opened===closed&&closeErrors===0,'ALL_PROXY_CONNECTIONS_CLOSED');report.success=report.checks.every(c=>c.passed);
}catch(e){report.error={code:safeCode(e),message:'No se completó el control de resolución persistente DEV.'};}
finally{if(!report.checks.some(c=>c.code==='ALL_PROXY_CONNECTIONS_CLOSED'))report.checks.push({code:'ALL_PROXY_CONNECTIONS_CLOSED',passed:opened===closed&&closeErrors===0});}
report.finishedAt=new Date().toISOString();output(JSON.stringify(report));process.exit(report.success?0:1);
