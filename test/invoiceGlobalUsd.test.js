import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {resolveInvoiceBalanceCurrency,normalizeInvoiceBalanceArgs,getInvoiceBalances} from '../src/services/invoices/invoiceBalances.service.js';
import {publicAssistantText,stripInternalReasoning,SAFE_ASSISTANT_RESPONSE} from '../src/services/ai/assistantOutput.service.js';
import {getInvoiceBalancesTool} from '../src/tools/invoices/invoiceBalances.tool.js';
import {executeGlobalInvoiceBalanceRequest} from '../src/services/ai/invoiceGlobalRequest.service.js';
import {setSearchResolutions,clearConversation} from '../src/state/conversation.store.js';
const catalogue=rows=>({queries:[],async execute(sql,binds){this.queries.push({sql,binds});return {rows};}});
test('global USD followup handler leaves existing single-customer flows to their own resolver',async()=>{
 const sessionId='SCOPED-USD';try{setSearchResolutions(sessionId,{domains:{},invoiceLastTool:'get_invoice_balances',contexts:{get_invoice_balances:{customerIds:['KNOWN'],debtStatus:'pending'}}});assert.equal(await executeGlobalInvoiceBalanceRequest({sessionId,message:'Detalla las que son en dólares',execute:async()=>assert.fail('must not execute a global query')}),null);}finally{clearConversation(sessionId);}
});
test('contract, service and repository already allow global paginated detail without customer fanout',async()=>{
 assert.equal(getInvoiceBalancesTool.toolSpec.inputSchema.json.required,undefined);
 assert.deepEqual(normalizeInvoiceBalanceArgs({mode:'detail'}).customerIds,[]);
 const c=catalogue([]);await getInvoiceBalances({customerIds:[],currencyCodes:['NATIVE-USD'],page:2},c);
 assert.equal(c.queries.length,2);for(const q of c.queries){assert.match(q.sql,/VW_BOT_FACTURAS_SALDOS/);assert.doesNotMatch(q.sql,/COD_CLIENTE IN/);assert.match(q.sql,/AND DEUDA > 0/);assert.match(q.sql,/COD_MONEDA IN/);assert.equal(q.binds.currencyCodes0,'NATIVE-USD');}
});
test('USD uses an authorized native code, not a numeric convention or isolated dollar sign',async()=>{
 const c=catalogue([{COD_MONEDA:'CODE-9',SIMBOLO_MONEDA:'USD'},{COD_MONEDA:'CODE-9',SIMBOLO_MONEDA:'$'},{COD_MONEDA:'CODE-1',SIMBOLO_MONEDA:'PYG'}]);
 assert.deepEqual(await resolveInvoiceBalanceCurrency({currency:'USD'},c),{status:'RESOLVED',currency:'USD',currencyCode:'CODE-9',displayLabels:{'CODE-9':'USD','CODE-1':'PYG'}});
 assert.equal(c.queries.length,1);assert.match(c.queries[0].sql,/SELECT DISTINCT COD_MONEDA, SIMBOLO_MONEDA/);assert.match(c.queries[0].sql,/DEUDA > 0/);assert.doesNotMatch(c.queries[0].sql,/SUM\(|COD_CLIENTE|USER_CAN_CONSULT/);
});
test('global clean summary labels native codes from the authorized catalogue without recomputing totals',async()=>{
 const c={queries:[],async execute(sql){this.queries.push(sql);return {rows:sql.includes('ROWNUM<=201')?[{COD_MONEDA:'NATIVE-X',SIMBOLO_MONEDA:'USD'}]:[{TOTAL_ROWS:2,DUPLICATE_ROWS:0,TOTAL_GROUPS:1,RN:1,COD_MONEDA:'NATIVE-X',DEUDA:'10.01',INVOICE_COUNT:2,CURRENCY_RANK:1}]};}};
 const r=await getInvoiceBalances({mode:'summary'},c);assert.equal(c.queries.length,2);assert.equal(r.data[0].currencySymbol,'USD');assert.equal(r.data[0].currencyCode,'NATIVE-X');assert.equal(r.data[0].debt,'10.01');assert.equal(r.invoiceCount,2);
});
for(const [label,rows,status] of [
 ['only $',[{COD_MONEDA:'2',SIMBOLO_MONEDA:'$'}],'NOT_IDENTIFIED'],
 ['missing',[],'NOT_IDENTIFIED'],
 ['two native codes',[{COD_MONEDA:'A',SIMBOLO_MONEDA:'USD'},{COD_MONEDA:'B',SIMBOLO_MONEDA:'US$'}],'AMBIGUOUS'],
 ['conflicting symbols',[{COD_MONEDA:'A',SIMBOLO_MONEDA:'USD'},{COD_MONEDA:'A',SIMBOLO_MONEDA:'PYG'}],'AMBIGUOUS'],
 ['truncated catalogue',Array.from({length:201},(_,i)=>({COD_MONEDA:String(i),SIMBOLO_MONEDA:'USD'})),'INCOMPLETE'],
])test('currency resolution fails safely: '+label,async()=>{const r=await resolveInvoiceBalanceCurrency({currency:'USD'},catalogue(rows));assert.equal(r.status,status);assert.equal(r.currencyCode,undefined);});
test('currency resolver rejects arbitrary filters before executing SQL',async()=>{
 const c=catalogue([]);for(const args of [{currency:'USD',username:'FORGED'},{currency:'USD',customerIds:['A']},{currency:'EUR'}])await assert.rejects(resolveInvoiceBalanceCurrency(args,c));assert.equal(c.queries.length,0);
});
test('public text excludes structured reasoning and marked text across content blocks',()=>{
 assert.equal(publicAssistantText({content:[{reasoningContent:{reasoningText:{text:'PRIVATE_THOUGHT',signature:'SECRET'}}},{text:'<think>PRIVATE_1'},{text:'PRIVATE_2</think>Resultado.'}]}),'Resultado.');
 for(const tag of ['analysis','thinking','reasoning','reasoning_content'])assert.equal(stripInternalReasoning(`<${tag}>PRIVATE</${tag}>Resultado.`),'Resultado.');
 assert.equal(stripInternalReasoning('Resultado.<think>PRIVATE_UNFINISHED'),SAFE_ASSISTANT_RESPONSE);
 assert.equal(stripInternalReasoning('PRIVATE</think>Resultado.'),SAFE_ASSISTANT_RESPONSE);
 assert.equal(stripInternalReasoning('<|analysis|>PRIVATE<|final|>Resultado.'),'Resultado.');
 assert.equal(publicAssistantText({content:[{text:'PRIVATE',reasoningContent:{}},{text:'Resultado.'}]}),'Resultado.');
});
for(const scenario of ['sequence','denied','empty','ambiguous','failure','public-reasoning'])test('HTTP global pending/USD: '+scenario,()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoiceGlobalUsdHttp.mjs',import.meta.url)),scenario],{encoding:'utf8',timeout:25000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/GLOBAL_USD_HTTP_PASS/);
});
