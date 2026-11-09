// Reuses the existing protected DEV login transport. Never output child stderr.
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loginDev,logoutDev,probeLoginDev} from './dev-protected-login.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const docker=process.env.SALES_INTENT_DOCKER||'docker',bot='api-delsol-chatbot-dev',erp='api-delsol-erp-dev';
const report={suite:'sales-category-intent-helper',success:false,startedAt:new Date().toISOString(),phase:'PREFLIGHT'};
const run=(command,args,options={})=>execFileSync(command,args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:20971520,windowsHide:true,...options});
const dock=(...args)=>run(docker,args),git=(...args)=>run('git',args);
const hash=b=>createHash('sha256').update(b).digest('hex');
let ownedSession,commit,candidate,payload;
try{
 if(process.argv.slice(2).some(a=>!['--preflight','--run'].includes(a)))throw Error();
 commit=git('rev-parse','HEAD').trim();report.commit=commit;
 if(!/^[a-f0-9]{40}$/.test(commit)||git('status','--porcelain').trim())throw Error('CLEAN_COMMIT_REQUIRED');
 report.phase='DEV_HEALTH_LOG_GUARD';await probeLoginDev();
 const probe="import config from '/app/config.js';import fs from 'node:fs';import crypto from 'node:crypto';const h=v=>crypto.createHash('sha256').update(v).digest('hex');console.log(JSON.stringify({dev:config.env==='development',safe:!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,oracle:h(JSON.stringify([config.dbHost,config.dbPort,config.dbSid])),pg:h(JSON.stringify([config.pgOracleSessionsHost,config.pgOracleSessionsPort,config.pgOracleSessionsDatabase])),guard:fs.existsSync('/app/src/utils/devAuthTestLogging.js')?h(fs.readFileSync('/app/src/utils/devAuthTestLogging.js','utf8').replaceAll('\\r\\n','\\n')):null,enabled:process.env.ERP_DEV_SAFE_AUTH_TEST_LOGS==='1'}));";
 report.phase='DEV_SOURCE_CONFIGURATION';
 const probeContainer=container=>JSON.parse(run(docker,['exec','-i',container,'node','--input-type=module'],{input:probe}));
 const a=probeContainer(erp),b=probeContainer(bot);
 if(!a.dev||!b.dev||!b.safe||a.oracle!==b.oracle||a.pg!==b.pg||!a.enabled||a.guard!=='8b134e363d1ffd906676824f668c0dd50900a155c0360b254c9e228500deae33')throw Error('SAFE_DEV_REQUIRED');
 candidate='/tmp/sales-category-intent-'+commit;dock('exec',bot,'mkdir','-p',candidate);
 run(docker,['exec','-i',bot,'tar','-x','-C',candidate],{input:run('git',['archive','--format=tar',commit],{encoding:'buffer'})});
 dock('exec',bot,'ln','-sfn','/app/node_modules',candidate+'/node_modules');
 const files=git('ls-tree','-r','--name-only',commit).trim().split('\n').filter(p=>/^(src\/|scripts\/|test\/|config\.js$|package(?:-lock)?\.json$)/.test(p));
 const normalize=s=>s.replaceAll('\r\n','\n');
 const expected=files.map(p=>[p,hash(normalize(git('show',commit+':'+p)))]);
 const remote=JSON.parse(run(docker,['exec','-i',bot,'node','--input-type=module'],{input:"import fs from 'node:fs';import crypto from 'node:crypto';const {candidate,files}="+JSON.stringify({candidate,files})+";console.log(JSON.stringify(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(candidate+'/'+p,'utf8').replaceAll('\\r\\n','\\n')).digest('hex')])));"}));
 if(JSON.stringify(expected)!==JSON.stringify(remote))throw Error('SOURCE_MISMATCH');report.verifiedSourceFiles=files.length;
 report.phase='FOCUSED_NODE22';const version=dock('exec',bot,'node','--version').trim();if(!/^v22\./.test(version))throw Error('NODE22_REQUIRED');
 const cachedPath=resolve(root,'logs/sales-category-intent-preflight.json');
 const cached=existsSync(cachedPath)?JSON.parse(readFileSync(cachedPath,'utf8')):null;
 const sameTestedSource=cached?.success&&/^[a-f0-9]{40}$/.test(cached.commit??'')&&!git('diff',cached.commit,commit,'--','src','test','config.js','package.json','package-lock.json').trim();
 if(sameTestedSource&&cached.focused?.tests===64&&cached.focused.passed===64&&cached.focused.node===version)report.focused={...cached.focused,commit:cached.focused.commit??cached.commit,reused:true};
 else{
  const tests=['salesAutonomousCategory','salesCategoryIntentChat','salesLocalRemoval','librarySalesContext','searchResolutionState','searchFilterLifecycle','searchSelection','searchResolutionStateHttp','searchFilterLifecycleHttp'];
  const out=dock('exec','-w',candidate,bot,'node','--test',...tests.map(t=>'test/'+t+'.test.js'));
  if(!/pass 64\b/.test(out)||!/fail 0\b/.test(out))throw Error('FOCUSED_TESTS_FAILED');
  report.focused={commit,node:version,tests:64,passed:64,outputSha256:hash(out)};
 }
 report.phase='MODULE_PREFLIGHT';const pre=JSON.parse(dock('exec',bot,'node','--experimental-vm-modules',candidate+'/scripts/check-sales-category-intent-dev.mjs',commit,'--preflight'));if(!pre.success)throw Error();
 if(process.argv.includes('--preflight')){report.success=true;report.phase='PREFLIGHT_COMPLETE';}
 else{
  report.phase='HIDDEN_INPUT';let input='';for await(const c of process.stdin){input+=c;if(input.length>16384)throw Error();}payload=JSON.parse(input);input='';
  report.phase='ERP_LOGIN';ownedSession=await loginDev(payload.authorized);payload=null;
  report.phase='REAL_MODEL_ORACLE';report.worker=await new Promise((resolveWorker,reject)=>{
   const child=spawn(docker,['exec','-i','-e','NODE_DEBUG=','-e','NODE_OPTIONS=','-e','NODE_V8_COVERAGE=',bot,'node','--experimental-vm-modules',candidate+'/scripts/check-sales-category-intent-dev.mjs',commit],{stdio:['pipe','pipe','pipe'],windowsHide:true});
   let raw='',size=0;child.stdout.on('data',c=>{size+=c.length;if(size<131072)raw+=c;});child.stderr.on('data',()=>{});child.on('error',()=>reject(Error('WORKER_FAILED')));child.stdin.on('error',()=>{});
   child.on('close',()=>{try{const r=JSON.parse(raw);raw='';if(size>=131072||r.suite!=='sales-category-intent-real'||r.commit!==commit)throw Error();resolveWorker(r);}catch{reject(Error('WORKER_FAILED'));}});child.stdin.end(JSON.stringify({sessionId:ownedSession}));
  });
  report.success=report.worker.success;report.phase='COMPLETE';
 }
}catch(e){report.error={code:['CLEAN_COMMIT_REQUIRED','SAFE_DEV_REQUIRED','SOURCE_MISMATCH','NODE22_REQUIRED','FOCUSED_TESTS_FAILED','ERP_LOGIN_REJECTED','ERP_DEV_GUARD_REQUIRED'].includes(e?.message)?e.message:['ERP_LOGIN_REJECTED','ERP_DEV_GUARD_REQUIRED'].includes(e?.code)?e.code:'DEV_CONTROL_FAILED'};if(/^[A-Z0-9_]+$/.test(e?.code??''))report.error.technicalCode=e.code;if(Number.isInteger(e?.status))report.error.childExitCode=e.status;}
finally{
 payload=null;
 if(ownedSession){try{await logoutDev(ownedSession);report.logout=true;}catch{report.logout=false;report.success=false;}ownedSession=null;}
 if(report.worker){
  report.logAudit=[];
  for(const container of [bot,erp])try{
   const result=spawnSync(docker,['logs','--since',report.startedAt,container],{encoding:'utf8',windowsHide:true,maxBuffer:2097152});if(result.status!==0||result.error)throw Error();
   // Only counts escape; contents, values and identifiers never do.
   const lines=(result.stdout+'\n'+result.stderr).trim().split(/\r?\n/).filter(Boolean);const safe=lines.every(line=>{try{const v=JSON.parse(line);return v.event==='ERP_DEV_SAFE_AUTH_TEST_LOG'&&Object.keys(v).every(k=>['event','correlationId','level','code'].includes(k));}catch{return false;}});
   report.logAudit.push({service:container===bot?'chatbot':'erp',lines:lines.length,recognizedSanitizedOnly:safe});if(!safe)report.success=false;
  }catch{report.logAudit.push({service:container===bot?'chatbot':'erp',auditFailed:true});report.success=false;}
 }
 report.finishedAt=new Date().toISOString();mkdirSync(resolve(root,'logs'),{recursive:true});
 const target=resolve(root,'logs/sales-category-intent'+(process.argv.includes('--preflight')?'-preflight':'-real')+'.json');writeFileSync(target,JSON.stringify(report,null,2));
 process.stdout.write(JSON.stringify(report)+'\n');process.exitCode=report.success?0:1;
}
