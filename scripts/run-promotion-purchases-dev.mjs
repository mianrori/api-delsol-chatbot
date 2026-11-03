import 'dotenv/config';
import {writeFile} from 'node:fs/promises';
import config from '../config.js';
import {withOracleProxySession,getValidOracleSession} from '../src/services/sessions/oracleSession.service.js';
import {getMemberPromoPurchases} from '../src/services/members/memberPromoPurchase.service.js';
import {resolvePromotion} from '../src/services/promotions/promotion.resolver.js';
const output=console.log.bind(console),logCodes=new Set();console.log=()=>{};console.error=(...values)=>{for(const value of values)for(const m of String(value?.message??value??'').matchAll(/(?:ORA|NJS|DPI)-\d+|ERR_[A-Z_]+/g))logCodes.add(m[0]);};
const report={suite:'promotion-purchases-dev',startedAt:new Date().toISOString(),checks:[],coverage:{},pending:[]};
const check=(ok,code)=>report.checks.push({code,passed:Boolean(ok)});
const near=(a,b)=>a===b||(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(.000001,Math.abs(b)*1e-9));
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const currency=s=>{const raw=String(s??'').trim(),v=norm(raw);return ['PYG','GS'].includes(v)||v.includes('GUARANI')||raw==='₲'?'PYG':['USD','US'].includes(v)||v.includes('DOLAR')||raw==='$'?'USD':null;};
const day=s=>s.slice(0,10).split('-').reverse().join('/');
const key=r=>JSON.stringify([r.PROMOTION_ID,String(r.CAMPAIGN_ID),r.CUSTOMER_ID,r.CATEGORY_ID,r.CURRENCY_DESCRIPTION,r.CURRENCY_SYMBOL,r.INVOICE_NUMBER,r.PURCHASE_AT?.slice(0,10),r.REGISTER_AT?.slice(0,10),r.AMOUNT,r.BANK_ORIGIN]);
try{
 if(config.env!=='development'||config.bedrockDebugPayloads||config.piiDebugShowRaw)throw Error('UNSAFE_CONFIGURATION');
 const sessionId=process.env.BOT_TEST_SESSION_ID?.trim(),documentNumber=process.env.BOT_TEST_PROMO_DOCUMENT?.trim();
 if(!sessionId||!documentNumber)throw Error('HIDDEN_INPUTS_REQUIRED');
 let closed=false;
 await withOracleProxySession(sessionId,async({connection})=>{
  const close=connection.close.bind(connection);connection.close=async()=>{await close();closed=true;};
  const raw=(await connection.execute(`SELECT TO_CHAR(FECHA,'YYYY-MM-DD HH24:MI:SS') REGISTER_AT,
   TO_CHAR(FECHA_COMPRA,'YYYY-MM-DD HH24:MI:SS') PURCHASE_AT,COD_PROMOCION PROMOTION_ID,PROMOCION PROMOTION_NAME,
   COD_CAMPANIA CAMPAIGN_ID,CAMPANIA CAMPAIGN_NAME,COD_CLIENTE CUSTOMER_ID,LOCAL CUSTOMER_NAME,
   COD_RUBRO CATEGORY_ID,RUBRO CATEGORY_NAME,MONEDA CURRENCY_DESCRIPTION,SIMBOLO_MONEDA CURRENCY_SYMBOL,
   TO_CHAR(NRO_FACTURA) INVOICE_NUMBER,MONTO AMOUNT,ORIGEN_BANCARIO BANK_ORIGIN
   FROM VW_BOT_FACTURAS_PROMO WHERE COD_SOCIO=:documentNumber`,{documentNumber},{maxRows:100001})).rows??[];
  const catalog=(await connection.execute(`SELECT COD_PROMOCION,COD_CAMPANIA,NOMBRE_PROMOCION,NOMBRE_CAMPANIA,
   TO_CHAR(FECHA_DESDE,'DD/MM/YYYY') FECHA_DESDE,TO_CHAR(FECHA_HASTA,'DD/MM/YYYY') FECHA_HASTA FROM VW_BOT_PROMOCIONES`,{},{maxRows:20001})).rows??[];
  if(raw.length>100000||catalog.length>20000)throw Error('CONTROL_LIMIT_EXCEEDED');
  if(!raw.length)throw Error('MEMBER_PROMO_PURCHASE_FIXTURE_EMPTY');
  const pairs=new Map();for(const r of raw){if(r.PROMOTION_ID==null||r.CAMPAIGN_ID==null||!r.PURCHASE_AT)continue;const k=JSON.stringify([String(r.PROMOTION_ID),Number(r.CAMPAIGN_ID)]);if(!pairs.has(k))pairs.set(k,[]);pairs.get(k).push(r);}
  const rows=[...pairs.values()].sort((a,b)=>b.length-a.length)[0];if(!rows)throw Error('NO_PROMOTION_CAMPAIGN_PAIR');
  const first=rows[0],dates=rows.map(r=>r.PURCHASE_AT).sort();
  const args={documentNumber,promotionIds:[String(first.PROMOTION_ID)],campaignIds:[Number(first.CAMPAIGN_ID)],dateFrom:day(dates[0]),dateTo:day(dates.at(-1)),mode:'summary',groupBy:[]};
  report.coverage.memberFixture=true;report.coverage.multiplePages=rows.length>2;
  const expected=(source,groupBy=[])=>{
   const map=new Map();for(const r of source){const dims=groupBy.map(g=>({month:r.PURCHASE_AT.slice(0,7),year:r.PURCHASE_AT.slice(0,4),promotion:String(r.PROMOTION_ID),campaign:Number(r.CAMPAIGN_ID),customer:String(r.CUSTOMER_ID),category:String(r.CATEGORY_ID),bankOrigin:r.BANK_ORIGIN==='S'?true:r.BANK_ORIGIN==null||r.BANK_ORIGIN==='N'?false:null}[g]));const k=JSON.stringify([...dims,r.CURRENCY_DESCRIPTION,r.CURRENCY_SYMBOL]);if(!map.has(k))map.set(k,{count:0,amount:0});const v=map.get(k),a=currency(r.CURRENCY_SYMBOL),b=currency(r.CURRENCY_DESCRIPTION);v.count++;if(r.AMOUNT==null||!a||b&&a!==b)v.amount=null;else if(v.amount!==null)v.amount+=Number(r.AMOUNT);}return map;
  };
  const compare=(result,input,source,label)=>{
   const control=expected(source,input.groupBy??[]);
   const actual=new Map((result.data??[]).map(r=>[JSON.stringify([...(input.groupBy??[]).map(g=>r[{month:'month',year:'year',promotion:'promotionId',campaign:'campaignId',customer:'customerId',category:'categoryId',bankOrigin:'bankOrigin'}[g]]),r.currency.description,r.currency.symbol]),r]));
   check(actual.size===control.size,label+'_GROUPS');
   check([...control].every(([k,v])=>actual.has(k)&&near(actual.get(k).totalAmount,v.amount)&&actual.get(k).purchaseCount===v.count),label+'_AMOUNTS_AND_COUNTS');
   check(result.documentNumber===input.documentNumber,label+'_MEMBER_PRESERVED');return result;
  };
  const verify=async(input,source,label)=>compare(await getMemberPromoPurchases(input,connection),input,source,label);
  await verify(args,rows,'SUMMARY');
  for(const groupBy of [['month'],['promotion','campaign'],['customer','category'],['bankOrigin']])await verify({...args,groupBy},rows,'BREAKDOWN_'+groupBy.join('_').toUpperCase());
  await verify({...args,customerIds:[String(first.CUSTOMER_ID)]},rows.filter(r=>String(r.CUSTOMER_ID)===String(first.CUSTOMER_ID)),'CUSTOMER_FILTER');
  await verify({...args,categoryIds:[String(first.CATEGORY_ID)]},rows.filter(r=>String(r.CATEGORY_ID)===String(first.CATEGORY_ID)),'CATEGORY_FILTER');
  await verify({...args,dateFrom:day(first.PURCHASE_AT),dateTo:day(first.PURCHASE_AT)},rows.filter(r=>r.PURCHASE_AT.slice(0,10)===first.PURCHASE_AT.slice(0,10)),'SINGLE_DAY_FILTER');
  await verify({...args,origin:'bank'},rows.filter(r=>r.BANK_ORIGIN==='S'),'BANK_FILTER');
  await verify({...args,origin:'nonBank'},rows.filter(r=>r.BANK_ORIGIN==null||r.BANK_ORIGIN==='N'),'NONBANK_FILTER');
  const collected=[];const pageSize=Math.min(2,Math.max(1,Number(config.limitFilter)||10)),pages=Math.ceil(rows.length/pageSize);
  if(pages>200)throw Error('PAGINATION_CONTROL_LIMIT_EXCEEDED');
  for(let page=1;page<=pages;page++){
   const result=await getMemberPromoPurchases({...args,mode:'detail',rows:pageSize,page},connection);
   check(result.documentNumber===documentNumber,'DETAIL_'+page+'_MEMBER_PRESERVED');
   check(result.totalRows===rows.length&&result.totalPages===pages&&result.page===page&&result.rows===pageSize,'DETAIL_'+page+'_TOTALS');
   check(result.hasMore===(page<pages)&&result.nextPage===(page<pages?page+1:null),'DETAIL_'+page+'_PAGINATION_END');
   for(const r of result.data??[])collected.push(JSON.stringify([r.promotion.id,String(r.campaign.id),r.customer.id,r.category.id,r.currency.description,r.currency.symbol,r.invoiceNumber,r.purchaseDate?.split('/').reverse().join('-'),r.registerDate?.split('/').reverse().join('-'),r.amount,r.bankOrigin?'S':r.origin==='No bancario'?'N':null]));
  }
  const multiset=list=>{const m=new Map();for(const k of list)m.set(k,(m.get(k)??0)+1);return m;};
  const sourceKeys=rows.map(r=>key({...r,PROMOTION_ID:String(r.PROMOTION_ID),CUSTOMER_ID:String(r.CUSTOMER_ID),CATEGORY_ID:String(r.CATEGORY_ID),BANK_ORIGIN:r.BANK_ORIGIN??'N'}));
  const a=multiset(collected),b=multiset(sourceKeys);check(a.size===b.size&&[...b].every(([k,n])=>a.get(k)===n),'COMPLETE_DETAIL_MULTISET_RECONCILED');
  const stale=await getMemberPromoPurchases({...args,mode:'detail',rows:pageSize,page:1,knownTotalRows:0},connection);
  check(stale.totalRows===rows.length,'UNTRUSTED_TOTAL_CANNOT_CHANGE_PAGINATION');
  const empty=await getMemberPromoPurchases({...args,customerIds:['-999999999']},connection);check(!empty.data?.length,'NO_PURCHASES_FILTER');
  const query=String(first.PROMOTION_ID),tokens=norm(query).split(' ');
  const matches=catalog.filter(c=>String(c.COD_PROMOCION).trim().toUpperCase()===query.toUpperCase()||String(c.COD_CAMPANIA)===query||tokens.every(t=>norm(c.NOMBRE_PROMOCION).includes(t)||norm(c.NOMBRE_CAMPANIA).includes(t)));
  const search=await resolvePromotion(query,connection,{page:1,rows:1});
  check(search.totalRows===matches.length,'SEARCH_INDEPENDENT_COUNT');check(search.status===(matches.length===1?'RESOLVED':matches.length?'AMBIGUOUS':'NOT_FOUND'),'SEARCH_AMBIGUITY_DISTINCT_FROM_EMPTY');
  report.coverage.searchMultipleOptions=matches.length>1;
  if(process.env.BOT_TEST_PROMO_HTTP==='true'){
   const totalSearchPages=Math.ceil(matches.length/2),seen=[];
   if(totalSearchPages<=200){for(let page=1;page<=totalSearchPages;page++){
    const found=await resolvePromotion(query,connection,{page,rows:2});
    check(found.totalRows===matches.length&&found.hasMore===(page<totalSearchPages)&&found.nextPage===(page<totalSearchPages?page+1:null),'SEARCH_PAGE_'+page+'_METADATA');
    const options=found.status==='RESOLVED'?[found.promotion]:found.options;for(const o of options)seen.push(JSON.stringify([o.promotionId,o.campaignId,o.dateFrom,o.dateTo,o.promotionName,o.campaignName]));
   }const source=matches.map(o=>JSON.stringify([String(o.COD_PROMOCION),o.COD_CAMPANIA==null?null:Number(o.COD_CAMPANIA),o.FECHA_DESDE,o.FECHA_HASTA,o.NOMBRE_PROMOCION,o.NOMBRE_CAMPANIA]));const x=multiset(seen),y=multiset(source);check(x.size===y.size&&[...y].every(([k,n])=>x.get(k)===n),'SEARCH_COMPLETE_CATALOG_MULTISET');}
   else report.pending.push('SEARCH_COMPLETE_PAGINATION_LIMIT_EXCEEDED');
   const noSelection=await getMemberPromoPurchases({...args,campaignIds:[Number.MAX_SAFE_INTEGER]},connection);check(noSelection.status==='SELECTION_NOT_FOUND','INVALID_PAIR_IS_NOT_EMPTY_PURCHASES');
   const noPurchases=await getMemberPromoPurchases({...args,customerIds:['-999999999']},connection);check(noPurchases.status==='NO_PURCHASES','VALID_SELECTION_EMPTY_PURCHASES_DISTINCT');
   let emptyMember;for(const candidate of ['-999999999','-999999998','-999999997']){if(candidate===documentNumber)continue;const count=(await connection.execute('SELECT COUNT(*) AS TOTAL_ROWS FROM VW_BOT_FACTURAS_PROMO WHERE COD_SOCIO=:documentNumber',{documentNumber:candidate})).rows?.[0]?.TOTAL_ROWS;if(Number(count)===0){emptyMember=candidate;break;}}
   if(emptyMember){const other=await getMemberPromoPurchases({...args,documentNumber:emptyMember},connection);check(other.status==='NO_PURCHASES'&&other.documentNumber===emptyMember&&!other.data.length,'DIFFERENT_MEMBER_FILTER_NO_DATA_LEAK');report.coverage.otherMemberEmptyControl=true;}else report.pending.push('OTHER_MEMBER_EMPTY_CONTROL_NOT_AVAILABLE');
   report.coverage.multipleCurrencies=new Set(rows.map(r=>currency(r.CURRENCY_SYMBOL)).filter(Boolean)).size>1;
   if(!report.coverage.multipleCurrencies)report.pending.push('MIXED_CURRENCY_REAL_MEMBER_FIXTURE_NOT_FOUND');
   const {router}=await import('../src/routes/index.js');const {getConversation,setConversation,clearConversation}=await import('../src/state/conversation.store.js');const {protectPiiDeep,restorePiiDeep}=await import('../src/services/ai/pii.service.js');const {default:express}=await import('express');
   const app=express();app.use(express.json());app.use('/chatbot/api',router);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
   const seed=async(input)=>{const result=await getMemberPromoPurchases(input,connection);setConversation(sessionId,[{role:'user',content:[{text:'Compras promocionales del socio seleccionado'}]},{role:'assistant',content:[{toolUse:{name:'get_member_promo_purchases',toolUseId:'promo-seed',input:protectPiiDeep(sessionId,input)}}]},{role:'user',content:[{toolResult:{toolUseId:'promo-seed',status:'success',content:[{json:protectPiiDeep(sessionId,result,null,['get_member_promo_purchases'])}]}}]},{role:'assistant',content:[{text:'Compras del socio seleccionado.'}]}]);return result;};
   const request=async(message,input,source,label)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/chatbot/api/bot/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message}),signal:AbortSignal.timeout(90000)});const body=await response.json();check(response.status===200&&body.success===true,'HTTP_'+label+'_SUCCESS');
    const history=getConversation(sessionId);let start=-1;for(let i=history.length-1;i>=0;i--)if(history[i].role==='user'&&history[i].content?.some(b=>typeof b.text==='string')){start=i;break;}
    const blocks=history.slice(start+1).flatMap(m=>m.content??[]),queries=blocks.map(b=>b.toolUse).filter(b=>b?.name==='get_member_promo_purchases');check(queries.length===1,'HTTP_'+label+'_QUERY_EXECUTED');if(queries.length!==1)return;
    const actual=restorePiiDeep(sessionId,queries[0].input);
    const campaignKey=(values)=>Array.isArray(values)&&values.every(v=>(typeof v==='number'||typeof v==='string'&&/^\d+$/.test(v))&&Number.isSafeInteger(Number(v))&&Number(v)>=0)?JSON.stringify(values.map(Number)):null;
    check(['documentNumber','promotionIds','campaignIds','customerIds','categoryIds','dateFrom','dateTo','origin','mode','rows','page'].every(k=>k==='campaignIds'?campaignKey(actual[k]??[])!==null&&campaignKey(actual[k]??[])===campaignKey(input[k]??[]):JSON.stringify(actual[k]??(k.endsWith('Ids')?[]:k==='page'?1:null))===JSON.stringify(input[k]??(k.endsWith('Ids')?[]:k==='page'?1:null))),'HTTP_'+label+'_IDENTITIES_AND_FILTERS_PRESERVED');
    const block=blocks.map(b=>b.toolResult).find(b=>b?.toolUseId===queries[0].toolUseId);check(block?.status==='success','HTTP_'+label+'_TOOL_SUCCESS');
    if(block?.status==='success'){const result=restorePiiDeep(sessionId,block.content.find(b=>b.json)?.json);if(input.mode==='summary')compare(result,input,source,'HTTP_'+label);else check(result.totalRows===source.length&&result.page===input.page&&result.documentNumber===documentNumber,'HTTP_'+label+'_PAGE_METADATA');}
    check(String(body.response??'').includes('Compras del socio por promoción y campaña'),'HTTP_'+label+'_DETERMINISTIC_PRESENTATION');
   };
   try{
    const detail={...args,mode:'detail',rows:pageSize,page:1};await seed(detail);
    if(pages>1)await request('Siguiente página',{...detail,page:2},rows,'NEXT_PAGE');
    await request('Ahora muestra el resumen; conserva los demás filtros',{...detail,mode:'summary',page:1},rows,'SUMMARY');
    const changed={...detail,mode:'summary',page:1,dateFrom:day(first.PURCHASE_AT),dateTo:day(first.PURCHASE_AT)},dayRows=rows.filter(r=>r.PURCHASE_AT.slice(0,10)===first.PURCHASE_AT.slice(0,10));
    await request(`Ahora cambia el período a ${changed.dateFrom} al ${changed.dateTo}; conserva los demás filtros`,changed,dayRows,'PERIOD');
    await request('Ahora desglosa por mes; conserva los demás filtros',{...changed,groupBy:['month']},dayRows,'MONTH_BREAKDOWN');
    const ambiguousArgs={...args,campaignIds:[]},ambiguous=await seed(ambiguousArgs);
    if(ambiguous.status==='AMBIGUOUS'&&ambiguous.options?.length){const choice=ambiguous.options[0],chosen={...ambiguousArgs,promotionIds:[choice.promotionId],campaignIds:[choice.campaignId],page:1};await request(`Opción ${choice.optionId}`,chosen,raw.filter(r=>String(r.PROMOTION_ID)===choice.promotionId&&Number(r.CAMPAIGN_ID)===choice.campaignId&&r.PURCHASE_AT>=dates[0].slice(0,10)+' 00:00:00'&&r.PURCHASE_AT<=dates.at(-1).slice(0,10)+' 23:59:59'),'EXPLICIT_SELECTION');report.coverage.explicitAmbiguousSelection=true;}
    else report.pending.push('AMBIGUOUS_SELECTION_REAL_FIXTURE_NOT_FOUND');
   }finally{clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
  }
 });
 check(closed,'CONTROL_CONNECTION_CLOSED');
 if(process.env.BOT_TEST_DENIED_SESSION_ID?.trim()){
  const a=await getValidOracleSession(process.env.BOT_TEST_SESSION_ID),b=await getValidOracleSession(process.env.BOT_TEST_DENIED_SESSION_ID);check(a.username!==b.username,'DISTINCT_ORACLE_USERS');
  if(a.username!==b.username){let denied=false,closed=false;try{await withOracleProxySession(process.env.BOT_TEST_DENIED_SESSION_ID,async({connection})=>{const close=connection.close.bind(connection);connection.close=async()=>{await close();closed=true;};await getMemberPromoPurchases({documentNumber,mode:'summary'},connection);});}catch(e){denied=[942,1031].includes(Number(e.errorNum));}check(denied,'REAL_DENIAL_NO_DATA');check(closed,'DENIED_CONNECTION_CLOSED');}
 }else report.pending.push('REAL_DENIED_USER_NOT_CONFIGURED');
 if(!report.coverage.multiplePages)report.pending.push('MULTIPAGE_DEV_FIXTURE_NOT_FOUND');
 report.success=report.checks.every(c=>c.passed);
}catch(e){report.success=false;report.error=/^[A-Z_]+$/.test(e.code??'')?e.code:/^[A-Z_]+$/.test(e.message??'')?e.message:'PROMOTION_PURCHASES_DEV_ERROR';if(Number.isInteger(e.errorNum))report.oracleErrorNum=e.errorNum;}
report.logCodes=[...logCodes];report.finishedAt=new Date().toISOString();await writeFile(process.env.BOT_TEST_REPORT||'/tmp/promotion-purchases-dev.json',JSON.stringify(report,null,2),{mode:0o600});output(JSON.stringify(report));process.exit(report.success?0:1);
