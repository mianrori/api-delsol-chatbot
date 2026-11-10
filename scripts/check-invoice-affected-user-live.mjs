// Existing process and real user only. No model replacement or isolated app.
import fs from 'node:fs';import crypto from 'node:crypto';
import config from '/app/config.js';import driver from '/app/node_modules/oracledb/index.js';
import {withOracleProxySession,getValidOracleSession} from '/app/src/services/sessions/oracleSession.service.js';
import {normalizeInvoicePlate} from '/app/src/utils/invoicePlate.js';
import {openInspector,verifyLoadedSource} from './inspector.mjs';
import {extractViewProjection,publicProjectionShape} from './projection.mjs';
const emit=process.stdout.write.bind(process.stdout);for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'affected-user-live-5400',baseCommit:process.argv[2],success:false,status:'running',checks:[],startedAt:new Date().toISOString(),modelSubstituted:false,accountSubstituted:false,httpChatRequests:0,conversationResets:0};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error(code);},h=(nonce,v)=>crypto.createHmac('sha256',nonce).update(String(v)).digest('hex');
let inspector,installed=false,sessionId,nonce,opened=0,closed=0,closeErrors=0;
const original=driver.getConnection.bind(driver);driver.getConnection=async(...a)=>{const c=await original(...a);opened++;c.callTimeout=60000;const close=c.close.bind(c);let done=false;c.close=async()=>{try{const r=await close();if(!done){done=true;closed++;}return r;}catch(e){closeErrors++;throw e;}};return c;};
const query=(sql,binds={})=>withOracleProxySession(sessionId,async({connection})=>{if(!/^\s*SELECT\b/.test(sql))throw Error('SELECT_ONLY');const rows=(await connection.execute(sql,binds,{outFormat:4002,maxRows:1001})).rows;if(rows.length>1000)throw Error('BOUNDED_ROWS_REQUIRED');return rows;});
const evaluate=expression=>inspector.evaluate(expression),trace='globalThis.__codexInvoiceAffectedTrace';
const responseClass=body=>/no tiene permisos|no est[a\u00e1] autorizado/i.test(body.response??'')&&!body.actions?.invoicePagination?'DENIED':body.actions?.invoicePagination?.totalRows===0?'ABSENT':body.actions?.invoicePagination?.totalRows>0?'AUTHORIZED':'OTHER';
async function postChat(message,step){await evaluate(trace+'.setStep('+JSON.stringify(step)+')');const response=await fetch('http://127.0.0.1:5400/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message}),signal:AbortSignal.timeout(120000)});report.httpChatRequests++;const body=await response.json();check(response.status===200&&body.env==='development'&&body.success===true,step+'_REAL_HTTP_CONTRACT');const snapshot=await evaluate(trace+'.snapshot()');return {body,snapshot,responseClass:responseClass(body),httpStatus:response.status};}
async function reset(){const response=await fetch('http://127.0.0.1:5400/chatbot/api/bot/chat/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId}),signal:AbortSignal.timeout(30000)});report.conversationResets++;const body=await response.json();check(response.status===200&&body.success===true,'OWNED_CONVERSATION_RESET');}
async function independentPlate(body){
 const binds={p:normalizeInvoicePlate('anx123')},filter="REGEXP_REPLACE(UPPER(MATRICULA),'[-[:space:]]','')=:p",allowed="NVL(USER_CAN_CONSULT,'S')<>'N' AND "+filter;
 const counts=(await query('SELECT COUNT(*) R,COUNT(DISTINCT NRO_FACTURA) I FROM VW_BOT_FACTURAS WHERE '+allowed,binds))[0],restricted=Number((await query("SELECT CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS WHERE USER_CAN_CONSULT='N' AND "+filter+") THEN 1 ELSE 0 END D FROM DUAL",binds))[0].D)===1;
 const classification=Number(counts.R)>0?(restricted?'MIXED':'AUTHORIZED'):(restricted?'RESTRICTED':'ABSENT');let agrees;
 if(classification==='RESTRICTED')agrees=responseClass(body)==='DENIED'&&Object.keys(body.actions??{}).length===0&&!/Ver PDF/.test(body.response);
 else{const p=body.actions?.invoicePagination;agrees=p?.totalRows===Number(counts.R)&&p?.totalInvoices===Number(counts.I);if(classification==='ABSENT')agrees&&=responseClass(body)==='ABSENT'&&/No se encontraron registros/.test(body.response);else{
  const expected=await query('SELECT * FROM (SELECT NRO_FACTURA N,NOM_CLIENTE C,DES_CONCEPTO K,IMPORTE A,PDF D FROM VW_BOT_FACTURAS WHERE '+allowed+' ORDER BY FECHA_EMISION DESC,NRO_FACTURA DESC,COD_CONCEPTO) WHERE ROWNUM<=20',binds),cell=v=>String(v??'Sin datos').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' '),lines=body.response.split('\n').filter(l=>l.startsWith('| '));
  agrees&&=lines.length===expected.length+2&&expected.every((r,i)=>lines[i+2].includes('| '+cell(r.N)+' |')&&lines[i+2].includes('| '+cell(r.C)+' |')&&lines[i+2].includes('| '+cell(r.K)+' |'));
 }}
 return {classification,httpAgreesWithIndependentOracle:Boolean(agrees),plateOpaque:h(nonce,binds.p),identitySameAsOwnedSession:true};
}
async function auditNormalization(){
 const p='ANX123',where="REGEXP_REPLACE(UPPER(MATRICULA),'[-[:space:]]','')=:p";
 const exact=(await query("SELECT CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND "+where+") THEN 1 ELSE 0 END A,CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS WHERE USER_CAN_CONSULT='N' AND "+where+") THEN 1 ELSE 0 END N FROM DUAL",{p}))[0];
 const candidates=await query("SELECT DISTINCT MATRICULA M,NVL(USER_CAN_CONSULT,'S') P FROM VW_BOT_FACTURAS WHERE MATRICULA IS NOT NULL AND INSTR(REGEXP_REPLACE(UPPER(MATRICULA),'[^A-Z0-9]',''),:p)>0",{p});
 const independent=value=>Array.from(String(value).toUpperCase()).filter(c=>c!=='-'&&c!=='\uFEFF'&&!/\p{White_Space}/u.test(c)).join('');
 const matches=candidates.filter(r=>independent(r.M)===p),otherAsciiExact=candidates.filter(r=>String(r.M).toUpperCase().replace(/[^A-Z0-9]/g,'')===p&&independent(r.M)!==p);
 const chars=[...new Set([...matches,...otherAsciiExact].flatMap(r=>Array.from(String(r.M)).filter(c=>!/^[A-Za-z0-9]$/.test(c)).map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'))))];
 const restrictedShapes=(await query("SELECT CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS WHERE USER_CAN_CONSULT='N' AND MATRICULA IS NULL) THEN 1 ELSE 0 END Z,CASE WHEN EXISTS(SELECT 1 FROM VW_BOT_FACTURAS WHERE USER_CAN_CONSULT='N' AND MATRICULA IS NOT NULL) THEN 1 ELSE 0 END V FROM DUAL"))[0];
 let definition={readable:false};try{
  const textRows=await query("SELECT TEXT FROM ALL_VIEWS WHERE VIEW_NAME=:v",{v:'VW_BOT_FACTURAS'});
  if(textRows.length===1&&typeof textRows[0].TEXT==='string'){
   const text=textRows[0].TEXT.toUpperCase(),beforeFrom=text.split(/\bFROM\b/)[0],simple=beforeFrom.split(',').some(x=>/^\s*(?:SELECT\s+)?(?:[A-Z0-9_$#]+\.)?MATRICULA(?:\s+(?:AS\s+)?MATRICULA)?\s*$/.test(x));
   definition={readable:true,uniqueVisibleDefinition:true,mentionsMatricula:/\bMATRICULA\b/.test(text),mentionsUserCanConsult:/\bUSER_CAN_CONSULT\b/.test(text),simpleDirectPlateProjection:simple,containsConditionalExpressions:/\b(?:CASE|DECODE)\b/.test(text),conditionalMaskingNotConcluded:true};
  }else definition={readable:textRows.length>0,uniqueVisibleDefinition:textRows.length===1,projectionNotConcluded:true};
 }catch(e){definition={readable:false,technicalCode:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'METADATA_UNAVAILABLE'};}
 const sqlAuthorized=Number(exact.A)===1,sqlRestricted=Number(exact.N)===1,independentAuthorized=matches.some(r=>r.P!=='N'),independentRestricted=matches.some(r=>r.P==='N');
 return {scope:'same affected identity, Oracle view only, no HTTP rerun',sqlExact:{anyAuthorized:sqlAuthorized,anyRestricted:sqlRestricted},independentUnicodeNormalization:{anyAuthorized:independentAuthorized,anyRestricted:independentRestricted,candidateScanComplete:true,anyCandidates:candidates.length>0,asciiExactButDifferentUnicodeNormalization:otherAsciiExact.length>0,nonAlphanumericCodePoints:chars},normalizationDiscrepancy:sqlAuthorized!==independentAuthorized||sqlRestricted!==independentRestricted,restrictedRowsWithNullPlate:Number(restrictedShapes.Z)===1,restrictedRowsWithNonNullPlate:Number(restrictedShapes.V)===1,viewDefinition:definition,noRowsOrPlateValuesExported:true};
}

async function auditViewProjection(){
 const roots=await query('SELECT OWNER,VIEW_NAME,TEXT FROM ALL_VIEWS WHERE VIEW_NAME=:v',{v:'VW_BOT_FACTURAS'});
 if(roots.length!==1)return {status:'definition_ambiguous_or_unavailable',uniqueVisibleDefinition:false,caseResolved:false};
 const pending=[{row:roots[0],depth:0}],seen=new Set(),views=[];let incomplete=false;
 while(pending.length&&views.length<6){const {row,depth}=pending.shift(),key=row.OWNER+'.'+row.VIEW_NAME;if(seen.has(key))continue;seen.add(key);
  if(typeof row.TEXT!=='string'){incomplete=true;continue;}const p=extractViewProjection(row.TEXT),functions=x=>new Set((String(x??'').match(/\b[A-Z_][A-Z0-9_$#]*(?=\s*\()/gi)??[]).map(x=>x.toUpperCase()).filter(x=>!['SELECT','NVL','DECODE','COALESCE','CASE','MAX','MIN','COUNT','SUM','UPPER','LOWER','TO_CHAR','TO_NUMBER'].includes(x)));
  const pf=functions(p.plate),uf=functions(p.permission);
  views.push({label:depth===0?'requested_view':'dependency_'+views.length,depth,definitionOpaque:h(nonce,row.TEXT),parsed:p.parsed,plateProjection:publicProjectionShape(p.plate),permissionProjection:publicProjectionShape(p.permission),plateExplicitlyReferencesPermissionField:/\bUSER_CAN_CONSULT\b/i.test(p.plate??''),plateContainsSubquery:/\bSELECT\b/i.test(p.plate??''),plateContainsConditional:/\b(?:CASE|DECODE)\b/i.test(p.plate??''),plateExpressionHasNullBranch:/\bNULL\b/i.test(p.plate??''),explicitNConditionNullsPlate:/\bUSER_CAN_CONSULT\s*=\s*'N'\s+THEN\s+NULL\b/i.test(p.plate??'')||/DECODE\s*\(\s*USER_CAN_CONSULT\s*,\s*'N'\s*,\s*NULL\b/i.test(p.plate??''),sharedNontrivialPermissionFunction:!![...pf].find(x=>uf.has(x)),projectionOnlyNoUnderlyingDataQueries:true});
  if(depth>=2)continue;
  try{const deps=await query("SELECT REFERENCED_OWNER O,REFERENCED_NAME N FROM ALL_DEPENDENCIES WHERE OWNER=:o AND NAME=:n AND REFERENCED_TYPE='VIEW'",{o:row.OWNER,n:row.VIEW_NAME});for(const dep of deps){if(seen.has(dep.O+'.'+dep.N))continue;const definitions=await query('SELECT OWNER,VIEW_NAME,TEXT FROM ALL_VIEWS WHERE OWNER=:o AND VIEW_NAME=:n',{o:dep.O,n:dep.N});if(definitions.length===1)pending.push({row:definitions[0],depth:depth+1});else incomplete=true;}}catch{incomplete=true;}
 }
 return {status:'metadata_inspected',views,dependencyInspectionCapped:pending.length>0,metadataUnavailableForSomeDependencies:incomplete,depthLimit:2,noBaseTableDataRead:true,noRawDefinitionOrOwnersExported:true,applicationCauseNotPresumed:true};
}

try{
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads&&report.baseCommit==='22f4b02c98003312bc1558746740cfc511e2dedd','SAFE_BASELINE_DEV');
 inspector=await openInspector();const expected=JSON.parse(fs.readFileSync(new URL('./expected.json',import.meta.url),'utf8'));report.loadedModules=await verifyLoadedSource(inspector,expected);report.loadedCodeMatchesBaseline=true;
 check(await evaluate("typeof process.getBuiltinModule('module').createRequire('/app/index.js')('/tmp/invoice-affected-live-trace/runtime.mjs').install === 'function'"),'RUNTIME_TRACE_MODULE_AVAILABLE');
 if(process.argv.includes('--preflight')){report.status='preflight';report.success=true;}
 else{
  let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(input).sessionId;input='';check(/^[a-f0-9-]{36}$/i.test(sessionId??''),'OWNED_LOGIN_SESSION_REQUIRED');nonce=crypto.randomBytes(32).toString('hex');
  const identity=await getValidOracleSession(sessionId),oracle=(await query("SELECT USER U,SYS_CONTEXT('USERENV','SESSION_USER') S,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL"))[0],normalize=v=>String(v??'').trim().toUpperCase();
  check(normalize(oracle.U)===normalize(identity.username)&&normalize(oracle.S)===normalize(identity.username)&&Boolean(oracle.P),'INDEPENDENT_ORACLE_USES_SAME_POSTGRES_SESSION_IDENTITY');report.identity={targetOpaque:h(nonce,normalize(identity.username)),oracleSessionMatches:true,proxyPresent:true};
  if(process.argv.includes('--projection-audit')){report.viewProjection=await auditViewProjection();report.status='projection_complete';report.caseResolved=false;report.success=true;}else if(process.argv.includes('--normalization-audit')){report.normalization=await auditNormalization();report.status='normalization_complete';report.caseResolved=false;report.success=true;}else{
  const installedInfo=await evaluate("process.getBuiltinModule('module').createRequire('/app/index.js')('/tmp/invoice-affected-live-trace/runtime.mjs').install("+JSON.stringify({sessionId,nonce,expectedPlate:'anx123'})+")");installed=true;check(installedInfo.installed&&installedInfo.targetIdentityOpaque===report.identity.targetOpaque,'TRACE_ATTACHED_TO_SAME_IDENTITY');
  const before=await evaluate(trace+'.snapshot()');check(before.calls.length===0,'NEW_OWNED_CONVERSATION_BEFORE_INITIAL');
  const initial=await postChat('facturas de arrendamiento m\u00ednimo del 2023 del local impacto','INITIAL');report.initial={httpStatus:initial.httpStatus,responseClass:initial.responseClass,trace:initial.snapshot};
  if(initial.responseClass!=='DENIED'){report.status='blocked';report.blocker='AFFECTED_INITIAL_DENIAL_NOT_REPRODUCED';report.caseResolved=false;}
  else{
   const sequential=await postChat('facturas de la matr\u00edcula anx123','SEQUENTIAL_PLATE');report.sequential={httpStatus:sequential.httpStatus,responseClass:sequential.responseClass,trace:sequential.snapshot,independentOracle:await independentPlate(sequential.body)};
   await reset();const fresh=await postChat('facturas de la matr\u00edcula anx123','FRESH_PLATE');report.fresh={httpStatus:fresh.httpStatus,responseClass:fresh.responseClass,trace:fresh.snapshot,independentOracle:await independentPlate(fresh.body)};
   const last=sequential.snapshot.currentCalls.find(c=>c.name==='get_invoices'),keys=Object.keys(last?.args??{});
   report.observations={inheritedFilterKeys:keys.filter(k=>['customerIds','conceptIds','dateFrom','dateTo','period','cancelled'].includes(k)),routeTools:sequential.snapshot.currentCalls.map(c=>c.name),sequentialAndFreshSameClass:sequential.responseClass===fresh.responseClass,restrictedSignalLost:report.sequential.independentOracle.classification==='RESTRICTED'&&sequential.responseClass==='ABSENT',sequentialAgreesWithOracle:report.sequential.independentOracle.httpAgreesWithIndependentOracle,freshAgreesWithOracle:report.fresh.independentOracle.httpAgreesWithIndependentOracle};
   report.exactBugReproduced=initial.responseClass==='DENIED'&&sequential.responseClass==='ABSENT'&&(!report.observations.sequentialAgreesWithOracle||!report.observations.sequentialAndFreshSameClass);
   report.status=report.exactBugReproduced?'reproduced':'not_reproduced';report.caseResolved=false;report.success=true;
  }
  }
 }
}catch(e){report.status='failed';report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'AFFECTED_USER_CONTROL_FAILED'};report.caseResolved=false;}
finally{
 if(installed){try{report.runtimeCleanup=await evaluate(trace+'.dispose()');if(!report.runtimeCleanup.driverRestored||!report.runtimeCleanup.connectionsClosed)report.success=false;}catch{report.runtimeCleanup={failed:true};report.success=false;}}
 if(sessionId&&report.httpChatRequests>0){try{await reset();}catch{report.conversationCleanupFailed=true;report.success=false;}}
 if(inspector){try{report.inspectorClosedOrPreviousStatePreserved=await inspector.close();if(!report.inspectorClosedOrPreviousStatePreserved)report.success=false;}catch{report.inspectorCleanupFailed=true;report.success=false;}}
 report.independentConnectionsClosed=opened===closed&&!closeErrors;if(!report.independentConnectionsClosed)report.success=false;sessionId=null;nonce=null;
}
report.finishedAt=new Date().toISOString();report.pdfDownloads=0;emit(JSON.stringify(report));process.exitCode=report.success?0:1;
