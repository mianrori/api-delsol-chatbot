import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import express from 'express';
import {setConversation,clearConversation} from '../src/state/conversation.store.js';
import {executeTool} from '../src/services/ai/toolExecutor.service.js';
import {chartMatchesSource} from './chart-value-association.mjs';

// HTTP is real; model calls are planned. Auth/source are explicitly controlled
// by unit tests, or supplied by the DEV worker from a real authorized query.
export async function contrastChartHttp({sessionId,sourceName,sourceResult,sourceArgs,controlledAuth=false,check,dataPath='data',labelPath='month',amountPath='totalAmount',secondPath='exchangeAmount'}) {
 const ctx=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context:ctx});
 const load=async(relative,stubs)=>{const url=new URL(relative,import.meta.url),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context:ctx});await m.link(async spec=>synthetic(stubs[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));await m.evaluate();return m.namespace;};
 let next,captured;
 const model={BedrockRuntimeClient:class{async send(){const args=next;next=null;return {stopReason:args?'tool_use':'end_turn',output:{message:{role:'assistant',content:args?[{toolUse:{name:'generate_chart',toolUseId:'chart-http',input:args}}]:[{text:'Gráfico completado.'}]}}};}},ConverseCommand:class{}};
 const chat=await load('../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':model,'./toolExecutor.service.js':{executeTool:async request=>{check(request.name==='generate_chart','CHART_HTTP_ONLY_CHART_TOOL');captured=await executeTool(request);return captured;}}});
 const controller=await load('../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':{chatService:chat.chatService},...(controlledAuth?{'../services/sessions/oracleSession.service.js':{getValidOracleSession:async()=>({username:'SYNTHETIC'})}}:{})});
 const routes=await load('../src/routes/index.js',{'../controllers/chat.controller.js':controller});
 const app=express();app.use(express.json());app.use('/chatbot/api',routes.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const original=JSON.stringify(sourceResult);
 const field=(row,path)=>path.split('.').reduce((v,k)=>v?.[k],row),sourceRows=field(sourceResult,dataPath);
 try{
  for(const [type,multi]of [['horizontalBar',false],['pie',false],['horizontalBar',true]]){
   clearConversation(sessionId);
   const result=structuredClone(sourceResult);
   const history=[{role:'user',content:[{text:'Consulta fuente validada.'}]},{role:'assistant',content:[{toolUse:{name:sourceName,toolUseId:'source-http',input:structuredClone(sourceArgs)}}]},{role:'user',content:[{toolResult:{toolUseId:'source-http',status:'success',content:[{json:result}]}}]}];
   setConversation(sessionId,history);
   next={type,dataPath,labelPaths:[labelPath],datasets:[{label:'Ventas',valuePath:amountPath},...(multi?[{label:'Otro importe',valuePath:secondPath}]:[])],title:'Resultados del período'};captured=null;
   const response=await fetch(`http://127.0.0.1:${server.address().port}/chatbot/api/bot/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message:'Grafícalo con el resultado fuente.'}),signal:AbortSignal.timeout(controlledAuth?5000:60000)});
   const body=await response.json(),chart=body.actions?.chart;
   check(response.status===200&&body.success===true&&Boolean(chart?.available)&&captured?.result.sourceToolUseId==='source-http','CHART_HTTP_SUCCESS_AND_EXACT_SOURCE');
   const svg=Buffer.from(chart.url.split(',')[1],'base64').toString('utf8');
   check(chart.pointCount===sourceRows.length&&chart.datasetCount===(multi?2:1),'CHART_HTTP_POINT_AND_SERIES_COUNTS');
   check(chartMatchesSource({chart,labels:sourceRows.map(r=>field(r,labelPath)),series:[{label:'Ventas',values:sourceRows.map(r=>field(r,amountPath))},...(multi?[{label:'Otro importe',values:sourceRows.map(r=>field(r,secondPath))}]:[])]}),'CHART_HTTP_LABEL_SERIES_VALUE_ASSOCIATION_MATCHES_SOURCE');
   check(chart.valuePrefix==='₲'&&svg.includes('₲'),'CHART_HTTP_CURRENCY_MATCHES_SOURCE');
   check(chart.subtitle===`Período: ${sourceArgs.dateFrom} a ${sourceArgs.dateTo}`&&svg.includes(sourceArgs.dateFrom)&&svg.includes(sourceArgs.dateTo),'CHART_HTTP_PERIOD_MATCHES_SOURCE_QUERY');
   check(JSON.stringify(result)===original,'CHART_HTTP_SOURCE_NOT_MUTATED');
  }
 }finally{clearConversation(sessionId);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
