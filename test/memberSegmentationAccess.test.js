import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSegmentationDeniedSession} from '../scripts/member-segmentation-access.mjs';
const authorized={username:'SYNTHETIC_AUTHORIZED'};

test('missing optional denial session stays pending without looking up a user',async()=>{
 const result=await resolveSegmentationDeniedSession({authorized,getSession:()=>assert.fail('Unexpected lookup')});
 assert.deepEqual(result,{status:'pending',code:'REAL_DENIED_USER_NOT_CONFIGURED'});
});
test('invalid optional denial sessions remain pending and expose only safe technical codes',async()=>{
 for(const code of ['ORACLE_SESSION_NOT_FOUND','ORACLE_SESSION_NOT_ACTIVE','ORACLE_SESSION_EXPIRED']){
  const result=await resolveSegmentationDeniedSession({authorized,deniedSessionId:'SYNTHETIC_SECRET',getSession:async()=>{throw Object.assign(Error('SYNTHETIC_PRIVATE_MESSAGE'),{code});}});
  assert.equal(result.status,'pending');assert.match(result.code,/^REAL_DENIED_SESSION_/);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC'));
 }
});
test('only distinct resolved Oracle users enable the actual denial query',async()=>{
 const same=await resolveSegmentationDeniedSession({authorized,deniedSessionId:'SYNTHETIC',getSession:async()=>authorized});
 assert.deepEqual(same,{status:'pending',code:'REAL_DENIED_DISTINCT_USER_NOT_PROVIDED'});
 const other=await resolveSegmentationDeniedSession({authorized,deniedSessionId:'SYNTHETIC',getSession:async()=>({username:'SYNTHETIC_OTHER'})});
 assert.deepEqual(other,{status:'ready'});
});
test('unexpected infrastructure errors propagate instead of being treated as a missing test sample',async()=>{
 const error=Error('SYNTHETIC_DATABASE_FAILURE');
 await assert.rejects(resolveSegmentationDeniedSession({authorized,deniedSessionId:'SYNTHETIC',getSession:async()=>{throw error;}}),e=>e===error);
});
