import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCategory} from '../src/services/categories/category.resolver.js';
import {resolveCustomer} from '../src/services/customers/customer.resolver.js';
import {resolveMember} from '../src/services/members/member.resolver.js';
import {searchSolesTypes} from '../src/services/soles/searchSolesTypes.service.js';
import {searchInvoiceCustomersRepository} from '../src/repositories/invoices/invoiceCustomers.repository.js';
import config from '../config.js';
import {searchInvoiceConceptsRepository} from '../src/repositories/invoices/invoiceConcepts.repository.js';

const connection=rows=>({execute:async()=>({rows})});
test('duplicate exact categories stay ambiguous regardless of Oracle row order',async()=>{
 const rows=[{COD_RUBRO:'A',DESCRIPCION:'Synthetic',SIMILARITY:100},{COD_RUBRO:'B',DESCRIPCION:'Synthetic',SIMILARITY:100}];
 for(const ordered of [rows,[...rows].reverse()]){const r=await resolveCategory('Synthetic',connection(ordered));assert.equal(r.status,'AMBIGUOUS');assert.equal(r.options.length,2);}
});
test('a capped category candidate cannot be declared unique',async()=>{
 const r=await resolveCategory('Synthetic',connection([{COD_RUBRO:'A',DESCRIPCION:'Synthetic alpha',SIMILARITY:90,TOTAL_MATCHES:3,EXACT_MATCH_COUNT:0}]));
 assert.equal(r.status,'AMBIGUOUS');assert.equal(r.hasMore,true);
});
test('shared exact member identifiers never select the first identity',async()=>{
 const rows=['A','B'].map(COD_SOCIO=>({COD_SOCIO,NOMBRE_COMPLETO:'Synthetic member',MATCH_PRIORITY:1,SIMILARITY:100}));
 for(const ordered of [rows,[...rows].reverse()]){const r=await resolveMember('Synthetic shared value',connection(ordered));assert.equal(r.status,'AMBIGUOUS');assert.equal(r.options.length,2);}
});
test('a capped exact member result retains ambiguity',async()=>{
 const limit=config.limitFilter;try{config.limitFilter=1;
  const r=await resolveMember('Synthetic shared value',connection([{COD_SOCIO:'A'},{COD_SOCIO:'B'}]));
  assert.equal(r.status,'AMBIGUOUS');assert.equal(r.hasMore,true);
 }finally{config.limitFilter=limit;}
});
test('canonical soles aliases cannot choose between duplicate descriptions',async()=>{
 const rows=[{COD_TIPO_SOL:1,DESCRIPCION:'SOLES'},{COD_TIPO_SOL:2,DESCRIPCION:'SOLES'}];
 for(const ordered of [rows,[...rows].reverse()]){const r=await searchSolesTypes({query:'normales'},connection(ordered));assert.equal(r.status,'AMBIGUOUS');assert.equal(r.options.length,2);}
});
test('active customers are filtered before the search cap and ordering is deterministic',async()=>{
 let sql;await resolveCustomer('Synthetic',{execute:async statement=>{sql=statement;return {rows:[]};}});
 assert.match(sql,/WHERE EXISTS\s*\(/);assert.match(sql,/SIMILARITY DESC, COD_CLIENTE/);
});
test('invoice customer deduplication happens in Oracle before maxRows truncation',async()=>{
 let sql;await searchInvoiceCustomersRepository({connection:{execute:async statement=>{sql=statement;return {rows:[{COD_CLIENTE:'A',MATCH_PRIORITY:1}]};}},query:'Synthetic',dateFrom:'01/01/2023',dateTo:'31/01/2023'});
 assert.match(sql,/PARTITION BY COD_CLIENTE/);assert.match(sql,/CUSTOMER_ROW = 1/);
 assert.match(sql,/FECHA_EMISION >= TO_DATE\(:dateFrom/);assert.match(sql,/FECHA_EMISION < TO_DATE\(:dateTo/);
});
test('invoice concept partial search treats SQL wildcard characters literally',async()=>{
 let sql,binds;await searchInvoiceConceptsRepository({query:'_%',connection:{execute:async(s,b)=>{sql=s;binds=b;return {rows:[]};}}});
 assert.equal(binds.query,'_%');assert.match(sql,/INSTR\(UPPER\(DESCRIPCION\), :query\) > 0/);assert.doesNotMatch(sql,/\bLIKE\b/);assert.match(sql,/DESCRIPCION, COD_CONCEPTO/);
});
