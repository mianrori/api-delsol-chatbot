import {execFileSync,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loginDev,logoutDev,probeLoginDev} from './dev-protected-login.mjs';
import {auditAffectedLogs} from './invoice-affected-log-audit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),docker=process.env.INVOICE_SETTLED_DOCKER||'docker',bot='api-delsol-chatbot-dev';
const run=(cmd,args,options={})=>execFileSync(cmd,args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],maxBuffer:20971520,...options});
const dock=(...args)=>{if(args[0]!=='logs')return run(docker,args);const r=spawnSync(docker,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:20971520});if(r.status!==0||r.error)throw Error('LOG_READ_FAILED');return r.stdout+'\n'+r.stderr;};
const report={suite:'invoice-settled-dev-helper',success:false,startedAt:new Date().toISOString(),noDeployment:true};
let sessionId,payload,before;
try{
 const commit=run('git',['rev-parse','HEAD']).trim();if(run('git',['status','--porcelain']).trim())throw Error('CLEAN_CANDIDATE_REQUIRED');report.commit=commit;
 await probeLoginDev();before=JSON.parse(dock('inspect',bot))[0];
 const candidate='/tmp/invoice-settled-'+commit;dock('exec',bot,'mkdir','-p',candidate);
 run(docker,['exec','-i',bot,'tar','-x','-C',candidate],{input:run('git',['archive','--format=tar',commit],{encoding:'buffer'})});dock('exec',bot,'ln','-sfn','/app/node_modules',candidate+'/node_modules');
 const probe="import config from '/app/config.js';console.log(JSON.stringify({dev:config.env==='development',safe:!config.bedrockDebugPayloads&&!config.piiDebugShowRaw}));";
 const safe=JSON.parse(run(docker,['exec','-i',bot,'node','--input-type=module'],{input:probe}));if(!safe.dev||!safe.safe)throw Error('SAFE_DEV_REQUIRED');
 let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>16384)throw Error('INPUT_TOO_LARGE');}payload=JSON.parse(raw);raw='';sessionId=await loginDev(payload.authorized);payload=null;
 try{report.validation=JSON.parse(run(docker,['exec','-i',bot,'node','--experimental-vm-modules',candidate+'/scripts/check-invoice-settled-dev.mjs',commit],{input:JSON.stringify({sessionId}),timeout:240000}));}catch(e){if(e.stdout){report.validation=JSON.parse(String(e.stdout));}else throw Error('WORKER_FAILED');}
 report.success=report.validation?.success===true;
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'SETTLED_HELPER_FAILED'};}
finally{
 payload=null;if(sessionId){report.logoutAttempts=0;report.logout=false;for(let i=0;i<2&&!report.logout;i++){report.logoutAttempts++;try{await logoutDev(sessionId);report.logout=true;}catch{}}if(!report.logout)report.success=false;sessionId=null;}
 report.finishedAt=new Date().toISOString();report.logAudit=[];
 for(const container of [bot,'api-delsol-erp-dev'])try{const audit=auditAffectedLogs(dock('logs','--since',report.startedAt,'--until',report.finishedAt,container),container===bot?'chatbot':'erp');report.logAudit.push({service:container===bot?'chatbot':'erp',...audit});if(!audit.safe||audit.bedrockRequestEvents||audit.bedrockResponseEvents)report.success=false;}catch{report.success=false;report.logAudit.push({failed:true});}
 if(before){const after=JSON.parse(dock('inspect',bot))[0];report.deployedImageAndStartUnchanged=before.Image===after.Image&&before.State.StartedAt===after.State.StartedAt;if(!report.deployedImageAndStartUnchanged)report.success=false;}
 fs.mkdirSync(resolve(root,'logs'),{recursive:true});fs.writeFileSync(resolve(root,'logs/invoice-settled-dev-real.json'),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify({success:report.success,report:'logs/invoice-settled-dev-real.json'})+'\n');process.exitCode=report.success?0:1;
}
