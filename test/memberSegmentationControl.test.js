import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentationControl} from '../scripts/member-segmentation-control.mjs';

test('independent segmentation control binds combined filters and selects period membership across currencies',()=>{
 const periods=[{dateFrom:'01/01/2023',dateTo:'31/01/2023'},{dateFrom:'01/02/2023',dateTo:'28/02/2023'}];
 const input={purchasePeriods:periods,purchasePeriodMatch:'all',customerIds:["SYNTHETIC'LOCAL"],categoryIds:['R'],gender:'female',birthMonth:3,ageMin:30,ageMax:40,amountMin:0,amountMax:10,recurrenceMin:1,recurrenceMax:2};
 const q=segmentationControl(input);
 assert.equal(q.binds.customerIds0,"SYNTHETIC'LOCAL");assert.equal(q.binds.sex,'F');assert.equal(q.binds.ageMin,30);
 assert.ok(!q.sql.includes("SYNTHETIC'LOCAL"));assert.ok(!q.sql.includes('MV_BOT'));
 assert.match(q.cte,/EXISTS\(SELECT 1 FROM scoped C[^]*AND EXISTS\(SELECT 1 FROM scoped C/);
 assert.match(q.cte,/SELECT DISTINCT S.COD_SOCIO/);
 assert.match(q.cte,/COUNT\(DISTINCT TO_CHAR\(C.FECHA_COMPRA/);
 assert.match(q.cte,/TOTAL_AMOUNT>=:amountMin AND TOTAL_AMOUNT<=:amountMax/);
 assert.doesNotMatch(q.cte,/HAVING/,'period membership is independent of currency aggregation');
 assert.match(segmentationControl({...input,purchasePeriodMatch:'any'}).cte,/OR EXISTS\(SELECT 1 FROM scoped C/);
 const used=new Set([...q.sql.matchAll(/:([A-Za-z]\w*)/g)].map(m=>m[1]));assert.deepEqual([...used].sort(),Object.keys(q.binds).sort());
});

test('independent inactive control uses the bounded reference window and preserves null demographics',()=>{
 const q=segmentationControl({referenceDate:'31/05/2023',activityMonths:5,activityStatus:'inactive',orderBy:'purchaseCount',orderDirection:'asc'});
 assert.equal(q.binds.reference,'31/05/2023');assert.equal(q.binds.offset,-4);
 assert.match(q.cte,/NOT EXISTS\(SELECT 1 FROM scoped/);assert.match(q.cte,/LEFT JOIN scoped/);
 assert.doesNotMatch(q.cte,/S.FECHA_NACIMIENTO IS NOT NULL|NVL\(S.GENERO/);
 assert.match(q.sql,/ORDER BY PURCHASE_COUNT ASC,FULL_NAME ASC,DOCUMENT_NUMBER ASC/);
});
