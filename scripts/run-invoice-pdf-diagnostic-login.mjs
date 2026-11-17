// Reuses the existing protected DEV login transport. Never output child stderr.
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loginDev,logoutDev,probeLoginDev} from './dev-protected-login.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const docker=process.env.INVOICE_DIAGNOSTIC_DOCKER||'docker',bot='api-delsol-chatbot-dev',erp='api-delsol-erp-dev';
const report={suite:'invoice-pdf-diagnostic-helper',success:false,startedAt:new Date().toISOString(),phase:'PREFLIGHT'};
const run=(command,args,options={})=>execFileSync(command,args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:20971520,windowsHide:true,...options});
const dock=(...args)=>run(docker,args),git=(...args)=>run('git',args);
const hash=b=>createHash('sha256').update(b).digest('hex');
let ownedSession,commit,candidate,payload;let localFiles=[];
// Private IPC only: filenames travel through stdin pipes, never command arguments,
// reports or logs. Public audit items contain only flags and sequence numbers.
const fileProbe=String.raw`for(const k of ['log','info','warn','error'])console[k]=()=>{};const {default:c}=await import('/app/config.js');const fs=await import('node:fs');const path=await import('node:path');let raw='';for await(const x of process.stdin)raw+=x;const input=JSON.parse(raw),root=c.pdfFcDirectory;let metadata={rootConfigured:Boolean(root),rootExists:false,rootDirectory:false};try{metadata.rootExists=Boolean(root)&&fs.existsSync(root);metadata.rootDirectory=metadata.rootExists&&fs.statSync(root).isDirectory();}catch{}let names=[],items=[];if(metadata.rootDirectory){if(input.action==='list'){const dir=fs.opendirSync(root);let e,count=0;const entries=[];try{while(count<256&&(e=dir.readSync())){count++;if(e.isFile()&&e.name.toLowerCase().endsWith('.pdf')){try{entries.push({name:e.name,mtime:fs.statSync(path.join(root,e.name)).mtimeMs});}catch{}}}}finally{dir.closeSync();}metadata.entriesScanned=count;metadata.boundedListing=true;names=entries.sort((a,b)=>b.mtime-a.mtime).slice(0,64).map(e=>e.name.slice(0,-4));}else{items=(input.values??[]).slice(0,13).map((value,i)=>{const file=path.resolve(path.join(root,String(value)+'.pdf')),base=path.resolve(root);const within=file.startsWith(base+path.sep);const item={sequence:i,resolvesInsideRoot:within,controllerFileExists:false,oracleValueAlreadyHasPdfExtension:/\.pdf$/i.test(String(value))};if(within){try{item.controllerFileExists=fs.existsSync(file)&&fs.statSync(file).isFile();const literal=path.resolve(path.join(root,String(value)));item.literalValueFileExists=literal.startsWith(base+path.sep)&&fs.existsSync(literal);if(item.controllerFileExists){const real=fs.realpathSync(file),realRoot=fs.realpathSync(root);if(!real.startsWith(realRoot+path.sep)){item.signatureReadable=false;return item;}const b=Buffer.alloc(5);let fd;try{fd=fs.openSync(file,'r');fs.readSync(fd,b,0,5,0);item.signatureReadable=true;item.pdfSignature=b.toString()==='%PDF-';}finally{if(fd!=null)fs.closeSync(fd);}}}catch{item.signatureReadable=false;}}return item;});}}process.stdout.write(JSON.stringify({metadata,names,items}));`;
const erpFileProbe=input=>JSON.parse(run(docker,['exec','-i',erp,'node','--input-type=module','-e',fileProbe],{input:JSON.stringify(input)}));

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
 candidate='/tmp/invoice-pdf-diagnostic-'+commit;dock('exec',bot,'mkdir','-p',candidate);
 run(docker,['exec','-i',bot,'tar','-x','-C',candidate],{input:run('git',['archive','--format=tar',commit],{encoding:'buffer'})});
 dock('exec',bot,'ln','-sfn','/app/node_modules',candidate+'/node_modules');
 const files=git('ls-tree','-r','--name-only',commit).trim().split('\n').filter(p=>/^(src\/|scripts\/|test\/|config\.js$|package(?:-lock)?\.json$)/.test(p));
 const normalize=s=>s.replaceAll('\r\n','\n');
 const expected=files.map(p=>[p,hash(normalize(readFileSync(resolve(root,p),'utf8')))]);
 const remote=JSON.parse(run(docker,['exec','-i',bot,'node','--input-type=module'],{input:"import fs from 'node:fs';import crypto from 'node:crypto';const {candidate,files}="+JSON.stringify({candidate,files})+";console.log(JSON.stringify(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(candidate+'/'+p,'utf8').replaceAll('\\r\\n','\\n')).digest('hex')])));"}));
 if(JSON.stringify(expected)!==JSON.stringify(remote))throw Error('SOURCE_MISMATCH');report.verifiedSourceFiles=files.length;report.manifestSha256=hash(JSON.stringify(expected));
 report.phase='FOCUSED_NODE22';const version=dock('exec',bot,'node','--version').trim();if(!/^v22\./.test(version))throw Error('NODE22_REQUIRED');
 const cachedPath=resolve(root,'logs/invoice-pdf-diagnostic-preflight.json');
 const cached=existsSync(cachedPath)?JSON.parse(readFileSync(cachedPath,'utf8')):null;
 const outputPath=resolve(root,'logs/invoice-pdf-diagnostic-focused-node22.txt');
 const sameTestedSource=cached?.success&&/^[a-f0-9]{40}$/.test(cached.commit??'')&&!git('diff',cached.commit,commit,'--','src','test','config.js','package.json','package-lock.json').trim();
 if(sameTestedSource&&cached.focused?.passed===cached.focused?.tests&&cached.focused?.failed===0&&cached.focused.node===version&&existsSync(outputPath)&&hash(readFileSync(outputPath))===cached.focused.outputSha256)report.focused={...cached.focused,reused:true};
 else{
  const tests=['invoices','invoicePlatePdf'];
  const out=dock('exec','-w',candidate,bot,'node','--test',...tests.map(t=>'test/'+t+'.test.js'));
  const count=Number(/^# tests (\d+)/m.exec(out)?.[1]),passed=Number(/^# pass (\d+)/m.exec(out)?.[1]);
  if(!count||count!==passed||!/^# fail 0$/m.test(out))throw Error('FOCUSED_TESTS_FAILED');
  writeFileSync(outputPath,out);report.focused={commit,node:version,tests:count,passed,failed:0,outputSha256:hash(out)};
 }
 const fsPreflight=erpFileProbe({action:'audit',values:[]});if(typeof fsPreflight.metadata?.rootExists!=='boolean'||!Array.isArray(fsPreflight.items))throw Error('SAFE_DEV_REQUIRED');report.localFileAuditPreflight=fsPreflight.metadata;
 report.phase='MODULE_PREFLIGHT';const pre=JSON.parse(dock('exec',bot,'node','--experimental-vm-modules',candidate+'/scripts/check-invoice-pdf-diagnostic-dev.mjs',commit,'--preflight'));if(!pre.success||pre.suite!=='invoice-pdf-diagnostic-dev'||pre.commit!==commit)throw Error();
 if(process.argv.includes('--preflight')){report.success=true;report.phase='PREFLIGHT_COMPLETE';}
 else{
  report.phase='HIDDEN_INPUT';let input='';for await(const c of process.stdin){input+=c;if(input.length>16384)throw Error();}payload=JSON.parse(input);input='';
  report.phase='ERP_LOGIN';ownedSession=await loginDev(payload.authorized);payload=null;const fileState=erpFileProbe({action:'list'});localFiles=fileState.names;report.localErpStorage=fileState.metadata;
  report.phase='CONTROLLED_HTTP_ORACLE_PDF';report.worker=await new Promise((resolveWorker,reject)=>{
   const child=spawn(docker,['exec','-i','-e','INVOICE_PRIVATE_IPC=1','-e','NODE_DEBUG=','-e','NODE_OPTIONS=','-e','NODE_V8_COVERAGE=',bot,'node','--experimental-vm-modules',candidate+'/scripts/check-invoice-pdf-diagnostic-dev.mjs',commit],{stdio:['pipe','pipe','pipe'],windowsHide:true});
   let raw='',size=0;child.stdout.on('data',c=>{size+=c.length;if(size<131072)raw+=c;});child.stderr.on('data',()=>{});child.on('error',()=>reject(Error('WORKER_FAILED')));child.stdin.on('error',()=>{});
   child.on('close',()=>{try{const r=JSON.parse(raw);raw='';if(size>=131072||r.suite!=='invoice-pdf-diagnostic-dev'||r.commit!==commit)throw Error();const values=r.privateFileAuditValues??[];delete r.privateFileAuditValues;const audit=erpFileProbe({action:'audit',values});r.localErpFileAudit=audit.items;resolveWorker(r);}catch{reject(Error('WORKER_FAILED'));}});child.stdin.end(JSON.stringify({sessionId:ownedSession,localFiles}));localFiles=[];
  });
  report.success=report.worker.success;report.pdfDownloadApproved=report.worker.pdfDownloadApproved;report.phase='COMPLETE';
 }
}catch(e){report.error={code:['CLEAN_COMMIT_REQUIRED','SAFE_DEV_REQUIRED','SOURCE_MISMATCH','NODE22_REQUIRED','FOCUSED_TESTS_FAILED','ERP_LOGIN_REJECTED','ERP_DEV_GUARD_REQUIRED'].includes(e?.message)?e.message:['ERP_LOGIN_REJECTED','ERP_DEV_GUARD_REQUIRED'].includes(e?.code)?e.code:'DEV_CONTROL_FAILED'};if(/^[A-Z0-9_]+$/.test(e?.code??''))report.error.technicalCode=e.code;if(Number.isInteger(e?.status))report.error.childExitCode=e.status;}
finally{
 payload=null;
 if(ownedSession){try{await logoutDev(ownedSession);report.logout=true;}catch{report.logout=false;report.success=false;}ownedSession=null;}
 if(report.worker||report.phase==='CONTROLLED_HTTP_ORACLE_PDF'){
  report.logAudit=[];
  for(const container of [bot,erp])try{
   const result=spawnSync(docker,['logs','--since',report.startedAt,container],{encoding:'utf8',windowsHide:true,maxBuffer:2097152});if(result.status!==0||result.error)throw Error();
   // Only counts escape; contents, values and identifiers never do.
   const lines=(result.stdout+'\n'+result.stderr).trim().split(/\r?\n/).filter(Boolean);const safe=lines.every(line=>{try{const v=JSON.parse(line);return v.event==='ERP_DEV_SAFE_AUTH_TEST_LOG'&&Object.keys(v).every(k=>['event','correlationId','level','code'].includes(k));}catch{return false;}});
   report.logAudit.push({service:container===bot?'chatbot':'erp',lines:lines.length,recognizedSanitizedOnly:safe});if(!safe)report.success=false;
  }catch{report.logAudit.push({service:container===bot?'chatbot':'erp',auditFailed:true});report.success=false;}
 }
 report.finishedAt=new Date().toISOString();mkdirSync(resolve(root,'logs'),{recursive:true});
 const target=resolve(root,'logs/invoice-pdf-diagnostic'+(process.argv.includes('--preflight')?'-preflight':'-real')+'.json');writeFileSync(target,JSON.stringify(report,null,2));
 process.stdout.write(JSON.stringify(report)+'\n');process.exitCode=report.success?0:1;
}
