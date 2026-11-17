// Read-only pending variants only. No credentials, identities or business rows in output.
import {safeTechnicalCode} from './backend-pending-variant-controls.mjs';
const emit=process.stdout.write.bind(process.stdout);
for(const k of ['log','info','warn','error','debug','trace','dir','table'])console[k]=()=>{};
const report={suite:'backend-final-variants-dev',commit:process.argv[2],startedAt:new Date().toISOString(),success:false,checks:[],cases:[],limitations:[],scope:'F1/F2 positive branches, F3 exceptional campaigns, F4 multicurrency cohort and M7 shared plate only; independent read-only Oracle; no provider'};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CONTROL_FAILED');};
const missing=code=>{throw Object.assign(Error(),{missing:code});};
const str=v=>v==null?null:String(v);
const {default:config}=await import('../config.js');
const {withOracleProxySession,getValidOracleSession}=await import('../src/services/sessions/oracleSession.service.js');
const {executeTool}=await import('../src/services/ai/toolExecutor.service.js');
const {default:driver}=await import('oracledb');
const connect=driver.getConnection.bind(driver);let sessionId,opened=0,closed=0,closeErrors=0,operation='PREFLIGHT';
driver.getConnection=async(...args)=>{const c=await connect(...args);opened++;c.callTimeout=60000;const close=c.close.bind(c);let done=false;c.close=async()=>{try{await close();if(!done){closed++;done=true;}}catch(e){closeErrors++;throw e;}};return c;};
const deadline=Date.now()+8*60*1000;
const budget=()=>{if(Date.now()>deadline)throw Object.assign(Error(),{blocked:'EIGHT_MINUTE_BUDGET_EXHAUSTED'});};
const query=(sql,binds={})=>withOracleProxySession(sessionId,async({connection})=>{budget();if(!/^\s*(SELECT|WITH)\b/i.test(sql))throw Error();const r=(await connection.execute(sql,binds,{outFormat:4002,maxRows:10001})).rows;if(r.length>10000)throw Object.assign(Error(),{blocked:'CONTROL_ROW_LIMIT_EXCEEDED'});return r;});
const tool=(name,args)=>{budget();return executeTool({name,arguments:args,context:{sessionId}});};
report.discovery=[];
const discover=(code,details)=>report.discovery.push({code,...details});
async function run(code,fn){operation='DISCOVERY';const t=Date.now();try{await fn();report.cases.push({code,status:'passed',durationMs:Date.now()-t});}catch(e){const reason=e.missing??e.blocked??safeTechnicalCode(e);report.cases.push({code,status:e.missing?'sample_missing':e.blocked?'not_run':'failed',reason,operation,durationMs:Date.now()-t});if(e.missing||e.blocked)report.limitations.push(reason);}check(opened===closed&&!closeErrors,'ORACLE_CONNECTIONS_CLOSED_AFTER_CASE');}
const nativeFetch=globalThis.fetch;let externalAttempts=0;globalThis.fetch=()=>{externalAttempts++;throw Error('EXTERNAL_HTTP_DISABLED');};
try{
 check(/^[a-f0-9]{40}$/.test(report.commit??''),'SOURCE_COMMIT_PRESENT');
 check(config.env==='development'&&!config.piiDebugShowRaw&&!config.bedrockDebugPayloads,'DEV_SAFE_CONFIGURATION');
 const {finalVariantControls}=await import('./final-variant-controls.mjs');
 if(process.argv.includes('--preflight')){emit(JSON.stringify({success:true,preflight:true}));process.exit(0);}
 let input='';for await(const c of process.stdin){input+=c;if(input.length>4096)throw Error();}sessionId=JSON.parse(input).sessionId;input='';if(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/i.test(sessionId))throw Error();
 const valid=await getValidOracleSession(sessionId);await withOracleProxySession(sessionId,async({connection})=>{const r=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{},{outFormat:4002})).rows[0];check(str(r.U).toUpperCase()===valid.username&&Boolean(r.P),'SESSION_PROXY_IDENTITY_MATCHES');});
 const pageSize=Math.min(3,Number.isSafeInteger(Number(config.limitFilter))&&Number(config.limitFilter)>0?Number(config.limitFilter):3);
 await finalVariantControls({query,tool,check,run,missing,mark:code=>operation=code,pageSize,minSimilarity:Number(config.minSimilarity||70),discover});
 check(externalAttempts===0,'NO_PROVIDER_OR_EXTERNAL_HTTP');report.coverageComplete=report.cases.every(c=>c.status==='passed');report.success=report.cases.every(c=>['passed','sample_missing'].includes(c.status))&&report.checks.every(c=>c.passed);
}catch(e){report.error={code:safeTechnicalCode(e)};}
finally{sessionId=null;globalThis.fetch=nativeFetch;report.checks.push({code:'ALL_ORACLE_CONNECTIONS_CLOSED',passed:opened===closed&&!closeErrors});if(opened!==closed||closeErrors)report.success=false;}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
