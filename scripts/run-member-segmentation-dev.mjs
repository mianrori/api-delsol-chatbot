import 'dotenv/config';
import {writeFile,readFile} from 'node:fs/promises';
import config from '../config.js';
import {segmentationControl} from './member-segmentation-control.mjs';
import {withOracleProxySession,getValidOracleSession} from '../src/services/sessions/oracleSession.service.js';
import {analyzeMembers} from '../src/services/members/memberAnalysis.service.js';

// All source values stay in memory. Reports contain only checks/coverage/codes.
const output=console.log.bind(console),logCodes=new Set();console.log=()=>{};
console.error=(...values)=>{for(const value of values)for(const m of String(value?.driverCode??value?.message??'').matchAll(/(?:ORA|NJS|DPI)-\d+/g))logCodes.add(m[0]);};
const report={suite:'member-segmentation-dev',scope:process.env.BOT_TEST_SEGMENT_REMAINING==='true'?'remaining':'full',timings:[],startedAt:new Date().toISOString(),checks:[],coverage:{},pending:[]};
const check=(ok,code)=>report.checks.push({code,passed:Boolean(ok)});
const near=(a,b)=>a===b||Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(.000001,Math.abs(b)*1e-9);
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
const moneyKey=c=>JSON.stringify([c?.description??null,String(c?.symbol??'').replace(/^(?:PYG|GUARANIES|GUARANÍES)$/i,'₲')]);
const currency=r=>({description:r.CURRENCY_DESCRIPTION??null,symbol:r.CURRENCY_SYMBOL??null});
const periods=[{dateFrom:'01/01/2023',dateTo:'31/01/2023'},{dateFrom:'01/02/2023',dateTo:'28/02/2023'}];

// Independent control: membership is selected with EXISTS/NOT EXISTS, then
// source purchases are aggregated. Neither production SQL nor the MV is reused.


try{
 if(config.env!=='development'||config.bedrockDebugPayloads||config.piiDebugShowRaw)throw Error('UNSAFE_CONFIGURATION');
 const sessionId=process.env.BOT_TEST_SESSION_ID?.trim();if(!sessionId)throw Error('HIDDEN_SESSION_REQUIRED');
 if(process.env.BOT_TEST_SEGMENT_BASELINE){
  const prior=JSON.parse(await readFile(process.env.BOT_TEST_SEGMENT_BASELINE,'utf8'));
  if(prior.validatedCommit!=='6b1303e8d7c8e76a5bad95571a84edfc16b90ddc'||prior.candidateMismatches!==0||prior.checks!==108||prior.passed!==108)throw Error('BASELINE_EVIDENCE_MISMATCH');
  report.reusedBaseline={validatedCommit:prior.validatedCommit,checks:prior.checks,passed:prior.passed,coverage:prior.coverage,notRerun:true,complete:false,terminalError:prior.terminalError};
 }
 if(process.env.BOT_TEST_DENIED_SESSION_ID?.trim()){
  report.phase='AUTHORIZED_SESSION_CHECK';const authorized=await getValidOracleSession(sessionId);
  report.phase='DENIED_SESSION_CHECK';const deniedSession=await getValidOracleSession(process.env.BOT_TEST_DENIED_SESSION_ID);check(authorized.username!==deniedSession.username,'DISTINCT_ORACLE_USERS');
  if(authorized.username!==deniedSession.username){let denied=false,closed=false;try{await withOracleProxySession(process.env.BOT_TEST_DENIED_SESSION_ID,async({connection,username})=>{const close=connection.close.bind(connection);connection.close=async()=>{await close();closed=true;};await analyzeMembers({resultMode:'members',purchasePeriods:periods,limit:1},connection,username);});}catch(e){denied=[942,1031].includes(Number(e.errorNum));}check(denied,'REAL_DENIAL_WITHOUT_DATA');check(closed,'DENIED_CONNECTION_CLOSED');}
 }else report.pending.push('REAL_DENIED_USER_NOT_CONFIGURED');
 let closed=false;
 await withOracleProxySession(sessionId,async({connection,username})=>{
  connection.callTimeout=60000;
  const close=connection.close.bind(connection);connection.close=async()=>{await close();closed=true;};
  const controlCache=new Map();
  const independent=async(input)=>{const {metrics,breakdownBy,limit,...filters}=input;const key=JSON.stringify({...filters,orderBy:filters.orderBy??'totalAmount',orderDirection:filters.orderDirection??'desc'});if(controlCache.has(key))return controlCache.get(key);const q=segmentationControl(input);const result=(await connection.execute(q.sql,q.binds,{maxRows:100001})).rows??[];if(result.length>100000)throw Error('INDEPENDENT_CONTROL_LIMIT_EXCEEDED');const control={rows:result,...q};controlCache.set(key,control);return control;};
  const compare=async(input,result,label)=>{
   const control=await independent(input),all=control.rows,expected=input.resultMode==='members'?all.slice(0,input.limit??20):all;
   const allIds=new Set(all.map(r=>String(r.DOCUMENT_NUMBER))),ids=new Set(expected.map(r=>String(r.DOCUMENT_NUMBER)));
   check(result.summary.totalMatches==null?input.resultMode==='members'&&result.summary.hasMore&&allIds.size>ids.size:result.summary.totalMatches===allIds.size,label+'_DISTINCT_UNIVERSE');
   check(result.summary.returnedCount===ids.size,label+'_DISTINCT_RETURNED');
   check(result.summary.purchaseCount===expected.reduce((n,r)=>n+Number(r.PURCHASE_COUNT),0),label+'_PURCHASE_COUNT');
   const totals=new Map();for(const r of expected){if(r.CURRENCY_DESCRIPTION==null&&r.CURRENCY_SYMBOL==null)continue;const k=moneyKey(currency(r));if(!totals.has(k))totals.set(k,{amount:0,count:0,ids:new Set()});const t=totals.get(k);t.amount+=Number(r.TOTAL_AMOUNT);t.count+=Number(r.PURCHASE_COUNT);t.ids.add(String(r.DOCUMENT_NUMBER));}
   const actual=new Map((result.summary.totalsByCurrency??[]).map(r=>[moneyKey(r.currency),r]));
   check(actual.size===totals.size&&[...totals].every(([k,t])=>actual.has(k)&&near(actual.get(k).totalAmount,t.amount)&&actual.get(k).purchaseCount===t.count&&actual.get(k).memberCount===t.ids.size),label+'_AMOUNTS_AND_COUNTS_BY_CURRENCY');
   const active=new Set(expected.filter(r=>r.PURCHASE_COUNT>0).map(r=>String(r.DOCUMENT_NUMBER)));
   check(result.summary.commerciallyActiveCount===active.size&&result.summary.commerciallyInactiveCount===ids.size-active.size,label+'_ACTIVITY_DISTINCT');
   if(input.resultMode==='members'){
    const a=(result.members??[]).map(r=>[r.documentNumber,moneyKey(r.currency),r.totalAmount,r.purchaseCount,r.recurrenceMonths]);const b=expected.map(r=>[String(r.DOCUMENT_NUMBER),moneyKey(currency(r)),Number(r.TOTAL_AMOUNT),Number(r.PURCHASE_COUNT),Number(r.RECURRENCE_MONTHS)]);
    check(canonical(a)===canonical(b),label+'_RANK_AND_IDENTITIES');
    check((result.members??[]).every(m=>{const r=expected.find(r=>String(r.DOCUMENT_NUMBER)===m.documentNumber&&moneyKey(currency(r))===moneyKey(m.currency));return r&&m.birthDate===r.BIRTH_DATE&&m.age===(r.AGE==null?null:Number(r.AGE))&&m.gender===({M:'Masculino',F:'Femenino'}[r.GENDER]??r.GENDER??null);}),label+'_DEMOGRAPHIC_VALUES');
   }
   for(const dim of input.breakdownBy??[]){
    const spec={category:['C.COD_RUBRO','C.RUBRO','categoryId'],customer:['C.COD_CLIENTE','C.LOCAL','customerId'],month:["TO_CHAR(C.FECHA_COMPRA,'YYYY-MM')","TO_CHAR(C.FECHA_COMPRA,'YYYY-MM')",'month'],year:["TO_CHAR(C.FECHA_COMPRA,'YYYY')","TO_CHAR(C.FECHA_COMPRA,'YYYY')",'year']}[dim];if(!spec)continue;
    const binds={...control.binds},chosen=input.resultMode==='members'?[...ids]:null;
    const chosenFilter=chosen?`AND C.COD_SOCIO IN (${chosen.map((id,i)=>{binds['chosen'+i]=id;return ':chosen'+i;}).join(',')||'NULL'})`:'';
    const sql=`${control.cte} SELECT ${spec[0]} DIMENSION_KEY,C.MONEDA CURRENCY_DESCRIPTION,C.SIMBOLO_MONEDA CURRENCY_SYMBOL,COUNT(DISTINCT C.COD_SOCIO) MEMBER_COUNT,SUM(C.IMPORTE) TOTAL_AMOUNT,COUNT(*) PURCHASE_COUNT FROM scoped C WHERE EXISTS(SELECT 1 FROM selected S WHERE S.DOCUMENT_NUMBER=C.COD_SOCIO) ${chosenFilter} GROUP BY ${spec[0]},C.MONEDA,C.SIMBOLO_MONEDA`;
    const source=(await connection.execute(sql,binds,{maxRows:100001})).rows??[];if(source.length>100000)throw Error('BREAKDOWN_CONTROL_LIMIT_EXCEEDED');
    const values=result.breakdown?.[dim]??[],expectedKeys=new Map(source.map(r=>[JSON.stringify([r.DIMENSION_KEY==null?null:String(r.DIMENSION_KEY),moneyKey(currency(r))]),r]));
    check(values.length===source.length&&values.every(r=>{const k=JSON.stringify([r[spec[2]]==null?null:String(r[spec[2]]),moneyKey(r.currency)]),v=expectedKeys.get(k);return v&&r.memberCount===Number(v.MEMBER_COUNT)&&r.purchaseCount===Number(v.PURCHASE_COUNT)&&near(r.totalAmount,Number(v.TOTAL_AMOUNT));}),label+'_BREAKDOWN_'+dim.toUpperCase());
    check(result.summary.totalMatches==null||result.summary.totalMatches===allIds.size,label+'_GROUP_COUNTS_NOT_SUMMED');
   }
   report.coverage.multipleCurrencies ||=totals.size>1;
   report.coverage.missingBirthDate ||=all.some(r=>r.BIRTH_DATE==null);
   report.coverage.missingGender ||=all.some(r=>r.GENDER==null);
   return result;
  };
  const run=async(input,label)=>{report.phase=label;const started=Date.now();try{return await compare(input,await analyzeMembers(input,connection,username),label);}catch(e){check(false,label+'_EXECUTION_'+(/^(?:ORA|NJS|DPI)-\d+$/.test(e.code??'')?e.code.replaceAll('-','_'):'FAILED'));throw e;}finally{report.timings.push({code:label,milliseconds:Date.now()-started});await writeFile(process.env.BOT_TEST_REPORT||'/tmp/member-segmentation-dev.json',JSON.stringify(report,null,2),{mode:0o600});}};
  const summary={resultMode:'summary',metrics:['totalAmount','purchaseCount'],purchasePeriods:[periods[0]]};
  const remaining=process.env.BOT_TEST_SEGMENT_REMAINING==='true';
  if(!remaining){await run(summary,'MONTHLY_MV');
  for(const dim of ['category','customer','month','year'])await run({...summary,breakdownBy:[dim]},'GROUPED_'+dim.toUpperCase());}
  const fixture=(await connection.execute(`SELECT C.COD_CLIENTE,C.COD_RUBRO,S.GENERO,EXTRACT(MONTH FROM S.FECHA_NACIMIENTO) BIRTH_MONTH,TRUNC(MONTHS_BETWEEN(TRUNC(SYSDATE),S.FECHA_NACIMIENTO)/12) AGE FROM VW_BOT_COMPRAS_SOCIO C JOIN VW_BOT_SOCIOS S ON S.COD_SOCIO=C.COD_SOCIO WHERE C.FECHA_COMPRA>=DATE '2023-01-01' AND C.FECHA_COMPRA<DATE '2023-02-01' AND C.COD_CLIENTE IS NOT NULL AND C.COD_RUBRO IS NOT NULL AND S.GENERO IN ('M','F') AND S.FECHA_NACIMIENTO IS NOT NULL AND S.FECHA_NACIMIENTO<=SYSDATE FETCH FIRST 1 ROWS ONLY`)).rows?.[0];
  if(!fixture)throw Error('COMBINED_FILTER_FIXTURE_REQUIRED');
  const combined={...summary,customerIds:[String(fixture.COD_CLIENTE)],categoryIds:[String(fixture.COD_RUBRO)],gender:fixture.GENERO==='M'?'male':'female',birthMonth:Number(fixture.BIRTH_MONTH),ageMin:Number(fixture.AGE),ageMax:Number(fixture.AGE)};
  await run(combined,'COMBINED_DEMOGRAPHIC_AND_PURCHASE_FILTERS');
  await run({...combined,amountMin:0,amountMax:100000000000000,recurrenceMin:1,recurrenceMax:5},'COMBINED_AMOUNT_AND_RECURRENCE_FILTERS');
  await run({...combined,customerIds:['-999999999']},'EMPTY_COMBINED_FILTER');
  const rank={...combined,resultMode:'members',limit:5,orderBy:'totalAmount',orderDirection:'desc',metrics:['totalAmount','purchaseCount','recurrenceMonths']};
  for(const metric of ['totalAmount','purchaseCount','recurrenceMonths'])await run({...rank,orderBy:metric},'FILTERED_RANK_'+metric.toUpperCase());
  if(!remaining){for(const direction of ['asc','desc'])await run({resultMode:'members',purchasePeriods:[periods[0]],metrics:rank.metrics,limit:5,orderBy:'totalAmount',orderDirection:direction},'MV_RANK_'+direction.toUpperCase());
  for(const match of ['all','any'])await run({...summary,purchasePeriods:periods,purchasePeriodMatch:match},'TWO_PERIODS_'+match.toUpperCase());
  await run({...rank,referenceDate:'31/05/2023',purchasePeriods:[],activityMonths:1,activityStatus:'inactive'},'INACTIVE_WITH_MISSING_PURCHASES');
  await run({...rank,gender:undefined,birthMonth:undefined,ageMin:undefined,ageMax:undefined},'RANK_WITHOUT_DEMOGRAPHIC_FILTERS');}
  else{for(const match of ['all','any'])await run({...combined,purchasePeriods:periods,purchasePeriodMatch:match},'BOUNDED_TWO_PERIODS_'+match.toUpperCase());const {checkSegmentationCases}=await import('./check-member-segmentation-cases.mjs');report.phase='ORACLE_CTE_NEW_CASES';const started=Date.now();try{await checkSegmentationCases(connection,check);}finally{report.timings.push({code:'ORACLE_CTE_NEW_CASES',milliseconds:Date.now()-started});}report.coverage.controlledOracleCases=true;}
  if(process.env.BOT_TEST_SEGMENT_HTTP==='true'){
   const {router}=await import('../src/routes/index.js'),{getConversation,setConversation,clearConversation}=await import('../src/state/conversation.store.js'),{protectPiiDeep,restorePiiDeep}=await import('../src/services/ai/pii.service.js'),{default:express}=await import('express');
   const app=express();app.use(express.json());app.use('/chatbot/api',router);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
   try{
    const seed=await analyzeMembers(rank,connection,username);setConversation(sessionId,[{role:'user',content:[{text:'Ranking de socios con los filtros seleccionados'}]},{role:'assistant',content:[{toolUse:{name:'analyze_members',toolUseId:'segmentation-seed',input:protectPiiDeep(sessionId,rank)}}]},{role:'user',content:[{toolResult:{toolUseId:'segmentation-seed',status:'success',content:[{json:protectPiiDeep(sessionId,seed,null,['analyze_members'])}]}}]},{role:'assistant',content:[{text:'Ranking consultado.'}]}]);
    for(const [message,dimension] of [['Ahora por rubro','category'],['Ahora por local','customer']]){
     report.phase='HTTP_'+dimension.toUpperCase();const response=await fetch(`http://127.0.0.1:${server.address().port}/chatbot/api/bot/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message}),signal:AbortSignal.timeout(90000)}),body=await response.json();check(response.status===200&&body.success===true,'HTTP_'+dimension.toUpperCase()+'_SUCCESS');
     const history=getConversation(sessionId);let start=-1;for(let i=history.length-1;i>=0;i--)if(history[i].role==='user'&&history[i].content?.some(b=>typeof b.text==='string')){start=i;break;}
     const blocks=history.slice(start+1).flatMap(m=>m.content??[]),calls=blocks.map(b=>b.toolUse).filter(b=>b?.name==='analyze_members');check(calls.length===1,'HTTP_'+dimension.toUpperCase()+'_ONE_FRESH_QUERY');
     if(calls.length===1){const actual=restorePiiDeep(sessionId,calls[0].input),expected={...rank,breakdownBy:[dimension]};check(canonical(actual)===canonical(expected),'HTTP_'+dimension.toUpperCase()+'_CONTEXT_PRESERVED');const result=blocks.map(b=>b.toolResult).find(b=>b?.toolUseId===calls[0].toolUseId);check(result?.status==='success','HTTP_'+dimension.toUpperCase()+'_TOOL_SUCCESS');if(result?.status==='success')await compare(expected,restorePiiDeep(sessionId,result.content.find(b=>b.json)?.json),'HTTP_'+dimension.toUpperCase());}
    }
   }finally{clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
  }
 });check(closed,'CONTROL_CONNECTION_CLOSED');
 if(!report.coverage.multipleCurrencies)report.pending.push('SEGMENTATION_MIXED_CURRENCY_DEV_FIXTURE_NOT_FOUND');
 for(const [field,code] of [['missingBirthDate','MISSING_BIRTH_DATE_DEV_FIXTURE_NOT_FOUND'],['missingGender','MISSING_GENDER_DEV_FIXTURE_NOT_FOUND']])if(!report.coverage[field]&&!report.reusedBaseline?.coverage[field])report.pending.push(code);
 report.success=report.checks.every(c=>c.passed);
}catch(e){report.success=false;report.error=/^[A-Z_]+$/.test(e.code??'')?e.code:/^[A-Z_]+$/.test(e.message??'')?e.message:'SEGMENTATION_DEV_CHECK_FAILED';}
report.logCodes=[...logCodes];report.finishedAt=new Date().toISOString();await writeFile(process.env.BOT_TEST_REPORT||'/tmp/member-segmentation-dev.json',JSON.stringify(report,null,2),{mode:0o600});output(JSON.stringify(report));process.exit(report.success?0:1);
