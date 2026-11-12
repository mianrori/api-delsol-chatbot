import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import express from 'express';
import config from '../../config.js';
import * as store from '../../src/state/conversation.store.js';
import {clearPiiSession} from '../../src/state/pii.store.js';
const logs=[];for(const k of ['log','info','warn','error','debug'])console[k]=(...values)=>logs.push(values);
process.env.NODE_ENV='development';config.env='development';config.bedrockDebug=true;config.bedrockDebugPayloads=true;config.piiDebug=true;config.piiDebugShowRaw=true;
const sessionId='SYNTHETIC-BALANCE-HTTP',name='TIENDA PRIVADA',company='RAZON PRIVADA',tax='80007654-3';
const customerIds=['C-PRIVATE-1','C-PRIVATE-2'];let opened=0,closed=0,denied=false,modelCalls=0,phase='search';const queries=[],identities=[];
const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
async function load(path,overrides={}){
 const url=new URL(path,import.meta.url),m=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
 await m.link(async spec=>synthetic(overrides[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec.startsWith('node:')?spec:new URL('file://'+createRequire(url).resolve(spec)).href)));
 await m.evaluate();return m.namespace;
}
const sessions=await load('../../src/services/sessions/oracleSession.service.js',{
 '../../database/oracle.database.js':{async connectWithProxy(username){identities.push(username);opened++;return {
   async close(){closed++;},async execute(sql,binds){queries.push({sql,binds:structuredClone(binds)});if(denied)throw Object.assign(Error('PRIVATE_ORACLE_ERROR'),{errorNum:1031});
    if(sql.includes('ROWNUM<=21'))return {rows:customerIds.map(id=>({COD_CLIENTE:id,CUSTOMER_NAME:name+' '+id.at(-1),BUSINESS_NAME:company,TAX_ID:tax,PRIORITY:1}))};
    if(!sql.includes('ROW_NUMBER()'))return {rows:[{CURRENCY_SYMBOL:'PYG',TOTAL_ROWS:2,DISTINCT_INVOICE_NUMBERS:2,DISTINCT_CUSTOMERS:1,TOTAL_BALANCE:123.45,POSITIVE_BALANCE:123.45,OVERDUE_BALANCE:123.45}]};
    return {rows:[{NRO_FACTURA:binds.offset===0?'PRIVATE-INVOICE-1':'PRIVATE-INVOICE-2',COD_CLIENTE:customerIds[1],NOM_CLIENTE:name+' 2',RAZON_SOCIAL:company,RUC:tax,SIMBOLO_MONEDA:'PYG',SALDO:binds.offset===0?100:23.45,VENCIMIENTO:'01/01/2026',DUE_DATE:new Date('2026-01-01'),DUE_STATUS:'overdue',DAYS_OVERDUE:315,AGING_BAND:'181+'}]};
   },
 };}},
 '../../repositories/sessions/oracleSession.repository.js':{
  async getOracleSessionRepository(id){assert.equal(id,sessionId);return {username:'SERVER_PROXY_IDENTITY',status:'ACTIVE'};},async touchOracleSessionRepository(){},
 },
});
const executor=await load('../../src/services/ai/toolExecutor.service.js',{'../sessions/oracleSession.service.js':sessions});
const sdk={BedrockRuntimeClient:class{async send(command){modelCalls++;const payload=JSON.stringify(command.input);
 for(const privateValue of [...customerIds,name,company,tax,'PRIVATE-INVOICE-1','PRIVATE-INVOICE-2'])assert.ok(!payload.includes(privateValue),'PII reached model: '+privateValue);
 if(phase==='search'&&modelCalls===1){const query=payload.match(/\[PII_BUSINESS_ENTITY_\d+\]/)?.[0];assert.ok(query);return {output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'search-balances',name:'search_invoice_balance_customers',input:{query}}}]}},stopReason:'tool_use'};}
 if(phase==='search'){assert.ok(payload.includes('AMBIGUOUS'));return {output:{message:{role:'assistant',content:[{text:'Selecciona la opción 1 o 2.'}]}},stopReason:'end_turn'};}
 const input={customerIds:['MODEL-FORGED-ID'],rows:1,asOfDate:'12/11/2026',balanceStatus:'positive',dueStatus:'overdue'};
 return {output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'query-balances-'+modelCalls,name:'get_invoice_balances',input}}]}},stopReason:'tool_use'};
}},ConverseCommand:class{constructor(input){this.input=input;}}};
const chat=await load('../../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':sdk,'./toolExecutor.service.js':executor});
const controller=await load('../../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':chat,'../services/sessions/oracleSession.service.js':sessions});
const router=await load('../../src/routes/index.js',{'../controllers/chat.controller.js':controller});
const app=express();app.use(express.json());app.use('/chatbot/api',router.router);
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const post=async message=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/chatbot/api/bot/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,username:'UNTRUSTED_FRONTEND'})});const body=await r.json();assert.equal(r.status,200);assert.equal(body.success,true);return body;};
try{
 const search=await post('Saldo de '+name);assert.match(search.response,/Selecciona/);assert.equal(opened,closed);
 phase='detail';const first=await post('2');assert.match(first.response,/PRIVATE-INVOICE-1/);assert.match(first.response,/TIENDA PRIVADA 2/);assert.doesNotMatch(first.response,/MODEL-FORGED-ID|C-PRIVATE|Ver PDF/);assert.match(first.response,/100,00/);assert.equal(modelCalls,3);assert.equal(opened,closed);
 const countBefore=modelCalls;const second=await post('Siguiente página');assert.equal(modelCalls,countBefore);assert.match(second.response,/PRIVATE-INVOICE-2/);assert.doesNotMatch(second.response,/PRIVATE-INVOICE-1/);assert.equal(opened,closed);
 for(const q of queries.filter(q=>!q.sql.includes('ROWNUM<=21'))){assert.equal(q.binds.customerIds0,customerIds[1]);assert.equal(q.binds.asOfDate,'12/11/2026');assert.match(q.sql,/SALDO > 0/);assert.match(q.sql,/DUE_DATE < REF_DATE/);}
 const history=JSON.stringify(store.getConversation(sessionId));for(const value of [...customerIds,name,company,tax,'PRIVATE-INVOICE-1','PRIVATE-INVOICE-2'])assert.ok(!history.includes(value),'PII persisted in history: '+value);
 denied=true;phase='denied';const rejection=await post('Consulta de nuevo el saldo');assert.equal(rejection.response,'El usuario no tiene permisos para consultar esta información.');assert.deepEqual(rejection.actions,{});assert.equal(opened,closed);
 assert.ok(identities.every(v=>v==='SERVER_PROXY_IDENTITY'));assert.ok(!identities.includes('UNTRUSTED_FRONTEND'));
 for(const value of [...customerIds,name,company,tax,'PRIVATE-INVOICE-1','PRIVATE_ORACLE_ERROR','123.45'])assert.ok(!JSON.stringify(logs).includes(value),'Sensitive logging: '+value);
 process.stdout.write('INVOICE_BALANCES_HTTP_PASS');
}finally{store.clearConversation(sessionId);clearPiiSession(sessionId);await new Promise(resolve=>server.close(resolve));}
