// Own-session instrumentation only; no result substitution or provider calls.
import driver from '/app/node_modules/oracledb/index.js';
import {BedrockRuntimeClient} from '/app/node_modules/@aws-sdk/client-bedrock-runtime/dist-cjs/index.js';
import * as store from '/app/src/state/conversation.store.js';
import {restorePiiDeep} from '/app/src/services/ai/pii.service.js';
import {trimConversation} from '/app/src/services/ai/conversation.service.js';
import {getValidOracleSession} from '/app/src/services/sessions/oracleSession.service.js';
export async function install(sessionId){
 const username=(await getValidOracleSession(sessionId)).username.toUpperCase();
 let opened=0,closed=0,closeErrors=0,providerAttempts=0,queries=[],previous=new Set();
 const original=driver.getConnection,descriptor=Object.getOwnPropertyDescriptor(BedrockRuntimeClient.prototype,'send');
 const blocked=async()=>{providerAttempts++;throw Error('LIVE_PROVIDER_BLOCKED');};BedrockRuntimeClient.prototype.send=blocked;
 const wrapped=async function(...args){const c=await original.apply(this,args);if(!String(args[0]?.user??'').toUpperCase().endsWith('['+username+']'))return c;
  opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);let done=false;
  c.close=async()=>{try{const result=await close();if(!done){done=true;closed++;}return result;}catch(e){closeErrors++;throw e;}};
  c.execute=async(sql,binds,options)=>{if(!/^\s*(?:SELECT|WITH)\b/i.test(sql))throw Error('READ_ONLY_REQUIRED');queries.push({sql,binds:structuredClone(binds??{})});return execute(sql,binds,options);};return c;
 };driver.getConnection=wrapped;store.clearConversation(sessionId);
 globalThis.__invoiceSettledLive={
  begin(){queries=[];previous=new Set(store.getConversation(sessionId).flatMap(m=>m.content??[]).filter(b=>b.toolUse).map(b=>b.toolUse.toolUseId));return true;},
  take(){const blocks=store.getConversation(sessionId).flatMap(m=>m.content??[]);
   const calls=blocks.filter(b=>b.toolUse&&!previous.has(b.toolUse.toolUseId)).map(b=>{const t=b.toolUse,r=blocks.find(x=>x.toolResult?.toolUseId===t.toolUseId)?.toolResult;return {name:t.name,input:restorePiiDeep(sessionId,t.input),status:r?.status,result:restorePiiDeep(sessionId,r?.content?.find(x=>x.json)?.json)};});
   return {calls,queries,state:restorePiiDeep(sessionId,store.getSearchResolutions(sessionId))};
  },
  trim(){const history=store.getConversation(sessionId);for(let i=0;i<12;i++)history.push({role:'user',content:[{text:'Tema independiente de prueba '+i}]},{role:'assistant',content:[{text:'Recibido.'}]});const trimmed=trimConversation(history,10);store.setConversation(sessionId,trimmed);const page=store.getInvoiceBalancePageState(sessionId);return {noToolReferences:!trimmed.some(m=>m.content?.some(b=>b.toolUse)),cachedStatus:page?.status,debtStatus:page?.queryContext?.debtStatus,nextPage:page?.nextPage};},
  dispose(){store.clearConversation(sessionId);queries=[];previous.clear();const driverRestored=driver.getConnection===wrapped,sdkRestored=BedrockRuntimeClient.prototype.send===blocked;
   if(driverRestored)driver.getConnection=original;if(sdkRestored){if(descriptor)Object.defineProperty(BedrockRuntimeClient.prototype,'send',descriptor);else delete BedrockRuntimeClient.prototype.send;}
   delete globalThis.__invoiceSettledLive;return {opened,closed,closeErrors,allConnectionsClosed:opened===closed&&!closeErrors,driverRestored,sdkRestored,providerAttempts,ownConversationAndPageStateCleared:true};
  },
 };return true;
}
