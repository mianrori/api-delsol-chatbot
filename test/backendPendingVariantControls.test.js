import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeBounds,multisetEqual,validPage,near,safeTechnicalCode} from '../scripts/backend-pending-variant-controls.mjs';
test('relative boundaries use Paraguay, Monday and year rollover',()=>{
 const now=new Date('2024-01-01T02:00:00Z');
 assert.deepEqual(relativeBounds('today',now),{dateFrom:'31/12/2023',dateTo:'31/12/2023'});
 assert.deepEqual(relativeBounds('thisWeek',now),{dateFrom:'25/12/2023',dateTo:'31/12/2023'});
 assert.deepEqual(relativeBounds('thisYear',now),{dateFrom:'01/01/2023',dateTo:'31/12/2023'});
 assert.deepEqual(relativeBounds('thisMonth',now),{dateFrom:'01/12/2023',dateTo:'31/12/2023'});
 assert.deepEqual(relativeBounds('yesterday',now),{dateFrom:'30/12/2023',dateTo:'30/12/2023'});
 assert.throws(()=>relativeBounds('invalid'));
});
test('multisets preserve duplicate multiplicity and currencies',()=>{
 assert.equal(multisetEqual([[1,'PYG'],[1,'USD']],[[1,'USD'],[1,'PYG']]),true);
 assert.equal(multisetEqual([[1],[1],[2]],[[1],[2],[2]]),false);
 assert.equal(multisetEqual([[1,'USD']],[[1,'$']]),false);
});
test('pagination derives exact terminal page, counts and nextPage',()=>{
 const p={page:3,rows:2,totalRows:5,totalInvoices:2,totalPages:3,returnedRows:1,data:[{}],hasMore:false,nextPage:null};
 assert.equal(validPage(p,3,2,5,2),true);
 for(const override of [{hasMore:true},{nextPage:4},{totalInvoices:5},{data:[]},{totalRows:6}])assert.equal(validPage({...p,...override},3,2,5,2),false);
 assert.equal(validPage({...p,page:4,returnedRows:0,data:[]},4,2,5,2),true);
});
test('technical errors never fall back to message or raw code',()=>{
 assert.equal(safeTechnicalCode({code:'ORA-01031',message:'secret'}),'ORA-01031');
 assert.equal(safeTechnicalCode({code:'secret',message:'secret',sessionId:'secret'}),'PENDING_VARIANT_CONTROL_FAILED');
 assert.equal(near(null,0),false);assert.equal(near(1,1.00000001),true);
});
