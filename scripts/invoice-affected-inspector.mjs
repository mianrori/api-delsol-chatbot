import fs from 'node:fs';import crypto from 'node:crypto';
export async function openInspector(){
 const pids=fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x)&&Number(x)!==process.pid).filter(x=>{try{return fs.readFileSync('/proc/'+x+'/cmdline','utf8').includes('/app/index.js');}catch{return false;}});if(pids.length!==1)throw Error('APP_PROCESS_NOT_UNIQUE');
 let owned=false,list;try{list=await(await fetch('http://127.0.0.1:9229/json/list',{signal:AbortSignal.timeout(1000)})).json();}catch{process.kill(Number(pids[0]),'SIGUSR1');owned=true;}
 for(let i=0;!list&&i<30;i++){await new Promise(r=>setTimeout(r,100));try{list=await(await fetch('http://127.0.0.1:9229/json/list',{signal:AbortSignal.timeout(1000)})).json();}catch{}}
 if(list?.length!==1||!/^ws:\/\/127\.0\.0\.1:9229\//.test(list[0].webSocketDebuggerUrl))throw Error('LOCAL_INSPECTOR_REQUIRED');
 const socket=new WebSocket(list[0].webSocketDebuggerUrl),pending=new Map(),scripts=new Map();let next=1;
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(Error('INSPECTOR_CONNECT_FAILED')),{once:true});});
 socket.addEventListener('message',event=>{try{const message=JSON.parse(event.data);if(message.method==='Debugger.scriptParsed')scripts.set(message.params.url,message.params.scriptId);const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(Error('INSPECTOR_COMMAND_FAILED')):waiter.resolve(message.result);}}catch{}});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=next++;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('INSPECTOR_COMMAND_TIMEOUT'));},15000);pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('INSPECTOR_EVALUATION_FAILED');return result.result?.value;};
 await command('Runtime.enable');await command('Debugger.enable');
 return {owned,pid:Number(pids[0]),scripts,command,evaluate,async close(){await command('Debugger.disable');if(owned)await evaluate("setTimeout(()=>process.getBuiltinModule('inspector').close(),100);true");socket.close();await new Promise(r=>setTimeout(r,200));if(owned){try{await fetch('http://127.0.0.1:9229/json/list',{signal:AbortSignal.timeout(500)});return false;}catch{return true;}}return true;}};
}
export async function verifyLoadedSource(inspector,expected){
 const checked=[];for(const[path,expectedHash]of expected){const id=inspector.scripts.get('file:///app/'+path)??inspector.scripts.get('/app/'+path);if(!id)throw Error('LOADED_MODULE_MISSING');const {scriptSource}=await inspector.command('Debugger.getScriptSource',{scriptId:id});const digest=crypto.createHash('sha256').update(scriptSource.replace(/^\uFEFF/,'').replaceAll('\r\n','\n')).digest('hex');if(digest!==expectedHash)throw Error('LOADED_SOURCE_MISMATCH');checked.push({path,sha256:digest});}return checked;
}
