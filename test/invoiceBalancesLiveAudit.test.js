import test from 'node:test';import assert from 'node:assert/strict';
import {auditAffectedLogs} from '../scripts/invoice-affected-log-audit.mjs';
test('balance live audit accepts only hidden payload schemas and rejects sensitive or unknown records',()=>{
 const log=v=>'[CHATBOT-DEV] TOOL RESULT\n'+JSON.stringify(v);
 assert.equal(auditAffectedLogs(log({name:'get_invoice_balances',result:'[payload oculto]'}),'chatbot').safe,true);
 assert.equal(auditAffectedLogs(log({name:'get_invoice_balances',result:{debt:'123.45'}}),'chatbot').safe,false);
 assert.equal(auditAffectedLogs(log({name:'get_invoice_balances',result:'[payload oculto]',extra:'PRIVATE'}),'chatbot').safe,false);
 assert.equal(auditAffectedLogs(log({name:'unknown',result:'[payload oculto]'}),'chatbot').safe,false);
});
