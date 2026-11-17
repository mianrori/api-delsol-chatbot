import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildCustomerSelectionResponse} from '../src/services/ai/customerSelectionPresentation.service.js';
import {protectPiiDeep,restorePiiTextForUser} from '../src/services/ai/pii.service.js';
import {clearConversation} from '../src/state/conversation.store.js';

for(const name of ['search_customers','search_invoice_customers','search_invoice_balance_customers'])test(name+' displays authorized code beside equal names without relaxing ID privacy',()=>{
 const id='CHOICE-'+name;
 try{
  const options=['0012','0045'].map((code,i)=>({optionId:String(i+1),...(name==='search_customers'?{codCliente:code,name:'Tienda Igual'}:{customerId:code,customerName:'Tienda Igual'}),taxId:'PRIVATE-TAX',businessName:'PRIVATE-BUSINESS'}));
  const result=protectPiiDeep(id,{status:'AMBIGUOUS',options,hasMore:true});
  const text=buildCustomerSelectionResponse(id,[{name,result}]);
  assert.doesNotMatch(text,/0012|0045|Tienda Igual|PRIVATE-/);
  const publicText=restorePiiTextForUser(id,text);
  assert.match(publicText,/\| Opción \| Código de cliente \| Cliente \|/);
  assert.match(publicText,/\| 1 \| 0012 \| Tienda Igual \|/);assert.match(publicText,/\| 2 \| 0045 \| Tienda Igual \|/);
  assert.match(publicText,/lista está limitada/);assert.doesNotMatch(publicText,/PRIVATE-|PII_|customerId|codCliente/);
  assert.equal(restorePiiTextForUser(id,result.options[0].customerId??result.options[0].codCliente),'');
  assert.doesNotMatch(restorePiiTextForUser('OTHER-CHOICE',text),/0012|0045|Tienda Igual/);
 }finally{clearConversation(id);}
});
test('no stale, failed, resolved or unrelated catalog is presented as a customer choice',()=>{
 const call={name:'search_invoice_customers',result:{status:'AMBIGUOUS',options:[{option:1,customerId:'1',customerName:'A'}]}};
 for(const calls of [[],[{...call,result:{...call.result,error:'PRIVATE'}}],[{...call,result:{...call.result,success:false}}],[{...call,result:{status:'RESOLVED'}}],[call,{name:'get_invoices',result:{data:[]}}],[{...call,name:'search_invoice_concepts'}]])assert.equal(buildCustomerSelectionResponse('CHOICE-GUARD',calls),null);
 clearConversation('CHOICE-GUARD');
});
test('missing code is not invented and catalog text is escaped',()=>{
 const id='CHOICE-MISSING';try{
  const text=restorePiiTextForUser(id,buildCustomerSelectionResponse(id,[{name:'search_invoice_customers',result:{status:'AMBIGUOUS',options:[{option:1,customerName:'A | <tag>\nB'}]}}]));
  assert.match(text,/No informado/);assert.ok(text.includes('A \\| \\<tag\\> B'));
 }finally{clearConversation(id);}
});
for(const domain of ['sales','billing','balances'])for(const trimmed of [false,true])test(`customer choice HTTP ${domain}, trimmed=${trimmed}`,()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/customerSelectionHttp.mjs',import.meta.url)),domain,String(trimmed)],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/CUSTOMER_CHOICE_HTTP_PASS/);
});
