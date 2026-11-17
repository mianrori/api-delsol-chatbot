import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'search-corrections-dev',startedAt:new Date().toISOString(),checks:[],timings:[],pending:[],success:false};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CORRECTION_CONTROL_FAILED');};
const safeCode=e=>typeof e?.code==='string'&&/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e.code)&&!/[\r\n]/.test(e.code)?e.code:'SEARCH_CORRECTION_CHECK_FAILED';
let opened=0,closed=0,closeErrors=0,input='';
try{
 for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error('INVALID_INPUT');}const {authorizedSessionId,deniedSessionId,commit}=JSON.parse(input);input='';
 for(const s of [authorizedSessionId,deniedSessionId])if(typeof s!=='string'||!/^[a-f0-9-]{36}$/i.test(s))throw Error('INVALID_INPUT');
 report.validatedCommit=/^[a-f0-9]{40}$/.test(commit??'')?commit:null;
 const {default:config}=await import('../config.js');check(config.env==='development'&&!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,'DEV_SAFE_CONFIGURATION');
 const prior=JSON.parse((await readFile(new URL('../prior-search-evidence.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const priorHash=createHash('sha256').update(JSON.stringify(prior.checks)).digest('hex');
 check(prior.validatedCommit==='7ced8d92bca52ff3f0ca20548e7de08517a542e1'&&prior.success&&prior.checks.length===100&&prior.checks.every(c=>c.passed)&&priorHash==='03e8cc8fd4b4c49db303c7d1f9e6881ef5b4658f39275c4e193afe907a6e811b','PRIOR_100_CHECK_EVIDENCE_VERIFIED');
 report.reusedEvidence={validatedCommit:prior.validatedCommit,checks:100,notRerun:true,scope:'Unchanged lookup implementations and prior denials; approximate ordering and conversation guards rechecked below.'};
 const {default:driver}=await import('oracledb'),connect=driver.getConnection.bind(driver);
 driver.getConnection=async(...args)=>{const c=await connect(...args);opened++;c.callTimeout=60000;const close=c.close.bind(c);let done=false;c.close=async()=>{try{await close();if(!done){closed++;done=true;}}catch(e){closeErrors++;throw e;}};return c;};
 const {getValidOracleSession,withOracleProxySession}=await import('../src/services/sessions/oracleSession.service.js');
 const {executeTool}=await import('../src/services/ai/toolExecutor.service.js');
 const users=[];for(const s of [authorizedSessionId,deniedSessionId]){const resolved=await getValidOracleSession(s);await withOracleProxySession(s,async({connection})=>{const row=(await connection.execute("SELECT USER ORACLE_USER,SYS_CONTEXT('USERENV','PROXY_USER') PROXY_USER FROM DUAL")).rows[0];check(String(row.ORACLE_USER).toUpperCase()===resolved.username&&Boolean(row.PROXY_USER),'ORACLE_SESSION_IDENTITY_MATCHES');users.push(row.ORACLE_USER);});}
 check(users[0]!==users[1],'ORACLE_USERS_DISTINCT');users.length=0;
 let httpProfile;
 await withOracleProxySession(authorizedSessionId,async({connection})=>{
  const read=async sql=>{const rows=(await connection.execute(sql,{}, {maxRows:10001})).rows??[];if(rows.length>10000)throw Error('CONTROL_ROW_LIMIT');return rows;};
  report.phase='ORACLE_CONTROLLED_TIES';let start=Date.now();const {checkSearchPromotionTies}=await import('./check-search-promotion-ties.mjs');await checkSearchPromotionTies(connection,check);report.timings.push({code:report.phase,milliseconds:Date.now()-start});
  report.phase='ORACLE_REAL_APPROXIMATE_TRAVERSAL';start=Date.now();
  const {promotionApproximateControl,promotionControlKey}=await import('./search-promotion-independent-control.mjs');
  const source=await read("SELECT DISTINCT COD_PROMOCION,COD_CAMPANIA,NOMBRE_PROMOCION,NOMBRE_CAMPANIA,TO_CHAR(FECHA_DESDE,'DD/MM/YYYY') FECHA_DESDE,TO_CHAR(FECHA_HASTA,'DD/MM/YYYY') FECHA_HASTA FROM VW_BOT_PROMOCIONES");
  const fixture=promotionApproximateControl(source,Number(config.minSimilarity??65));
  if(!fixture)report.pending.push('PROMOTION_APPROXIMATE_REAL_SAMPLE_MISSING');else{
   const rows=Math.max(1,Math.ceil(fixture.expected.length/10));check(rows<=50,'ORACLE_REAL_TRAVERSAL_BOUNDED');
   const actual=[];for(let page=1;page<=Math.ceil(fixture.expected.length/rows)+1;page++){
    const r=await executeTool({name:'search_promotions',arguments:{search:fixture.search,page,rows},context:{sessionId:authorizedSessionId}});
    check(r.matchMode==='approximate'&&r.totalRows===fixture.expected.length,'ORACLE_REAL_TOTAL_'+page);
    check(r.hasMore===(page*rows<r.totalRows)&&r.nextPage===(page*rows<r.totalRows?page+1:null),'ORACLE_REAL_NEXT_PAGE_'+page);
    if(r.totalRows>1)check(r.status==='AMBIGUOUS','ORACLE_REAL_FINAL_PAGE_STAYS_AMBIGUOUS_'+page);
    const options=r.status==='RESOLVED'?[r.promotion]:r.options;
    actual.push(...options.map(o=>JSON.stringify([o.promotionId,o.campaignId,o.promotionName??null,o.campaignName??null,o.dateFrom??null,o.dateTo??null])));
   }
   check(JSON.stringify(actual)===JSON.stringify(fixture.expected.map(promotionControlKey)),'ORACLE_REAL_FULL_ORDERED_SEQUENCE_RECONCILED');
   check(new Set(actual).size===actual.length,'ORACLE_REAL_OPTIONS_UNIQUE');
   let denied=false;try{await executeTool({name:'search_promotions',arguments:{search:fixture.search,page:1,rows:1},context:{sessionId:deniedSessionId}});}catch(e){denied=e.code==='ACCESS_DENIED'&&[942,1031].includes(Number(e.errorNum));}check(denied,'ORACLE_CHANGED_LOOKUP_DENIED_NO_DATA');
  }
  report.timings.push({code:report.phase,milliseconds:Date.now()-start});
  const categories=await read('SELECT COD_RUBRO,DESCRIPCION FROM VW_BOT_RUBROS_LOCALES WHERE DESCRIPCION IS NOT NULL');
  const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const letter=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(c=>categories.filter(r=>norm(r.DESCRIPCION).includes(c)).length>=2);
  const unique=categories.find(r=>categories.filter(v=>norm(v.DESCRIPCION)===norm(r.DESCRIPCION)).length===1);
  if(letter&&unique)httpProfile={ambiguousSearch:letter,uniqueSearch:unique.DESCRIPCION};else report.pending.push('HTTP_CATEGORY_AMBIGUOUS_AND_UNIQUE_SAMPLE_MISSING');
 });
 if(httpProfile){report.phase='HTTP_CANDIDATE_CONVERSATIONS';const start=Date.now();const {checkSearchCorrectionsHttp}=await import('./check-search-corrections-http.mjs');
  await checkSearchCorrectionsHttp({...httpProfile,sessionId:authorizedSessionId,deniedSessionId,lookup:(args,context)=>executeTool({name:'search_categories',arguments:args,context}),check});
  report.timings.push({code:report.phase,milliseconds:Date.now()-start});report.httpScope={routeControllerChat:'candidate source',authentication:'real DEV session validation',categoryLookups:'real Oracle DEV',model:'controlled',businessConsumers:'controlled input spies; no purchases/usages queried'};
 }
 check(opened===closed&&closeErrors===0,'ALL_PROXY_CONNECTIONS_CLOSED');report.success=report.checks.every(c=>c.passed);
}catch(e){report.error={code:safeCode(e),message:'No se completó el control de correcciones DEV.'};}
finally{if(!report.checks.some(c=>c.code==='ALL_PROXY_CONNECTIONS_CLOSED'))report.checks.push({code:'ALL_PROXY_CONNECTIONS_CLOSED',passed:opened===closed&&closeErrors===0});}
report.finishedAt=new Date().toISOString();output(JSON.stringify(report));process.exit(report.success?0:1);
