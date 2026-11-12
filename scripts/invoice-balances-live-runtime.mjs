// Temporary instrumentation in the deployed process; owned conversation only.
import driver from '/app/node_modules/oracledb/index.js';
import {BedrockRuntimeClient} from '/app/node_modules/@aws-sdk/client-bedrock-runtime/dist-cjs/index.js';
import * as store from '/app/src/state/conversation.store.js';
import {protectPiiDeep,restorePiiDeep} from '/app/src/services/ai/pii.service.js';
import {getValidOracleSession} from '/app/src/services/sessions/oracleSession.service.js';
export async function install(sessionId){
 const target=String((await getValidOracleSession(sessionId)).username).toUpperCase();
 let opened=0,closed=0,errors=0,providerAttempts=0;
 const original=driver.getConnection,descriptor=Object.getOwnPropertyDescriptor(BedrockRuntimeClient.prototype,'send');
 const blocked=async()=>{providerAttempts++;throw Error('LIVE_CONTROL_PROVIDER_BLOCKED');};
 BedrockRuntimeClient.prototype.send=blocked;
 const wrapped=async function(...args){const c=await original.apply(this,args);if(!String(args[0]?.user??'').toUpperCase().endsWith('['+target+']'))return c;opened++;const close=c.close.bind(c);let done=false;c.close=async()=>{try{const r=await close();if(!done){done=true;closed++;}return r;}catch(e){errors++;throw e;}};return c;};
 driver.getConnection=wrapped;
 globalThis.__invoiceBalancesLive={
  seed(args){store.clearConversation(sessionId);const queryContext=protectPiiDeep(sessionId,args);store.setConversation(sessionId,[{role:'assistant',content:[{toolUse:{name:'get_invoice_balances',toolUseId:'live-seed',input:{}}}]},{role:'user',content:[{toolResult:{toolUseId:'live-seed',status:'success',content:[{json:{queryContext,hasMore:true,nextPage:args.page??1}}]}}]}]);return true;},
  take(){const blocks=store.getConversation(sessionId).flatMap(m=>m.content??[]),r=blocks.filter(b=>b.toolResult&&b.toolResult.toolUseId!=='live-seed').at(-1)?.toolResult;return r?restorePiiDeep(sessionId,r.content.find(c=>c.json)?.json):null;},
  dispose(){store.clearConversation(sessionId);const restored=driver.getConnection===wrapped;if(restored)driver.getConnection=original;const sdkRestored=BedrockRuntimeClient.prototype.send===blocked;if(sdkRestored){if(descriptor)Object.defineProperty(BedrockRuntimeClient.prototype,'send',descriptor);else delete BedrockRuntimeClient.prototype.send;}delete globalThis.__invoiceBalancesLive;return {driverRestored:restored,sdkRestored,providerAttempts,opened,closed,closeErrors:errors,allConnectionsClosed:opened===closed&&!errors,ownConversationCleared:true};}
 };
 return true;
}
