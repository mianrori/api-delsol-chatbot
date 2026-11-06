import test from 'node:test';
import assert from 'node:assert/strict';
import {promotionApproximateControl,promotionControlKey} from '../scripts/search-promotion-independent-control.mjs';
test('independent promotion control preserves distinct tied options and collapses identical projected rows',()=>{
 const a={COD_PROMOCION:'SYNTHETIC-P',COD_CAMPANIA:1,NOMBRE_PROMOCION:'Navidad Alpha',NOMBRE_CAMPANIA:'Synthetic',FECHA_DESDE:'01/12/2023',FECHA_HASTA:'31/12/2023'};
 const b={...a,NOMBRE_PROMOCION:'Navidad Beta'},c={...a,FECHA_HASTA:'30/12/2023'};
 const first=promotionApproximateControl([a,b,c,a],70),reverse=promotionApproximateControl([a,c,b,a],70);
 assert.ok(first);assert.equal(first.expected.length,3);assert.equal(first.search,reverse.search);
 assert.deepEqual(first.expected.map(promotionControlKey),reverse.expected.map(promotionControlKey));
 assert.deepEqual(first.expected.map(promotionControlKey),[a,b,c].map(promotionControlKey).sort());
});
