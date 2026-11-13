import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
import {probeLoginDev,loginDev,logoutDev,devRequest} from './dev-protected-login.mjs';
import {auditAffectedLogs} from './invoice-affected-log-audit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),docker=process.env.INVOICE_SETTLED_DOCKER||'docker',bot='api-delsol-chatbot-dev',erp='api-delsol-erp-dev',commit='e4712614a1504eba46744da957c490b430206e5e',target='/tmp/invoice-settled-live';
const run=(cmd,args,options={})=>execFileSync(cmd,args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],maxBuffer:20971520,...options});
const dock=(...args)=>run(docker,args),git=(...args)=>run('git',args),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const dockerLogs=(name,since,until)=>{const r=spawnSync(docker,['logs','--since',since,...(until?['--until',until]:[]),name],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:20971520});if(r.status!==0||r.error)throw Error('LOG_READ_FAILED');return r.stdout+'\n'+r.stderr;};
const report={suite:'invoice-settled-live-helper',commit,success:false,startedAt:new Date().toISOString()};let sessionId,payload,before;
try{
 if(git('diff',commit,'HEAD','--','src','config.js','index.js','package.json','package-lock.json','Dockerfile','docker-compose.dev.yml','ecosystem.config.cjs').trim())throw Error('LOCAL_APPLICATION_MERGE_MISMATCH');
 await probeLoginDev();report.healthBefore=(await devRequest('chatbot','/chatbot/api/health')).status===200;
 before=JSON.parse(dock('inspect',bot))[0];report.imageId=before.Image;report.containerStartedAt=before.State.StartedAt;if(!before.State.Running)throw Error('CONTAINER_NOT_RUNNING');
 const pm=JSON.parse(dock('exec',bot,'pm2','jlist')).find(p=>p.name==='api-delsol-chatbot');report.pm2={online:pm?.pm2_env?.status==='online',restarts:pm?.pm2_env?.restart_time,nodeVersion:pm?.pm2_env?.node_version};if(!report.pm2.online||report.pm2.restarts!==0)throw Error('STARTUP_NOT_HEALTHY');
 const startup=dockerLogs(bot,before.State.StartedAt).split(/\r?\n/).filter(l=>l.trim());
 const prefix='^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}: PM2 log: ';
 const startupPatterns=[new RegExp(prefix+'Launching in no daemon mode$'),new RegExp(prefix+'App \\[api-delsol-chatbot:0\\] starting in -fork mode-$'),new RegExp(prefix+'App \\[api-delsol-chatbot:0\\] online$'),/^Server API-DELSOL-CHATBOT running on port 5400 in development mode\.$/];
 const remaining=startup.filter(l=>!startupPatterns.some(p=>p.test(l.trim()))).join('\n');
 report.startup={lines:startup.length,knownMetadataLines:startup.length-remaining.split('\n').filter(Boolean).length,errors:/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND|Error:|errored/.test(startup.join('\n')),remainingLogAudit:auditAffectedLogs(remaining,'chatbot')};
 if(report.startup.errors||!report.startup.remainingLogAudit.safe)throw Error('STARTUP_LOG_AUDIT_FAILED');
 const probe="import config from '/app/config.js';import fs from 'node:fs';import crypto from 'node:crypto';const h=v=>crypto.createHash('sha256').update(v).digest('hex');console.log(JSON.stringify({dev:config.env==='development',safe:!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,oracle:h(JSON.stringify([config.dbHost,config.dbPort,config.dbSid])),pg:h(JSON.stringify([config.pgOracleSessionsHost,config.pgOracleSessionsPort,config.pgOracleSessionsDatabase])),guard:fs.existsSync('/app/src/utils/devAuthTestLogging.js')?h(fs.readFileSync('/app/src/utils/devAuthTestLogging.js','utf8').replaceAll('\\r\\n','\\n')):null,enabled:process.env.ERP_DEV_SAFE_AUTH_TEST_LOGS==='1'}));";
 const inspect=name=>JSON.parse(run(docker,['exec','-i',name,'node','--input-type=module'],{input:probe})),a=inspect(erp),b=inspect(bot);
 if(!a.dev||!b.dev||!b.safe||!a.enabled||a.guard!=='8b134e363d1ffd906676824f668c0dd50900a155c0360b254c9e228500deae33'||a.oracle!==b.oracle||a.pg!==b.pg)throw Error('SAFE_MATCHING_DEV_REQUIRED');
 const files=git('ls-tree','-r','--name-only',commit).trim().split('\n').filter(p=>/^(src\/|scripts\/|config\.js$|index.js$|package(?:-lock)?\.json$|ecosystem.config.cjs$|Dockerfile$|docker-compose.dev.yml$)/.test(p));
 const expected=files.map(p=>[p,hash(git('show',commit+':'+p).replaceAll('\r\n','\n'))]);
 const actual=JSON.parse(run(docker,['exec','-i',bot,'node','--input-type=module'],{input:"import fs from 'node:fs';import crypto from 'node:crypto';const files="+JSON.stringify(files)+";console.log(JSON.stringify(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync('/app/'+p,'utf8').replaceAll('\\r\\n','\\n')).digest('hex')])));"}));
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('DEPLOYED_SOURCE_MISMATCH');report.sourceFiles=files.length;report.manifestSha256=hash(JSON.stringify(expected));
 const modules=['src/services/ai/chat.service.js','src/services/ai/invoicePendingRequest.service.js','src/services/ai/invoiceBalanceResult.service.js','src/services/ai/searchSelection.service.js','src/services/ai/pii.service.js','src/services/ai/toolExecutor.service.js','src/services/ai/invoiceBalancePresentation.service.js','src/repositories/invoices/invoiceBalances.repository.js','src/repositories/invoices/invoices.repository.js','src/services/invoices/invoiceBalances.service.js','src/services/invoices/invoices.service.js','src/services/sessions/oracleSession.service.js','src/controllers/chat.controller.js','src/state/conversation.store.js','src/services/ai/conversation.service.js'];
 fs.writeFileSync(resolve(root,'logs/invoice-settled-live-expected.json'),JSON.stringify(expected.filter(([p])=>modules.includes(p))));dock('exec',bot,'mkdir','-p',target);
 const copies=[['scripts/check-invoice-settled-live.mjs','worker.mjs'],['scripts/invoice-settled-live-runtime.mjs','runtime.mjs'],['scripts/invoice-affected-inspector.mjs','inspector.mjs'],['logs/invoice-settled-live-expected.json','expected.json']];report.harness=copies.filter(([p])=>p.startsWith('scripts/')).map(([p])=>({path:p,sha256:hash(fs.readFileSync(resolve(root,p)))}));
 for(const [local,remote]of copies)dock('cp',resolve(root,local),bot+':'+target+'/'+remote);
 if(!process.argv.includes('--preflight')){let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>16384)throw Error('INPUT_TOO_LARGE');}payload=JSON.parse(raw);raw='';sessionId=await loginDev(payload.authorized);payload=null;}
 const child=spawnSync(docker,['exec','-i','-e','NODE_DEBUG=','-e','NODE_OPTIONS=','-e','NODE_V8_COVERAGE=',bot,'node',target+'/worker.mjs',commit,...(process.argv.includes('--preflight')?['--preflight']:[])],{input:sessionId?JSON.stringify({sessionId}):'',encoding:'utf8',windowsHide:true,maxBuffer:1048576,timeout:240000});
 if(child.error||!child.stdout)throw Error('WORKER_FAILED');report.worker=JSON.parse(child.stdout);if(report.worker.suite!=='invoice-settled-live-5400'||report.worker.commit!==commit)throw Error('WORKER_PROTOCOL_FAILED');report.success=child.status===0&&report.worker.success;
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:'SETTLED_LIVE_HELPER_FAILED'};}
finally{
 payload=null;if(sessionId){report.logout=false;report.logoutAttempts=0;for(let i=0;i<2&&!report.logout;i++){report.logoutAttempts++;try{await logoutDev(sessionId);report.logout=true;}catch{}}if(!report.logout)report.success=false;sessionId=null;}
 report.finishedAt=new Date().toISOString();report.logAudit=[];
 for(const [name,kind]of [[bot,'chatbot'],[erp,'erp']])try{const audit=auditAffectedLogs(dockerLogs(name,report.startedAt,report.finishedAt),kind);report.logAudit.push({service:kind,...audit});if(!audit.safe||audit.bedrockRequestEvents||audit.bedrockResponseEvents)report.success=false;}catch{report.success=false;report.logAudit.push({service:kind,failed:true});}
 report.healthAfter=false;report.healthAfterAttempts=0;
 for(let i=0;i<2&&!report.healthAfter;i++){report.healthAfterAttempts++;try{report.healthAfter=(await devRequest('chatbot','/chatbot/api/health')).status===200;}catch{}}
 if(!report.healthAfter)report.success=false;
 if(before){try{const after=JSON.parse(dock('inspect',bot))[0];report.deploymentUnchangedDuringControl=before.Image===after.Image&&before.State.StartedAt===after.State.StartedAt;if(!report.deploymentUnchangedDuringControl)report.success=false;}catch{report.success=false;}}
 const path='logs/invoice-settled-live-'+(process.argv.includes('--preflight')?'preflight':'real')+'.json';fs.writeFileSync(resolve(root,path),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify({success:report.success,report:path})+'\n');process.exitCode=report.success?0:1;
}
