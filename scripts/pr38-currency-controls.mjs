import {compareMemberPurchasesVsSales} from '../src/services/members/memberPurchasesVsSales.service.js';
import {buildMemberPurchasesVsSalesResponse} from '../src/services/ai/memberPurchasesVsSalesPresentation.service.js';

const period={dateFrom:'01/01/2023',dateTo:'31/05/2023'};
const str=v=>v==null?null:String(v);
const key=(...v)=>JSON.stringify(v);
const near=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=Math.max(.000001,Math.abs(Number(b))*1e-10);
const expected=(d,s,code,status,reason,percentage,sales=100,purchases=20,n=2,u=1)=>({d,s,code,status,reason,percentage,sales,purchases,n,u});
const paired=(id,d,s,code,status,reason,percentage)=>({id,sd:d,ss:s,pd:d,ps:s,sa:100,pa:20,expected:[expected(d,s,code,status,reason,percentage)]});

// Expectations are an explicit fixture table, independent of the production
// classifier. These are controlled rows, never real multicurrency members.
export const currencyFixtures=[
  paired('BARE_DOLLAR','$','$',null,'ambiguous','CURRENCY_AMBIGUOUS',null),
  paired('CONFLICT','GUARANIES','USD',null,'contradictory','CURRENCY_CONTRADICTION',null),
  paired('UNKNOWN_DESCRIPTION','SIN IDENTIFICAR','USD',null,'ambiguous','CURRENCY_AMBIGUOUS',null),
  paired('KNOWN_PYG','GUARANIES','GS.','PYG','identified',null,20),
  paired('KNOWN_USD','DOLARES AMERICANOS','$','USD','identified',null,20),
  paired('KNOWN_CAD','DOLARES CANADIENSES','$','CAD','identified',null,20),
  paired('KNOWN_CODE',null,'USD','USD','identified',null,20),
  {id:'INCOMPATIBLE',sd:'DOLARES',ss:'USD',pd:'GUARANIES',ps:'GS.',sa:100,pa:20,expected:[
    expected('DOLARES','USD','USD','identified','CURRENCY_INCOMPATIBLE',null,100,0,0,0),
    expected('GUARANIES','GS.','PYG','identified','CURRENCY_INCOMPATIBLE',null,0,20),
  ]},
  {id:'ALIASES',sd:'DOLARES',ss:'USD',pd:'DOLARES AMERICANOS',ps:'US$',sa:100,pa:20,expected:[
    expected('DOLARES','USD','USD','identified','CURRENCY_METADATA_MISMATCH',null,100,0,0,0),
    expected('DOLARES AMERICANOS','US$','USD','identified','CURRENCY_METADATA_MISMATCH',null,0,20),
  ]},
  {id:'SHARED_SYMBOL',sd:'DOLARES AMERICANOS',ss:'$',pd:'DOLARES AMERICANOS',ps:'$',sa:100,pa:20,expected:[expected('DOLARES AMERICANOS','$','USD','identified',null,20)]},
  {id:'SHARED_SYMBOL',sd:'DOLARES CANADIENSES',ss:'$',pd:'DOLARES CANADIENSES',ps:'$',sa:400,pa:40,expected:[expected('DOLARES CANADIENSES','$','CAD','identified',null,10,400,40)]},
  {id:'SHARED_SYMBOL',sd:null,ss:'$',pd:null,ps:'$',sa:100,pa:7,expected:[expected(null,'$',null,'ambiguous','CURRENCY_AMBIGUOUS',null,100,7)]},
];

export function currencyFixtureQuery(reverse=false){
  const binds={},parts=currencyFixtures.map((fixture,i)=>{
    for(const field of ['id','sd','ss','pd','ps','sa','pa'])binds[field+i]=fixture[field];
    return `SELECT :id${i} CASE_ID,:sd${i} SALES_DESCRIPTION,:ss${i} SALES_SYMBOL,:pd${i} PURCHASE_DESCRIPTION,:ps${i} PURCHASE_SYMBOL,:sa${i} SALES_AMOUNT,:pa${i} PURCHASE_AMOUNT FROM DUAL`;
  });
  return {text:`WITH currency_fixture AS (${parts.join(' UNION ALL ')}) SELECT * FROM currency_fixture ORDER BY CASE_ID ${reverse?'DESC':'ASC'},SALES_AMOUNT ${reverse?'DESC':'ASC'}`,binds};
}

export async function contrastCurrencyFixtures({query,check}){
  let previous;
  const expectedRows=currencyFixtures.flatMap(f=>f.expected.map(e=>({...e,id:f.id})));
  for(const reverse of [false,true]){
    const statement=currencyFixtureQuery(reverse),rows=await query(statement.text,statement.binds);
    check(rows.length===currencyFixtures.length,'CURRENCY_CTE_INPUT_ROWS_COMPLETE');
    const sales=rows.map(r=>({DIMENSION_1_ID:r.CASE_ID,DIMENSION_1_NAME:r.CASE_ID,CURRENCY_DESCRIPTION:r.SALES_DESCRIPTION,CURRENCY_SYMBOL:r.SALES_SYMBOL,SALES_AMOUNT:r.SALES_AMOUNT}));
    const purchases=rows.map(r=>({DIMENSION_1_ID:r.CASE_ID,DIMENSION_1_NAME:r.CASE_ID,CURRENCY_DESCRIPTION:r.PURCHASE_DESCRIPTION,CURRENCY_SYMBOL:r.PURCHASE_SYMBOL,EXCHANGE_AMOUNT:r.PURCHASE_AMOUNT,INVOICE_COUNT:2,MEMBER_COUNT:1}));
    const result=await compareMemberPurchasesVsSales({...period,breakdownBy:['customer']},{execute:async text=>({rows:text.includes('VW_BOT_VENTAS_LOCALES')?sales:purchases})});
    check(result.results.length===expectedRows.length,'CURRENCY_CTE_GROUPS_NOT_MERGED');
    for(const e of expectedRows){
      const r=result.results.find(r=>r.dimensions[0].id===e.id&&r.currency.description===e.d&&r.currency.symbol===e.s);
      check(r&&r.currency.code===e.code&&r.currency.status===e.status&&r.percentage===e.percentage&&r.percentageReasonCode===e.reason&&near(r.auditedSalesAmount,e.sales)&&near(r.exchangeAmount,e.purchases)&&r.invoiceCount===e.n&&r.memberCount===e.u,'CURRENCY_CTE_IDENTITY_AMOUNTS_PERCENTAGE_REASON');
      const text=buildMemberPurchasesVsSalesResponse([{name:'compare_member_purchases_vs_sales',result:{...result,results:[r]}}]);
      check(e.reason?text.includes('No calculable')&&text.includes(r.percentageReason):!text.includes('No calculable')&&text.includes(String(e.percentage)+' %'),'CURRENCY_CTE_PRESENTATION_EXPLAINS_EACH_ROW');
    }
    const canonical=result.results.map(r=>JSON.stringify(r)).sort();
    if(previous)check(JSON.stringify(previous)===JSON.stringify(canonical),'CURRENCY_CTE_INVERSION_PRESERVES_RESULTS');
    previous=canonical;
  }
}

export async function contrastRealComparison({query,tool,check,missing,mark=()=>{}}){
  mark('CURRENCY_REAL_SAMPLE_DISCOVERY');
  const sample=(await query("SELECT COD_CLIENTE C,COD_RUBRO R FROM VW_BOT_COMPRAS_SOCIO WHERE FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_CLIENTE IS NOT NULL AND COD_RUBRO IS NOT NULL GROUP BY COD_CLIENTE,COD_RUBRO ORDER BY COD_CLIENTE,COD_RUBRO FETCH FIRST 1 ROWS ONLY"))[0];
  if(!sample)missing('CURRENCY_REAL_COMPARISON_PROFILE_NOT_FOUND');
  let request;
  for(const monthly of [false,true]){
    const binds={c:str(sample.C),r:str(sample.R)};
    mark(monthly?'CURRENCY_REAL_MONTHLY_SALES_CONTROL':'CURRENCY_REAL_TOTAL_SALES_CONTROL');
    const sales=await query(`SELECT ${monthly?"TO_CHAR(FECHA,'YYYY-MM')":"NULL"} M,DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A FROM VW_BOT_VENTAS_LOCALES WHERE FECHA>=DATE '2023-01-01' AND FECHA<DATE '2023-06-01' AND COD_CLIENTE=:c AND COD_RUBRO=:r GROUP BY ${monthly?"TO_CHAR(FECHA,'YYYY-MM'),":''}DES_MONEDA,SIGLAS_MONEDA`,binds);
    mark(monthly?'CURRENCY_REAL_MONTHLY_PURCHASES_CONTROL':'CURRENCY_REAL_TOTAL_PURCHASES_CONTROL');
    const purchases=await query(`SELECT ${monthly?"TO_CHAR(FECHA_COMPRA,'YYYY-MM')":"NULL"} M,MONEDA D,SIMBOLO_MONEDA S,SUM(NVL(IMPORTE,0)) A,COUNT(*) N,COUNT(DISTINCT COD_SOCIO) U FROM VW_BOT_COMPRAS_SOCIO WHERE FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_CLIENTE=:c AND COD_RUBRO=:r GROUP BY ${monthly?"TO_CHAR(FECHA_COMPRA,'YYYY-MM'),":''}MONEDA,SIMBOLO_MONEDA`,binds);
    // This real profile is deliberately restricted to independently recognizable
    // PYG source tuples. USD/CAD/unknown/conflicting inputs are covered by the
    // explicit CTE expectation table, not claimed as real member fixtures.
    const pyg=r=>['GUARANIES','GUARANI','PYG'].includes(String(r.D??'').trim().toUpperCase())&&['₲','GS','GS.','PYG',''].includes(String(r.S??'').trim().toUpperCase());
    if(!sales.length||!purchases.length||![...sales,...purchases].every(pyg))missing('CURRENCY_REAL_PYG_COMPARISON_PROFILE_NOT_FOUND');
    const expected=new Map();
    for(const r of sales)expected.set(key(r.M,r.D,r.S),{...r,sales:Number(r.A),purchases:0,n:0,u:0});
    for(const r of purchases){const k=key(r.M,r.D,r.S);if(!expected.has(k))expected.set(k,{...r,sales:0});Object.assign(expected.get(k),{purchases:Number(r.A),n:r.N,u:r.U});}
    const args={...period,customerIds:[binds.c],categoryIds:[binds.r],breakdownBy:monthly?['month']:[]};
    mark(monthly?'CURRENCY_REAL_MONTHLY_TOOL':'CURRENCY_REAL_TOTAL_TOOL');
    const result=await tool('compare_member_purchases_vs_sales',args);
    check(result.results.length===expected.size,'CURRENCY_REAL_GROUP_COUNT_SQL');
    for(const r of result.results){
      const month=r.dimensions[0]?.id??null,e=expected.get(key(month,r.currency.description,r.currency.symbol));
      check(e&&r.currency.code==='PYG'&&r.currency.status==='identified'&&near(r.auditedSalesAmount,e.sales)&&near(r.exchangeAmount,e.purchases)&&r.invoiceCount===(e.n??0)&&r.memberCount===(e.u??0),'CURRENCY_REAL_AMOUNTS_COUNTS_SQL');
      const salesExact=sales.some(x=>key(x.M,x.D,x.S)===key(month,r.currency.description,r.currency.symbol));
      const purchaseExact=purchases.some(x=>key(x.M,x.D,x.S)===key(month,r.currency.description,r.currency.symbol));
      const missingCounterpart=!salesExact?sales:!purchaseExact?purchases:[];
      const reason=missingCounterpart.some(x=>x.M===month)?'CURRENCY_METADATA_MISMATCH':e.sales<=0?'SALES_NOT_POSITIVE':null;
      const percent=reason?null:Math.round((e.purchases/e.sales*100+Number.EPSILON)*100)/100;
      check(r.percentageReasonCode===reason&&(percent===null?r.percentage===null:near(r.percentage,percent)),'CURRENCY_REAL_PERCENTAGE_COMPATIBILITY_SQL');
    }
    if(monthly)request={name:'compare_member_purchases_vs_sales',args,result};
  }
  return request;
}
