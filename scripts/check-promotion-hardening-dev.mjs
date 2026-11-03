import {getMemberPromoPurchases} from '../src/services/members/memberPromoPurchase.service.js';
import {withOracleProxySession} from '../src/services/sessions/oracleSession.service.js';

// Synthetic rows are evaluated by Oracle SELECT only; no DEV records are changed.
export async function checkPromotionHardening({connection,sessionId,check}) {
 const cases=[['PYG','GUARANIES','PYG'],['USD','DOLARES','USD'],['$','DOLARES','USD'],['$','PESOS ARGENTINOS',null],['$','PESOS MEXICANOS',null],['$',null,null],['$','DOLARES AUSTRALIANOS',null],['PYG','DOLARES',null],['USD','PESOS ARGENTINOS',null],[null,'DÓLARES ESTADOUNIDENSES','USD'],['US$',null,'USD']];
 const literal=v=>v==null?'CAST(NULL AS VARCHAR2(100))':`'${v.replaceAll("'","''")}'`;
 const source=cases.map(([symbol,description],i)=>`SELECT 'SYNTHETIC' COD_SOCIO, DATE '2023-01-15' FECHA, DATE '2023-01-15' FECHA_COMPRA, 'P' COD_PROMOCION, 'PROMO' PROMOCION, 1 COD_CAMPANIA, 'CAMPAIGN' CAMPANIA, 'L' COD_CLIENTE, 'LOCAL' LOCAL, 'R' COD_RUBRO, 'CATEGORY' RUBRO, ${literal(description)} MONEDA, ${literal(symbol)} SIMBOLO_MONEDA, ${i+1} NRO_FACTURA, ${(i+1)*10} MONTO, 'N' ORIGEN_BANCARIO FROM DUAL`).join(' UNION ALL ');
 const control={execute:(sql,binds,options)=>connection.execute(`WITH hardening_fixture AS (${source}) ${sql.replaceAll('VW_BOT_FACTURAS_PROMO','hardening_fixture')}`,binds,options)};
 const args={documentNumber:'SYNTHETIC',dateFrom:'01/01/2023',dateTo:'31/01/2023',mode:'summary'};
 const summary=await getMemberPromoPurchases(args,control);
 check(summary.data.length===cases.length,'HARDENING_ORACLE_RAW_CURRENCY_GROUPS_SEPARATE');
 for(const [i,[symbol,description,code]] of cases.entries()){
  const row=summary.data.find(r=>r.currency.symbol===symbol&&r.currency.description===description);
  check(row?.currency.code===code&&row?.purchaseCount===1&&row.totalAmount===(code?(i+1)*10:null)&&Boolean(row.reason)===!code,'HARDENING_ORACLE_CURRENCY_'+(i+1));
 }
 check(!Object.hasOwn(summary,'totalAmount')&&!JSON.stringify(summary).includes('amountUsd'),'HARDENING_NO_MIXED_TOTAL_OR_CONVERSION');
 const detail=[];let page=1,more=true;
 while(more&&page<=cases.length+1){const r=await getMemberPromoPurchases({...args,mode:'detail',page,rows:2},control);detail.push(...r.data);check(r.totalRows===cases.length&&r.hasMore===(page<r.totalPages)&&r.nextPage===(r.hasMore?page+1:null),'HARDENING_ORACLE_PAGE_'+page);more=r.hasMore;page++;}
 check(detail.length===cases.length&&new Set(detail.map(r=>r.invoiceNumber)).size===cases.length,'HARDENING_COMPLETE_DETAIL');
 check(detail.every(r=>{const i=Number(r.invoiceNumber)-1;return r.currency.code===cases[i][2]&&r.amount===(i+1)*10&&(r.currency.code||Boolean(r.reason));}),'HARDENING_DETAIL_CURRENCY_RECONCILED');
 for(const failOperation of [false,true]){
  const captured=[],previous=console.error,primary=Error('SYNTHETIC_PRIMARY'),sensitive='SYNTHETIC_PRIVATE_MARKER';let closed=false,result,caught;
  console.error=(...values)=>captured.push(values);
  try{result=await withOracleProxySession(sessionId,async({connection:real})=>{
   const close=real.close.bind(real);real.close=async()=>{await close();closed=true;throw Object.assign(Error(sensitive),{code:'ORA-03113',errorNum:3113,sessionId,password:sensitive});};
   if(failOperation)throw primary;return 'SYNTHETIC_RESULT';
  });}catch(e){caught=e;}finally{console.error=previous;}
  const entry=captured[0]?.[0];
  check(closed,'HARDENING_REAL_CLOSE_'+failOperation);
  check(failOperation?caught===primary:result==='SYNTHETIC_RESULT'&&!caught,'HARDENING_PRIMARY_OUTCOME_'+failOperation);
  check(captured.length===1&&captured[0].length===1&&JSON.stringify(Object.keys(entry??{}).sort())===JSON.stringify(['code','correlationId','driverCode'])&&entry.code==='ORACLE_PROXY_CLOSE_FAILED'&&entry.driverCode==='ORA-03113'&&/^[a-f0-9-]{36}$/.test(entry.correlationId)&&!JSON.stringify(captured).includes(sessionId)&&!JSON.stringify(captured).includes(sensitive),'HARDENING_SAFE_CLOSE_LOG_'+failOperation);
 }
}
