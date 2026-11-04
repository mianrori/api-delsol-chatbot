import assert from 'node:assert/strict';
import {checkSearchCorrectionsHttp} from '../../scripts/check-search-corrections-http.mjs';
const original=Object.fromEntries(['log','error','warn'].map(k=>[k,console[k]]));
for(const k of Object.keys(original))console[k]=()=>{};
let checks=0;
try{
 await checkSearchCorrectionsHttp({sessionId:'synthetic-authorized',deniedSessionId:'synthetic-denied',ambiguousSearch:'Synthetic',uniqueSearch:'Synthetic exact',validateSession:async()=>({username:'SYNTHETIC'}),
  lookup:async(args,context)=>{if(context.sessionId==='synthetic-denied')throw Object.assign(Error('Synthetic denied'),{code:'ACCESS_DENIED',errorNum:942});return args.search==='Synthetic exact'?{status:'RESOLVED',category:{codRubro:'SYNTHETIC-EXACT'}}:{status:'AMBIGUOUS',options:[{optionId:'1',codRubro:'SYNTHETIC-A'},{optionId:'2',codRubro:'SYNTHETIC-B'}]};},
  check:(ok,code)=>{checks++;assert.ok(ok,code);}});
 assert.ok(checks>30);process.stdout.write('SEARCH_CORRECTIONS_HTTP_PASS');
}finally{for(const [k,v] of Object.entries(original))console[k]=v;}
