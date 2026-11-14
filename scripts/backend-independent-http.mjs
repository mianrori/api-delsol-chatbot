import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import express from 'express';
import {protectPiiDeep} from '../src/services/ai/pii.service.js';
import {clearConversation,setSearchResolutions} from '../src/state/conversation.store.js';

// Only the model and prior resolved context are controlled. Route, controller,
// session resolution, tool/service/repository and Oracle connections are real.
export async function contrastPreparedHttp({sessionId,requests,executeTool,check,controllerOverrides={}}) {
  const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
  const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});
  const load=async(relative,stubs)=>{
    const url=new URL(relative,import.meta.url),main=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
    await main.link(async spec=>synthetic(stubs[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
    await main.evaluate();return main.namespace;
  };
  let next,expected,seen=0;
  const canonical=v=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
  const model={BedrockRuntimeClient:class{async send(){const tool=next;next=null;return {stopReason:tool?'tool_use':'end_turn',output:{message:{role:'assistant',content:tool?[{toolUse:{name:tool.name,toolUseId:'independent-http',input:protectPiiDeep(sessionId,tool.args)}}]:[{text:'Control DEV completado.'}]}}};}},ConverseCommand:class{}};
  const chat=await load('../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':model,'./toolExecutor.service.js':{executeTool:async request=>{
    check(request.name===expected.name&&canonical(request.arguments)===canonical(expected.args),'HTTP_TOOL_ARGUMENTS_MATCH_INDEPENDENT_PROFILE');
    const result=await executeTool(request);seen++;
    check(canonical(result)===canonical(expected.result),'HTTP_RESULT_MATCHES_ORACLE_CONTRASTED_RESULT');return result;
  }}});
  const controller=await load('../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':{chatService:chat.chatService},...controllerOverrides});
  const routes=await load('../src/routes/index.js',{'../controllers/chat.controller.js':controller});
  const app=express();app.use(express.json());app.use('/chatbot/api',routes.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    for(const request of requests){
      clearConversation(sessionId);expected=request;next=request;
      const state={domains:{},contexts:{}};
      for(const [name,id,field]of [['search_customers',request.args.customerId??request.args.customerIds?.[0],'codCliente'],['search_categories',request.args.categoryIds?.[0],'codRubro']]){
        if(id!=null){const selected=protectPiiDeep(sessionId,{[field]:id});state.domains[name]={kind:'selected',selected,result:{status:'RESOLVED',...(name==='search_customers'?{customer:selected}:{category:selected})}};}
      }
      setSearchResolutions(sessionId,state);
      const before=seen;
      const response=await fetch(`http://127.0.0.1:${server.address().port}/chatbot/api/bot/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message:'Ejecuta la consulta validada conservando los filtros.'}),signal:AbortSignal.timeout(90000)});
      const body=await response.json();
      check(response.status===200&&body.success===true&&seen===before+1,'PREPARED_HTTP_POSITIVE_REAL_ORACLE');
    }
  }finally{clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
}
