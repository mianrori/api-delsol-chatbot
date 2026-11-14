// Temporary diagnostics in the real DEV process; only the owned conversation.
import driver from '/app/node_modules/oracledb/index.js';
import {BedrockRuntimeClient} from '/app/node_modules/@aws-sdk/client-bedrock-runtime/dist-cjs/index.js';
import * as store from '/app/src/state/conversation.store.js';
import {protectPiiDeep,restorePiiDeep} from '/app/src/services/ai/pii.service.js';
import {getValidOracleSession} from '/app/src/services/sessions/oracleSession.service.js';
export async function install(sessionId){
 const target=(await getValidOracleSession(sessionId)).username.toUpperCase();
 let opened=0,closed=0,closeErrors=0,providerAttempts=0,queries=[];
 const original=driver.getConnection,descriptor=Object.getOwnPropertyDescriptor(BedrockRuntimeClient.prototype,'send');
 const blocked=async()=>{providerAttempts++;throw Error('LIVE_PROVIDER_BLOCKED');};BedrockRuntimeClient.prototype.send=blocked;
 const wrapped=async function(...args){
  const c=await original.apply(this,args);if(!String(args[0]?.user??'').toUpperCase().endsWith('['+target+']'))return c;
  opened++;c.callTimeout=60000;const close=c.close.bind(c),execute=c.execute.bind(c);let done=false;
  c.close=async()=>{try{const r=await close();if(!done){done=true;closed++;}return r;}catch(e){closeErrors++;throw e;}};
  c.execute=async(sql,binds,options)=>{if(!/^\s*(?:SELECT|WITH)\b/i.test(sql))throw Error('READ_ONLY_CONTROL_REQUIRED');queries.push({sql,binds:structuredClone(binds??{})});return execute(sql,binds,options);};return c;
 };driver.getConnection=wrapped;
 globalThis.__invoicePendingLive={
  seedGeneral(sample){
   store.clearConversation(sessionId);
   const option={option:1,customerId:sample.customerId,customerName:sample.customerName};
   store.setSearchResolutions(sessionId,protectPiiDeep(sessionId,{domains:{search_invoice_customers:{kind:'pending',call:{input:{query:sample.customerId,dateFrom:sample.dateFrom,dateTo:sample.dateTo}},result:{options:[option]}}},contexts:{},invoiceLastTool:'get_invoices',choiceFocus:'search_invoice_customers',invoiceNamedRequest:{phase:'customerPending',concept:{status:'RESOLVED',conceptId:sample.conceptId},options:[option],dateFrom:sample.dateFrom,dateTo:sample.dateTo}}));
   return true;
  },
  seedPagination(args){
   const queryContext=protectPiiDeep(sessionId,{...args,rows:1,page:1});
   store.setConversation(sessionId,[{role:'assistant',content:[{toolUse:{toolUseId:'pagination-seed',name:'get_invoice_balances',input:queryContext}}]},{role:'user',content:[{toolResult:{toolUseId:'pagination-seed',status:'success',content:[{json:{queryContext,hasMore:true,nextPage:1}}]}}]}]);return true;
  },
  clearTrace(){queries=[];return true;},
  take(){
   const blocks=store.getConversation(sessionId).flatMap(m=>m.content??[]),tool=blocks.filter(b=>b.toolUse&&b.toolUse.toolUseId!=='pagination-seed').at(-1)?.toolUse;
   const result=blocks.find(b=>b.toolResult?.toolUseId===tool?.toolUseId)?.toolResult;
   return {name:tool?.name,input:restorePiiDeep(sessionId,tool?.input),status:result?.status,result:restorePiiDeep(sessionId,result?.content?.find(c=>c.json)?.json),state:restorePiiDeep(sessionId,store.getSearchResolutions(sessionId)),queries};
  },
  dispose(){
   store.clearConversation(sessionId);queries=[];const driverRestored=driver.getConnection===wrapped,sdkRestored=BedrockRuntimeClient.prototype.send===blocked;
   if(driverRestored)driver.getConnection=original;if(sdkRestored){if(descriptor)Object.defineProperty(BedrockRuntimeClient.prototype,'send',descriptor);else delete BedrockRuntimeClient.prototype.send;}
   delete globalThis.__invoicePendingLive;return {opened,closed,closeErrors,allConnectionsClosed:opened===closed&&!closeErrors,driverRestored,sdkRestored,providerAttempts,ownConversationCleared:true};
  },
 };return true;
}
