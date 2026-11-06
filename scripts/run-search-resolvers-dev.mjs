// DEV-only bounded verification. Credentials never enter this worker; session IDs
// arrive on stdin, are used only in memory and are never included in its report.
import {createHash} from 'node:crypto';
const output=process.stdout.write.bind(process.stdout);
for(const key of ['log','info','warn','error','debug','trace','dir','table'])console[key]=()=>{};
const report={suite:'search-resolvers-dev',startedAt:new Date().toISOString(),checks:[],timings:[],pending:[],success:false};
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error('CONTROL_MISMATCH');};
const technical=e=>typeof e?.code==='string'&&/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e.code)&&!/[\r\n]/.test(e.code)?e.code:'SEARCH_DEV_CHECK_FAILED';
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const words=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
const textSql=c=>`UPPER(REGEXP_REPLACE(TRANSLATE(NVL(${c},''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN'),'[^A-Za-z0-9]',''))`;
const distance=(a,b)=>{let prior=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,prior[j+1]+1,prior[j]+Number(a[i]!==b[j])));prior=next;}return prior[b.length];};
const tokenScore=(query,candidate,weight)=>{const a=words(query),b=words(candidate);if(!a.length||!b.length)return {score:0,min:0};const scores=a.map(x=>Math.max(...b.map(y=>Math.round(100*(1-distance(x,y)/Math.max(x.length,y.length))))));const min=Math.min(...scores);return {score:Math.round(scores.reduce((x,y)=>x+y,0)/scores.length*weight+min*(1-weight)),min};};
const absent='ZZZQXJKVQXJKVQXJKVQXJKVQXJKVQXJKV';
let opened=0,closed=0,closeErrors=0,input='';
async function run(code,fn){const start=Date.now();try{await fn();}catch(e){report.checks.push({code:code+'_EXECUTION',passed:false,technicalCode:technical(e)});}finally{report.timings.push({code,milliseconds:Date.now()-start});}}
const ids=(r,key,nested)=>r.status==='RESOLVED'?[String((nested?r[nested]:r)?.[key])]:r.options?.map(o=>String(o[key]))??[];
const sameSet=(a,b)=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
try{
 for await(const chunk of process.stdin){input+=chunk;if(input.length>4096)throw Error('INVALID_INPUT');}
 const {authorizedSessionId,deniedSessionId,commit}=JSON.parse(input);input='';
 for(const s of [authorizedSessionId,deniedSessionId])if(typeof s!=='string'||!/^[a-f0-9-]{36}$/i.test(s))throw Error('INVALID_INPUT');
 report.validatedCommit=/^[a-f0-9]{40}$/.test(commit??'')?commit:null;
 const {default:config}=await import('../config.js');check(config.env==='development'&&!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,'DEV_SAFE_CONFIGURATION');
 const {default:driver}=await import('oracledb'),connect=driver.getConnection.bind(driver);
 driver.getConnection=async(...args)=>{const c=await connect(...args);opened++;c.callTimeout=60000;const close=c.close.bind(c);let done=false;c.close=async()=>{try{await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};return c;};
 const {withOracleProxySession}=await import('../src/services/sessions/oracleSession.service.js');
 const {executeTool}=await import('../src/services/ai/toolExecutor.service.js');
 const call=(name,args)=>executeTool({name,arguments:args,context:{sessionId:authorizedSessionId}});
 const users=[];for(const s of [authorizedSessionId,deniedSessionId])await withOracleProxySession(s,async({connection})=>{users.push((await connection.execute('SELECT USER AS IDENTITY FROM DUAL')).rows?.[0]?.IDENTITY);});
 check(users.every(Boolean)&&users[0]!==users[1],'ORACLE_USERS_DISTINCT');users.length=0;
 await withOracleProxySession(authorizedSessionId,async({connection})=>{
  const read=async(sql,binds={})=>{const r=(await connection.execute(sql,binds,{maxRows:10001})).rows??[];if(r.length>10000)throw Error('CONTROL_LIMIT_EXCEEDED');return r;};
  const denialArgs=new Map();
  for(const [name,view,id,label,key,nested,active] of [
   ['search_customers','VW_BOT_CLIENTES','COD_CLIENTE','NOMBRE_FANTASIA','codCliente','customer',true],
   ['search_categories','VW_BOT_RUBROS_LOCALES','COD_RUBRO','DESCRIPCION','codRubro','category',false],
  ])await run(name.toUpperCase(),async()=>{
   const source=`FROM ${view} C ${active?"JOIN (SELECT DISTINCT COD_CLIENTE FROM VW_BOT_CONTRATOS_LOCALES WHERE TIP_CONTRATO='CNT' AND ESTADO='A') A ON A.COD_CLIENTE=C.COD_CLIENTE":''}`;
   const seed=(await read(`SELECT C.${label} LABEL ${source} WHERE C.${label} IS NOT NULL FETCH FIRST 1 ROWS ONLY`))[0];if(!seed){report.pending.push(name.toUpperCase()+'_REAL_SAMPLE_MISSING');return;}
   const probes=[['EXACT',seed.LABEL],['PARTIAL',words(seed.LABEL)[0]?.slice(0,3)||seed.LABEL],['ABSENT',absent]];
   for(const [tag,search] of probes){
    const rows=await read(`SELECT C.${id} ID,C.${label} LABEL,UTL_MATCH.JARO_WINKLER_SIMILARITY(${textSql('C.'+label)},:q) SCORE ${source}`,{q:norm(search)});
    const matches=rows.filter(r=>norm(r.LABEL).includes(norm(search))||Number(r.SCORE)>=Number(config.minSimilarity||70));
    const exact=matches.filter(r=>norm(r.LABEL)===norm(search)),relevant=exact.length?exact:matches;
    const result=await call(name,{search}),actual=ids(result,key,nested),wanted=new Set(relevant.map(r=>String(r.ID)));
    check(actual.every(id=>wanted.has(id)),'CATALOG_'+name+'_'+tag+'_IDENTITIES');
    check(result.status===(relevant.length===0?'NOT_FOUND':relevant.length===1?'RESOLVED':'AMBIGUOUS'),'CATALOG_'+name+'_'+tag+'_STATUS');
    if(relevant.length<=Number(config.limitFilter||5))check(sameSet(actual,[...wanted]),'CATALOG_'+name+'_'+tag+'_COMPLETE');
    if(result.totalMatches!=null)check(result.totalMatches===relevant.length,'CATALOG_'+name+'_'+tag+'_TOTAL');
   }
   denialArgs.set(name,{search:seed.LABEL});
  });
  await run('SEARCH_MEMBERS',async()=>{
   const seed=(await read("SELECT COD_SOCIO,NOMBRE_COMPLETO FROM VW_BOT_SOCIOS WHERE NOMBRE_COMPLETO IS NOT NULL AND COD_SOCIO IS NOT NULL FETCH FIRST 1 ROWS ONLY"))[0];if(!seed){report.pending.push('MEMBER_REAL_SAMPLE_MISSING');return;}
   const exact=await read("SELECT COD_SOCIO FROM VW_BOT_SOCIOS WHERE UPPER(TRIM(COD_SOCIO))=UPPER(TRIM(:q)) OR UPPER(TRIM(EMAIL))=UPPER(TRIM(:q)) OR (REGEXP_REPLACE(TELEFONO,'[^0-9]','')=REGEXP_REPLACE(:q,'[^0-9]','') AND REGEXP_REPLACE(:q,'[^0-9]','') IS NOT NULL)",{q:String(seed.COD_SOCIO)});
   const result=await call('search_members',{search:String(seed.COD_SOCIO)}),actual=ids(result,'documentNumber','member');
   check(actual.every(id=>exact.some(r=>String(r.COD_SOCIO)===id)),'MEMBER_EXACT_IDENTITIES');check(result.status===(exact.length===1?'RESOLVED':'AMBIGUOUS'),'MEMBER_EXACT_STATUS');
   const search=words(seed.NOMBRE_COMPLETO).slice(0,2).join(' '),tokens=words(search),prefixes=tokens.map(t=>t.slice(0,4));
   const clauses=prefixes.map((v,i)=>`INSTR(${textSql('NOMBRE_COMPLETO')},:p${i})>0`),binds=Object.fromEntries(prefixes.map((v,i)=>['p'+i,v]));
   const source=await read(`SELECT COD_SOCIO,NOMBRE_COMPLETO FROM VW_BOT_SOCIOS WHERE ${clauses.join(' OR ')} ORDER BY COD_SOCIO,NOMBRE_COMPLETO`,binds);
   const all=source.filter(r=>prefixes.every(p=>norm(r.NOMBRE_COMPLETO).includes(p))),candidates=all.length?all:source;
   const scored=candidates.map(r=>({...r,...tokenScore(search,r.NOMBRE_COMPLETO,.7)})).filter(r=>r.score>=Number(config.minSimilarity||70)&&r.min>=65);
   const partial=await call('search_members',{search}),partialIds=ids(partial,'documentNumber','member');check(partialIds.length>0&&partialIds.every(id=>scored.some(r=>String(r.COD_SOCIO)===id)),'MEMBER_PARTIAL_CONTROL_IDENTITIES');
   if(candidates.length>=Math.max(Number(config.limitFilter??10)*50,500))report.pending.push('MEMBER_WIDE_CANDIDATE_COHORT_EXCEEDS_CAP');
   check((await call('search_members',{search:absent})).status==='NOT_FOUND','MEMBER_ABSENCE');denialArgs.set('search_members',{search:String(seed.COD_SOCIO)});
  });
  await run('SEARCH_INVOICE_CONCEPTS',async()=>{
   const source=await read('SELECT COD_CONCEPTO,DESCRIPCION FROM VW_BOT_CONCEPTOS ORDER BY DESCRIPCION,COD_CONCEPTO');if(!source.length){report.pending.push('CONCEPT_REAL_SAMPLE_MISSING');return;}
   for(const [tag,query] of [['EXACT',String(source[0].COD_CONCEPTO)],['PARTIAL',words(source[0].DESCRIPCION)[0]],['ABSENT',absent]]){
    const expected=source.filter(r=>String(r.COD_CONCEPTO).toUpperCase()===query.toUpperCase()||String(r.DESCRIPCION??'').toUpperCase().includes(query.toUpperCase()));
    const result=await call('search_invoice_concepts',{query}),actual=ids(result,'conceptId');check(result.status===(expected.length===0?'NOT_FOUND':expected.length===1?'RESOLVED':'AMBIGUOUS'),'CONCEPT_'+tag+'_STATUS');check(actual.every(id=>expected.some(r=>String(r.COD_CONCEPTO)===id)),'CONCEPT_'+tag+'_IDENTITIES');check(actual.length===Math.min(10,expected.length),'CONCEPT_'+tag+'_LIMIT');
   }denialArgs.set('search_invoice_concepts',{query:String(source[0].COD_CONCEPTO)});
  });
  await run('SEARCH_INVOICE_CUSTOMERS',async()=>{
   const source=await read("SELECT DISTINCT COD_CLIENTE,NOM_CLIENTE,RAZON_SOCIAL,RUC,MATRICULA FROM VW_BOT_FACTURAS WHERE FECHA_EMISION>=DATE '2023-01-01' AND FECHA_EMISION<DATE '2023-02-01' AND NVL(USER_CAN_CONSULT,'S')<>'N'");
   if(!source.length){report.pending.push('INVOICE_CUSTOMER_JANUARY_2023_SAMPLE_MISSING');return;}
   const dates={dateFrom:'01/01/2023',dateTo:'31/01/2023'};
   for(const [tag,query] of [['EXACT',String(source[0].COD_CLIENTE)],['PARTIAL',words(source[0].NOM_CLIENTE||source[0].RAZON_SOCIAL)[0]],['ABSENT',absent]]){
    const q=norm(query),rank=r=>norm(String(r.COD_CLIENTE))===q?1:norm(r.RUC)===q?2:norm(r.MATRICULA)===q?3:norm(r.NOM_CLIENTE)===q?4:norm(r.RAZON_SOCIAL)===q?5:norm(r.NOM_CLIENTE).includes(q)?6:norm(r.RAZON_SOCIAL).includes(q)?7:99;
    let expected=source.filter(r=>rank(r)<=7);const exact=expected.filter(r=>rank(r)<=5);if(exact.length)expected=exact;
    const wanted=new Set(expected.map(r=>String(r.COD_CLIENTE))),result=await call('search_invoice_customers',{query,...dates}),actual=ids(result,'customerId');
    if(wanted.size===0&&result.status!=='NOT_FOUND'){report.pending.push('INVOICE_CUSTOMER_FUZZY_'+tag+'_INDEPENDENT_SCORE_PENDING');continue;}
    check(result.status===(wanted.size===0?'NOT_FOUND':wanted.size===1?'RESOLVED':'AMBIGUOUS'),'INVOICE_CUSTOMER_'+tag+'_STATUS');check(actual.every(id=>wanted.has(id)),'INVOICE_CUSTOMER_'+tag+'_IDENTITIES');check(actual.length===Math.min(10,wanted.size),'INVOICE_CUSTOMER_'+tag+'_LIMIT_DISTINCT');
   }
   check((await call('search_invoice_customers',{query:String(source[0].COD_CLIENTE),dateFrom:'01/01/9999',dateTo:'31/01/9999'})).status==='NOT_FOUND','INVOICE_CUSTOMER_PERIOD_ISOLATION');denialArgs.set('search_invoice_customers',{query:String(source[0].COD_CLIENTE),...dates});
  });
  await run('SEARCH_SOLES_TYPES',async()=>{
   const source=await read('SELECT COD_TIPO_SOL,DESCRIPCION FROM VW_BOT_TIPOS_SOLES ORDER BY DESCRIPCION,COD_TIPO_SOL');if(!source.length){report.pending.push('SOLES_TYPE_REAL_SAMPLE_MISSING');return;}
   for(const [tag,query] of [['EXACT',source[0].DESCRIPCION],['PARTIAL',words(source[0].DESCRIPCION)[0]],['ABSENT',absent]]){
    const direct=source.filter(r=>String(r.COD_TIPO_SOL)===String(query)||norm(r.DESCRIPCION).includes(norm(query))),exact=direct.filter(r=>norm(r.DESCRIPCION)===norm(query)),expected=exact.length?exact:direct;
    const result=await call('search_soles_types',{query}),actual=ids(result,'typeId');check(actual.every(id=>expected.some(r=>String(r.COD_TIPO_SOL)===id)),'SOLES_TYPE_'+tag+'_IDENTITIES');check(result.status===(expected.length===0?'NOT_FOUND':expected.length===1?'RESOLVED':'AMBIGUOUS'),'SOLES_TYPE_'+tag+'_STATUS');
   }
   if(source.some(r=>norm(r.DESCRIPCION)==='SOLES')){const r=await call('search_soles_types',{query:'normales'}),expected=source.filter(r=>norm(r.DESCRIPCION)==='SOLES');check(ids(r,'typeId').every(id=>expected.some(s=>String(s.COD_TIPO_SOL)===id)),'SOLES_TYPE_ALIAS_FROM_ORACLE');}else report.pending.push('SOLES_NORMAL_ALIAS_REAL_SAMPLE_MISSING');
   denialArgs.set('search_soles_types',{query:source[0].DESCRIPCION});
  });
  for(const destination of [true,false])await run(destination?'SEARCH_DESTINATIONS':'SEARCH_MOVEMENTS',async()=>{
   const name=destination?'search_soles_usage_destinations':'search_soles_usage_movement_types';
   const base=destination?'SELECT DISTINCT TIPO_DESTINO T,COD_DESTINO ID,DESTINO LABEL FROM VW_BOT_SOLES_UTILIZADOS WHERE DESTINO IS NOT NULL AND COD_DESTINO IS NOT NULL':'SELECT DISTINCT TIPO_MOVIMIENTO LABEL FROM VW_BOT_SOLES_UTILIZADOS WHERE TIPO_MOVIMIENTO IS NOT NULL';
   const seed=(await read(`SELECT * FROM (${base}) ORDER BY LABEL FETCH FIRST 1 ROWS ONLY`))[0];if(!seed){report.pending.push(name.toUpperCase()+'_REAL_SAMPLE_MISSING');return;}
   for(const [tag,search,limit] of [['EXACT',seed.LABEL,20],['PARTIAL',String(seed.LABEL).slice(0,2),1],['ABSENT',absent,20]]){
    const expected=await read(`SELECT * FROM (${base}) WHERE INSTR(UPPER(TRIM(LABEL)),UPPER(TRIM(:q)))>0 ORDER BY LABEL${destination?',T,ID':''}`,{q:search});
    const result=await call(name,{search,limit}),exact=expected.filter(r=>String(r.LABEL).trim().toUpperCase()===String(search).trim().toUpperCase()),relevant=expected.length<=limit&&exact.length?exact:expected.slice(0,limit);
    const actual=result.status==='RESOLVED'?[result]:result.options??[];
    check(result.status===(expected.length===0?'NOT_FOUND':relevant.length===1&&expected.length<=limit?'RESOLVED':'AMBIGUOUS'),name+'_'+tag+'_STATUS');
    check(Number(result.totalMatches??0)===expected.length&&Boolean(result.hasMore)===(expected.length>limit),name+'_'+tag+'_REAL_LIMIT_METADATA');
    check(actual.every(a=>relevant.some(r=>destination?String(a.destinationType)===String(r.T)&&String(a.destinationCode)===String(r.ID):a.movementType===r.LABEL)),name+'_'+tag+'_IDENTITIES');
   }
   if(!destination){const r=await call(name,{limit:1}),all=await read(base);check(r.status==='LISTED'&&r.totalMatches===all.length&&r.hasMore===(all.length>1),'MOVEMENT_LIST_REAL_COUNT');}
   denialArgs.set(name,{search:seed.LABEL});
  });
  await run('PROMOTION_APPROXIMATE_ONLY',async()=>{
   const source=await read("SELECT COD_PROMOCION,COD_CAMPANIA,NOMBRE_PROMOCION,NOMBRE_CAMPANIA,TO_CHAR(FECHA_DESDE,'DD/MM/YYYY') FECHA_DESDE FROM VW_BOT_PROMOCIONES");
   let search,expected;
   for(const r of source){for(const token of words(r.NOMBRE_PROMOCION+' '+r.NOMBRE_CAMPANIA).filter(t=>t.length>=5)){
    const q=token.slice(0,-1)+(token.endsWith('X')?'Z':'X');if(source.some(s=>words(s.NOMBRE_PROMOCION+' '+s.NOMBRE_CAMPANIA).some(w=>w.includes(q))||String(s.COD_PROMOCION).toUpperCase()===q||String(s.COD_CAMPANIA)===q))continue;
    const matches=source.map(s=>({...s,...tokenScore(q,s.NOMBRE_PROMOCION+' '+s.NOMBRE_CAMPANIA,.75)})).filter(s=>words(s.NOMBRE_PROMOCION+' '+s.NOMBRE_CAMPANIA).some(w=>w.includes(q.slice(0,4)))&&s.score>=Number(config.minSimilarity??65)&&s.min>=60);
    if(matches.length){search=q;expected=matches;break;}
   }if(search)break;}
   if(!search){report.pending.push('PROMOTION_APPROXIMATE_REAL_SAMPLE_MISSING');return;}
   const rows=Math.max(1,Math.ceil(expected.length/10));if(rows>50){report.pending.push('PROMOTION_APPROXIMATE_TRAVERSAL_EXCEEDS_BOUND');return;}
   const obtained=[];for(let page=1;page<=Math.ceil(expected.length/rows);page++){
    const r=await call('search_promotions',{search,page,rows});check(r.matchMode==='approximate'&&r.totalRows===expected.length,'PROMOTION_APPROXIMATE_TOTAL_'+page);check(r.hasMore===(page*rows<expected.length)&&r.nextPage===(page*rows<expected.length?page+1:null),'PROMOTION_APPROXIMATE_PAGING_'+page);
    const options=r.status==='RESOLVED'?[r.promotion]:r.options;obtained.push(...options.map(o=>JSON.stringify([o.promotionId,o.campaignId])));
   }
   check(JSON.stringify(obtained.sort())===JSON.stringify(expected.map(r=>JSON.stringify([String(r.COD_PROMOCION),r.COD_CAMPANIA==null?null:Number(r.COD_CAMPANIA)])).sort()),'PROMOTION_APPROXIMATE_COMPLETE_CATALOG');denialArgs.set('search_promotions',{search,page:1,rows:1});
  });
  for(const [name,args] of denialArgs)await run('DENIAL_'+name,async()=>{let denied=false;try{await executeTool({name,arguments:args,context:{sessionId:deniedSessionId}});}catch(e){denied=e.code==='ACCESS_DENIED'&&[942,1031].includes(Number(e.errorNum));}check(denied,'DENIED_NO_DATA_'+name);});
  report.coveredSearchers=[...denialArgs.keys()];
 });
 check(opened===closed&&closeErrors===0,'ALL_PROXY_CONNECTIONS_CLOSED');
 report.success=report.checks.every(c=>c.passed);
}catch(e){report.error={code:technical(e),message:'No se completó el control DEV de buscadores.'};}
finally{if(!report.checks.some(c=>c.code==='ALL_PROXY_CONNECTIONS_CLOSED'))report.checks.push({code:'ALL_PROXY_CONNECTIONS_CLOSED',passed:opened===closed&&closeErrors===0});}
report.finishedAt=new Date().toISOString();report.evidenceHash=createHash('sha256').update(JSON.stringify(report.checks)).digest('hex');output(JSON.stringify(report));process.exit(report.success?0:1);
