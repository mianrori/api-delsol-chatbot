// Temporary, session-scoped instrumentation for the existing DEV process.
// Installed through its loopback inspector; original driver methods are restored.
import crypto from 'node:crypto';
import driver from '/app/node_modules/oracledb/index.js';
import {getValidOracleSession} from '/app/src/services/sessions/oracleSession.service.js';
import * as store from '/app/src/state/conversation.store.js';
import {restorePiiDeep} from '/app/src/services/ai/pii.service.js';
import {getInvoicePlateRequest} from '/app/src/services/ai/invoicePlateRequest.service.js';
import {parseNamedInvoiceRequest} from '/app/src/services/ai/invoiceNamedRequest.service.js';
import {normalizeInvoicePlate} from '/app/src/utils/invoicePlate.js';
const tag='__codexInvoiceAffectedTrace';
export async function install({sessionId,nonce,expectedPlate}){
 if(globalThis[tag])throw Error('TRACE_ALREADY_INSTALLED');
 const {username}=await getValidOracleSession(sessionId),target=String(username).toUpperCase(),h=v=>crypto.createHmac('sha256',nonce).update(String(v)).digest('hex');
 const original=driver.getConnection;let step='INITIAL',events=[],opened=0,closed=0,closeErrors=0;
 const safeArgs=input=>Object.fromEntries(Object.entries(input??{}).map(([k,v])=>{
  if(['dateFrom','dateTo'].includes(k)&&/^\d{2}\/\d{2}\/\d{4}$/.test(v))return[k,v];
  if(k==='plate')return[k,{opaque:h(normalizeInvoicePlate(v)),normalizedMatchesRequested:normalizeInvoicePlate(v)===normalizeInvoicePlate(expectedPlate)}];
  if(['mode'].includes(k)&&['detail','summary'].includes(v))return[k,v];
  if(['page','rows'].includes(k)&&Number.isSafeInteger(v))return[k,v];
  return[k,Array.isArray(v)?v.map(x=>({opaque:h(x)})):{opaque:h(JSON.stringify(v))}];
 }));
 const wrapped=async function(...args){const connection=await original.apply(this,args);if(!String(args[0]?.user??'').toUpperCase().endsWith('['+target+']'))return connection;
  opened++;const execute=connection.execute,close=connection.close;let done=false;
  connection.execute=async function(sql,binds,...rest){
   const event={step,sqlTemplate:String(sql).replace(/'(?:''|[^'])*'/g,"'<literal>'").replace(/\s+/g,' ').trim(),binds:safeArgs(binds),authorizedPredicate:/NVL\(USER_CAN_CONSULT,\s*'S'\)\s*<>\s*'N'/i.test(sql),restrictedProbe:/USER_CAN_CONSULT\s*=\s*'N'/i.test(sql),normalizedPlateEquality:/REGEXP_REPLACE\(UPPER\(MATRICULA\)/i.test(sql)&&/=\s*:plate\b/i.test(sql),identityMatchesTarget:true};
   // SQL bind names are repository-internal, not API fields.
   event.binds=Object.fromEntries(Object.entries(binds??{}).map(([k,v])=>[k,k==='plate'?{opaque:h(normalizeInvoicePlate(v)),normalizedMatchesRequested:normalizeInvoicePlate(v)===normalizeInvoicePlate(expectedPlate)}:['dateFrom','dateTo'].includes(k)?v:typeof v==='number'?v:{opaque:h(v)}]));
   try{const result=await execute.call(this,sql,binds,...rest);const first=result.rows?.[0];event.result={empty:(result.rows??[]).length===0,restrictedFlagPresent:first?.HAS_RESTRICTED_DATA!==undefined,restrictedFlag:first?.HAS_RESTRICTED_DATA===1,authorizedCountPresent:first?.TOTAL_ROWS!==undefined,authorizedCountZero:first?.TOTAL_ROWS===0};events.push(event);return result;}
   catch(e){event.errorCode=/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'SQL_FAILED';events.push(event);throw e;}
  };
  connection.close=async function(...a){try{const result=await close.apply(this,a);if(!done){closed++;done=true;}return result;}catch(e){closeErrors++;throw e;}};return connection;
 };
 driver.getConnection=wrapped;
 const entry={setStep(label){if(!['INITIAL','SEQUENTIAL_PLATE','FRESH_PLATE'].includes(label))throw Error('STEP_REJECTED');step=label;},snapshot(){
  const state=store.getSearchResolutions(sessionId),turn=store.getSearchSelectionTurn(sessionId),history=store.getConversation(sessionId),calls=[];const byId=new Map();let turnIndex=-1;
  for(const message of history){if(message.role==='user'&&message.content?.some(b=>typeof b.text==='string'))turnIndex++;for(const block of message.content??[]){if(block.toolUse){const c={turnIndex,name:block.toolUse.name,args:safeArgs(restorePiiDeep(sessionId,block.toolUse.input))};calls.push(c);byId.set(block.toolUse.toolUseId,c);}if(block.toolResult){const c=byId.get(block.toolResult.toolUseId);if(c){const j=block.toolResult.content?.find(x=>x.json)?.json;c.outcome={transportStatus:block.toolResult.status,status:j?.status??null,errorCode:j?.error??null,hasRestrictedData:j?.hasRestrictedData===true,hasDataArray:Array.isArray(j?.data),dataEmpty:Array.isArray(j?.data)?j.data.length===0:null};}}}}
  return {step,targetIdentityOpaque:h(target),intent:{typedNamed:turn.invoiceNamedRequest===true,typedPlate:Boolean(turn.invoicePlateRequest),autonomousPlate:turn.invoicePlateRequest?.autonomous===true},state:{invoiceContext:safeArgs(restorePiiDeep(sessionId,state.contexts.get_invoices)),namedPhase:state.invoiceNamedRequest?.phase??null,namedPeriod:state.invoiceNamedRequest?{dateFrom:state.invoiceNamedRequest.dateFrom,dateTo:state.invoiceNamedRequest.dateTo}:null,customerResolved:state.invoiceNamedRequest?.customer?.status==='RESOLVED',conceptResolved:state.invoiceNamedRequest?.concept?.status==='RESOLVED'},calls,currentCalls:calls.filter(c=>c.turnIndex===turnIndex),sql:events.splice(0),connections:{opened,closed,closeErrors}};
 },dispose(){const untouched=driver.getConnection===wrapped;if(untouched)driver.getConnection=original;delete globalThis[tag];return {driverRestored:untouched,connectionsClosed:opened===closed&&closeErrors===0,opened,closed,closeErrors};}};
 globalThis[tag]=entry;return {installed:true,targetIdentityOpaque:h(target)};
}
