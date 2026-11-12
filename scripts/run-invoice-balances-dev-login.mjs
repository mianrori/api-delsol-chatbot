import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {probeLoginDev,loginDev,logoutDev} from './dev-protected-login.mjs';
import {auditAffectedLogs} from './invoice-affected-log-audit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),docker=process.env.INVOICE_BALANCES_DOCKER||'docker',bot='api-delsol-chatbot-dev',erp='api-delsol-erp-dev';
const run=(cmd,args,opt={})=>execFileSync(cmd,args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],maxBuffer:20971520,...opt});
const dock=(...args)=>run(docker,args),git=(...args)=>run('git',args),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const report={suite:'invoice-balances-dev-helper',success:false,startedAt:new Date().toISOString(),noDeployment:true};
const record=(path,value)=>fs.writeFileSync(resolve(root,'logs',path),JSON.stringify(value,null,2));
let session,payload,before;
async function prepare(commit){
 if(git('rev-parse','HEAD').trim()!==commit||git('status','--porcelain').trim())throw Error('CLEAN_CANDIDATE_REQUIRED');
 const target='/tmp/invoice-balances-dev-'+commit;dock('exec',bot,'mkdir','-p',target);
 run(docker,['exec','-i',bot,'tar','-x','-C',target],{input:run('git',['archive','--format=tar',commit],{encoding:'buffer'})});dock('exec',bot,'ln','-sfn','/app/node_modules',target+'/node_modules');
 const files=git('ls-tree','-r','--name-only',commit).trim().split('\n').filter(p=>/^(src\/|scripts\/|test\/|config\.js$|package(?:-lock)?\.json$)/.test(p));
 const expected=files.map(p=>[p,hash(fs.readFileSync(resolve(root,p),'utf8').replaceAll('\r\n','\n'))]);
 const actual=JSON.parse(run(docker,['exec','-i',bot,'node','--input-type=module'],{input:"import fs from 'node:fs';import crypto from 'node:crypto';const {target,files}="+JSON.stringify({target,files})+";console.log(JSON.stringify(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(target+'/'+p,'utf8').replaceAll('\\r\\n','\\n')).digest('hex')])));"}));
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('CANDIDATE_SOURCE_MISMATCH');
 return {commit,target,sourceFiles:files.length,manifestSha256:hash(JSON.stringify(expected))};
}
async function worker(candidate,mode){
 return new Promise((resolveWorker,reject)=>{
  const child=spawn(docker,['exec','-i','-e','NODE_DEBUG=','-e','NODE_OPTIONS=','-e','NODE_V8_COVERAGE=',bot,'node','--experimental-vm-modules',candidate.target+'/scripts/check-invoice-balances-dev.mjs',candidate.commit,mode],{windowsHide:true,stdio:['pipe','pipe','pipe']});let raw='',size=0;
  child.stdout.on('data',c=>{size+=c.length;if(size<524288)raw+=c;});child.stderr.on('data',()=>{});child.on('error',()=>reject(Error('WORKER_START_FAILED')));child.stdin.on('error',()=>{});
  child.on('close',()=>{try{const r=JSON.parse(raw);raw='';if(size>=524288||r.suite!=='invoice-balances-dev'||r.commit!==candidate.commit)throw Error();resolveWorker(r);}catch{reject(Error('WORKER_PROTOCOL_FAILED'));}});child.stdin.end(session?JSON.stringify({sessionId:session}):'');
 });
}
try{
 before=JSON.parse(dock('inspect',bot))[0];await probeLoginDev();
 const probe="import config from '/app/config.js';import fs from 'node:fs';import crypto from 'node:crypto';const h=v=>crypto.createHash('sha256').update(v).digest('hex');console.log(JSON.stringify({dev:config.env==='development',safe:!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,oracle:h(JSON.stringify([config.dbHost,config.dbPort,config.dbSid])),pg:h(JSON.stringify([config.pgOracleSessionsHost,config.pgOracleSessionsPort,config.pgOracleSessionsDatabase])),guard:fs.existsSync('/app/src/utils/devAuthTestLogging.js')?h(fs.readFileSync('/app/src/utils/devAuthTestLogging.js','utf8').replaceAll('\\r\\n','\\n')):null,enabled:process.env.ERP_DEV_SAFE_AUTH_TEST_LOGS==='1'}));";
 const inspect=name=>JSON.parse(run(docker,['exec','-i',name,'node','--input-type=module'],{input:probe})),a=inspect(erp),b=inspect(bot);
 if(!a.dev||!b.dev||!b.safe||!a.enabled||a.guard!=='8b134e363d1ffd906676824f668c0dd50900a155c0360b254c9e228500deae33'||a.oracle!==b.oracle||a.pg!==b.pg)throw Error('SAFE_MATCHING_DEV_REQUIRED');
 report.profileCandidate=await prepare(git('rev-parse','HEAD').trim());report.preflight=await worker(report.profileCandidate,'--preflight');if(!report.preflight.success)throw Error('PREFLIGHT_FAILED');
 if(process.argv.includes('--preflight')){report.success=true;}
 else{
  let raw='';for await(const c of process.stdin){raw+=c;if(raw.length>16384)throw Error('INPUT_TOO_LARGE');}payload=JSON.parse(raw);raw='';session=await loginDev(payload.authorized);payload=null;
  if(process.argv.includes('--remaining')){
   const prior=JSON.parse(fs.readFileSync(resolve(root,'docs/invoice-balances-dev-c2541f4-partial.json'),'utf8'));
   if(prior.validation?.error?.code!=='ORA-01036'||!prior.logout||!prior.validation.cleanup.allConnectionsClosed||git('diff',prior.validation.commit,report.profileCandidate.commit,'--','src','config.js','package.json','package-lock.json').trim())throw Error('PRIOR_PARTIAL_EVIDENCE_NOT_APPLICABLE');
   report.priorPartialEvidence={file:'docs/invoice-balances-dev-c2541f4-partial.json',sha256:hash(fs.readFileSync(resolve(root,'docs/invoice-balances-dev-c2541f4-partial.json'))),commit:prior.validation.commit,approvedCases:prior.validation.cases.map(c=>c.label),notAssumingDataImmutability:true};
   report.validationCandidate=report.profileCandidate;report.validation=await worker(report.validationCandidate,'--validate-remaining');report.success=report.validation.success;
  }else{
  report.profile=await worker(report.profileCandidate,'--profile');record('invoice-balances-profile.json',report.profile);
  if(!report.profile.success)throw Error('PROFILE_FAILED');
  record('invoice-balances-progress.json',{phase:'profile_ready',profileCommit:report.profileCandidate.commit,sessionRetainedInMemory:true});
  const signal=resolve(root,'logs/invoice-balances-continue-'+report.profileCandidate.commit+'.json'),deadline=Date.now()+15*60*1000;let plan;
  while(Date.now()<deadline){if(fs.existsSync(signal)){plan=JSON.parse(fs.readFileSync(signal,'utf8'));break;}await new Promise(r=>setTimeout(r,2000));}
  if(!plan||plan.action!=='validate'||!/^[a-f0-9]{40}$/.test(plan.commit??''))throw Error('VALIDATION_NOT_RELEASED');
  report.validationCandidate=await prepare(plan.commit);record('invoice-balances-progress.json',{phase:'validating',commit:plan.commit});
  report.validation=await worker(report.validationCandidate,'--validate');report.success=report.validation.success;
  }
 }
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^[A-Z][A-Z0-9_]+$/.test(e?.code??'')?e.code:'BALANCE_HELPER_FAILED'};}
finally{
 payload=null;if(session){try{await logoutDev(session);report.logout=true;}catch{report.logout=false;report.success=false;}session=null;}
 report.finishedAt=new Date().toISOString();report.logAudit=[];
 for(const name of [bot,erp])try{const raw=dock('logs','--since',report.startedAt,'--until',report.finishedAt,name),audit=auditAffectedLogs(raw,name===bot?'chatbot':'erp');report.logAudit.push({service:name===bot?'chatbot':'erp',...audit});if(!audit.safe||audit.bedrockRequestEvents||audit.bedrockResponseEvents)report.success=false;}catch{report.logAudit.push({service:name===bot?'chatbot':'erp',failed:true});report.success=false;}
 if(before){const after=JSON.parse(dock('inspect',bot))[0];report.deployedImageAndStartUnchanged=before.Image===after.Image&&before.State.StartedAt===after.State.StartedAt;if(!report.deployedImageAndStartUnchanged)report.success=false;}
 record(process.argv.includes('--preflight')?'invoice-balances-dev-preflight.json':'invoice-balances-dev-real.json',report);process.stdout.write(JSON.stringify(report)+'\n');process.exitCode=report.success?0:1;
}
