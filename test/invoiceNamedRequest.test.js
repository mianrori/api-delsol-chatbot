import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {parseNamedInvoiceRequest} from '../src/services/ai/invoiceNamedRequest.service.js';import {searchInvoiceConceptsRepository} from '../src/repositories/invoices/invoiceConcepts.repository.js';
test('explicit concept, year and local are separate roles without a hardcoded concept name',()=>{
 for(const message of ['facturas de arrendamiento m\u00ednimo del 2023 del local impacto','Facturas del concepto arrendamiento m\u00ednimo del local impacto de 2023','Consulta las facturas de arrendamiento m\u00ednimo durante el a\u00f1o 2023 del local impacto'])assert.deepEqual(parseNamedInvoiceRequest(message),{conceptQuery:'arrendamiento m\u00ednimo',customerQuery:'impacto',dateFrom:'01/01/2023',dateTo:'31/12/2023'});
 assert.equal(parseNamedInvoiceRequest('Facturas de gastos comunes del 2024 del local Ejemplo').conceptQuery,'gastos comunes');
 for(const message of ['Facturas del cliente Arrendamiento M\u00ednimo de 2023','Facturas de Impacto del 2023','Ver m\u00e1s','facturas de arrendamiento m\u00ednimo del 2023 del local impacto sin anuladas'])assert.equal(parseNamedInvoiceRequest(message),null);
});
test('concept text is accent insensitive while literal concept codes remain bound exactly',async()=>{
 const calls=[];const connection={async execute(sql,binds){calls.push({sql,binds});return {rows:[{COD_CONCEPTO:'K1',DESCRIPCION:'ARRENDAMIENTO MINIMO'}]};}};
 await searchInvoiceConceptsRepository({connection,query:'arrendamiento m\u00ednimo'});assert.equal(calls[0].binds.normalizedQuery,'ARRENDAMIENTOMINIMO');assert.match(calls[0].sql,/TRANSLATE/);assert.match(calls[0].sql,/:normalizedQuery/);
 await searchInvoiceConceptsRepository({connection,query:'A-1'});assert.equal(calls[1].binds.query,'A-1');assert.match(calls[1].sql,/UPPER\(COD_CONCEPTO\) = :query/);
});
for(const scenario of ['resolved','prior','concept-missing','customer-missing','concept-ambiguous','customer-ambiguous','both-ambiguous','wrong-choice'])for(const trimmed of ([false,...(['concept-ambiguous','customer-ambiguous','both-ambiguous'].includes(scenario)?[true]:[])]))test(`invoice roles ${scenario}; trimmed=${trimmed}`,()=>{
 const r=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/invoiceNamedRequest.mjs',import.meta.url)),scenario,String(trimmed)],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INVOICE_NAMED_PASS/);
});
