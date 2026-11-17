import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getInvoiceDebtStatusIntent,isPendingInvoiceRequest} from '../src/services/ai/invoicePendingRequest.service.js';
import {protectPiiText,restorePiiTextForUser} from '../src/services/ai/pii.service.js';
import {clearConversation} from '../src/state/conversation.store.js';
const literal='Mostrame las facturas de Impacto cuya deuda ya está cancelada';
test('settled debt intent takes precedence over pendiente and never means annulled invoice',()=>{
 for(const text of [literal,'facturas pagadas','sin deuda pendiente','ahora las canceladas','facturas de Impacto sin deuda pendiente']){assert.equal(getInvoiceDebtStatusIntent(text),'settled');assert.equal(isPendingInvoiceRequest(text),false);}
 for(const text of ['facturas anuladas','facturas canceladas'])assert.equal(getInvoiceDebtStatusIntent(text),null);
 assert.equal(getInvoiceDebtStatusIntent('facturas pendientes'),'pending');
});
test('PII preserves debt intent and restores the customer without swallowing the qualifier',()=>{
 const id='SYNTHETIC-SETTLED-PII';
 try{for(const text of [literal,'facturas pagadas de Impacto','facturas de Impacto sin deuda pendiente']){
  const protectedText=protectPiiText(id,text);assert.ok(!protectedText.includes('Impacto'));assert.equal(getInvoiceDebtStatusIntent(protectedText),'settled');assert.equal(restorePiiTextForUser(id,protectedText),text);
 }}finally{clearConversation(id);}
});
for(const trimmed of [false,true])for(const scenario of ['literal','paid','without','followup','empty','denied','failed','guard','ambiguous','noContext']){
 test(`settled HTTP ${scenario}; trimmed=${trimmed}`,()=>{
  const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoiceSettledHttp.mjs',import.meta.url)),scenario,String(trimmed)],{encoding:'utf8',timeout:20000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_SETTLED_HTTP_PASS/);
 });
}
