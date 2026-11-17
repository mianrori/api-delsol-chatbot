import assert from 'node:assert/strict';
import {checkSearchCorrectionsHttp} from '../../scripts/check-search-corrections-http.mjs';
const original=Object.fromEntries(['log','error','warn'].map(k=>[k,console[k]]));for(const key of Object.keys(original))console[key]=()=>{};
let checks=0;const failures=[];
try{
 const profile={customers:[{search:'Synthetic C1',id:'VALID-C1'},{search:'Synthetic C2',id:'VALID-C2'}],categories:[{search:'Synthetic R1',id:'VALID-R1'},{search:'Synthetic R2',id:'VALID-R2'}],ambiguousCustomerSearch:'Many customers',ambiguousCategorySearch:'Many categories'};
 await checkSearchCorrectionsHttp({sessionId:'synthetic-authorized',deniedSessionId:'synthetic-denied',compositionProfile:profile,transitionProfile:true,validateSession:async()=>({username:'SYNTHETIC'}),lookup:async(args,context,name)=>{
  if(context.sessionId==='synthetic-denied')throw Object.assign(Error('Synthetic denied'),{code:'ACCESS_DENIED',errorNum:942});
  const customer=name==='search_customers',entries=customer?profile.customers:profile.categories,found=entries.find(r=>r.search===args.search);
  return found?customer?{status:'RESOLVED',customer:{codCliente:found.id}}:{status:'RESOLVED',category:{codRubro:found.id}}:{status:'AMBIGUOUS',options:entries.map((r,i)=>({optionId:String(i+1),[customer?'codCliente':'codRubro']:r.id}))};
 },check:(ok,code)=>{checks++;if(!ok)failures.push(code);assert.ok(ok,code);}});
 assert.deepEqual(failures,[],'Consumer assertions caught by the chat must still fail the fixture');
 assert.ok(checks>50);process.stdout.write('SEARCH_STATE_TRANSITIONS_HTTP_PASS');
}finally{for(const [k,v] of Object.entries(original))console[k]=v;}
