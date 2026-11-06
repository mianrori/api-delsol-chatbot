const iso=value=>{
 const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value??''));if(!match)throw Error('CONTROL_PERIOD_INVALID');
 const [,d,m,y]=match,date=new Date(Date.UTC(+y,+m-1,+d));
 if(date.getUTCFullYear()!==+y||date.getUTCMonth()!==+m-1||date.getUTCDate()!==+d)throw Error('CONTROL_PERIOD_INVALID');
 return `${y}-${m}-${d}`;
};
const key=row=>JSON.stringify([row.CURRENCY_DESCRIPTION??null,row.CURRENCY_SYMBOL??null]);

// One bounded source read, grouped by day/member/currency/store/category.
// ALL/ANY, recurrence and ranking are then calculated independently in JS.
export function dailySegmentationQuery(input){
 if(!input.purchasePeriods?.length||input.activityStatus==='inactive')throw Error('CONTROL_EXPLICIT_ACTIVE_PERIOD_REQUIRED');
 const binds={},filters=[];
 const periodSql=input.purchasePeriods.map((p,i)=>{iso(p.dateFrom);iso(p.dateTo);binds['from'+i]=p.dateFrom;binds['to'+i]=p.dateTo;return `(C.FECHA_COMPRA>=TO_DATE(:from${i},'DD/MM/YYYY') AND C.FECHA_COMPRA<TO_DATE(:to${i},'DD/MM/YYYY')+1)`;});
 filters.push('('+periodSql.join(' OR ')+')');
 for(const [field,column] of [['customerIds','COD_CLIENTE'],['categoryIds','COD_RUBRO']])if(input[field]?.length)filters.push(`C.${column} IN (${input[field].map((v,i)=>{binds[field+i]=v;return ':'+field+i;}).join(',')})`);
 if(input.gender){binds.sex=input.gender==='female'?'F':'M';filters.push('S.GENERO=:sex');}
 if(input.birthMonth!=null){binds.birth=input.birthMonth;filters.push('EXTRACT(MONTH FROM S.FECHA_NACIMIENTO)=:birth');}
 for(const [field,op] of [['ageMin','>='],['ageMax','<=']])if(input[field]!=null){binds[field]=input[field];filters.push(`TRUNC(MONTHS_BETWEEN(TRUNC(SYSDATE),S.FECHA_NACIMIENTO)/12)${op}:${field}`);}
 return {binds,sql:`SELECT D.*,
  DENSE_RANK() OVER(ORDER BY FULL_NAME) AS NAME_ORDER,
  DENSE_RANK() OVER(ORDER BY DOCUMENT_NUMBER) AS DOCUMENT_ORDER,
  DENSE_RANK() OVER(ORDER BY CURRENCY_DESCRIPTION,CURRENCY_SYMBOL) AS CURRENCY_ORDER
  FROM (SELECT S.COD_SOCIO DOCUMENT_NUMBER,S.NOMBRE_COMPLETO FULL_NAME,S.GENERO GENDER,
  TO_CHAR(S.FECHA_NACIMIENTO,'DD/MM/YYYY') BIRTH_DATE,EXTRACT(MONTH FROM S.FECHA_NACIMIENTO) BIRTH_MONTH,
  TRUNC(MONTHS_BETWEEN(TRUNC(SYSDATE),S.FECHA_NACIMIENTO)/12) AGE,
  TO_CHAR(C.FECHA_COMPRA,'YYYY-MM-DD') PURCHASE_DAY,C.MONEDA CURRENCY_DESCRIPTION,C.SIMBOLO_MONEDA CURRENCY_SYMBOL,
  C.COD_CLIENTE CUSTOMER_ID,C.LOCAL CUSTOMER_NAME,C.COD_RUBRO CATEGORY_ID,C.RUBRO CATEGORY_NAME,
  NVL(SUM(C.IMPORTE),0) TOTAL_AMOUNT,COUNT(*) PURCHASE_COUNT
  FROM VW_BOT_COMPRAS_SOCIO C JOIN (SELECT DISTINCT COD_SOCIO,NOMBRE_COMPLETO,GENERO,FECHA_NACIMIENTO FROM VW_BOT_SOCIOS) S ON S.COD_SOCIO=C.COD_SOCIO
  WHERE ${filters.join(' AND ')} GROUP BY S.COD_SOCIO,S.NOMBRE_COMPLETO,S.GENERO,S.FECHA_NACIMIENTO,
  TO_CHAR(C.FECHA_COMPRA,'YYYY-MM-DD'),C.MONEDA,C.SIMBOLO_MONEDA,C.COD_CLIENTE,C.LOCAL,C.COD_RUBRO,C.RUBRO) D`};
}

export function aggregateDailySegmentation(input,daily){
 const periods=input.purchasePeriods.map(p=>[iso(p.dateFrom),iso(p.dateTo)]),members=new Map();
 for(const row of daily){
  const id=String(row.DOCUMENT_NUMBER);
  if(!members.has(id))members.set(id,{sample:row,dates:new Set(),flags:periods.map(()=>false),currencies:new Map()});
  const member=members.get(id);
  if(JSON.stringify([member.sample.FULL_NAME,member.sample.GENDER,member.sample.BIRTH_DATE])!==JSON.stringify([row.FULL_NAME,row.GENDER,row.BIRTH_DATE]))throw Error('CONTROL_AMBIGUOUS_DEMOGRAPHICS');
  periods.forEach(([a,b],i)=>{if(row.PURCHASE_DAY>=a&&row.PURCHASE_DAY<=b)member.flags[i]=true;});
  member.dates.add(row.PURCHASE_DAY.slice(0,7));
  const currencyKey=key(row);
  if(!member.currencies.has(currencyKey))member.currencies.set(currencyKey,{...row,TOTAL_AMOUNT:0,PURCHASE_COUNT:0});
  const total=member.currencies.get(currencyKey);total.TOTAL_AMOUNT+=Number(row.TOTAL_AMOUNT);total.PURCHASE_COUNT+=Number(row.PURCHASE_COUNT);
 }
 const rows=[];
 for(const member of members.values()){
  if(!(input.purchasePeriodMatch==='any'?member.flags.some(Boolean):member.flags.every(Boolean)))continue;
  for(const row of member.currencies.values()){
   row.RECURRENCE_MONTHS=member.dates.size;
   if(input.amountMin!=null&&row.TOTAL_AMOUNT<input.amountMin||input.amountMax!=null&&row.TOTAL_AMOUNT>input.amountMax||input.recurrenceMin!=null&&row.RECURRENCE_MONTHS<input.recurrenceMin||input.recurrenceMax!=null&&row.RECURRENCE_MONTHS>input.recurrenceMax)continue;
   rows.push(row);
  }
 }
 const totals=new Map();for(const row of rows){const id=String(row.DOCUMENT_NUMBER);if(!totals.has(id))totals.set(id,{count:0});totals.get(id).count+=row.PURCHASE_COUNT;}
 const metric=input.orderBy??'totalAmount',direction=input.orderDirection==='asc'?1:-1;
 rows.sort((a,b)=>{
  const value=r=>metric==='purchaseCount'?totals.get(String(r.DOCUMENT_NUMBER)).count:metric==='recurrenceMonths'?r.RECURRENCE_MONTHS:metric==='fullName'?r.NAME_ORDER:r.TOTAL_AMOUNT;
  return direction*(value(a)-value(b))||a.NAME_ORDER-b.NAME_ORDER||a.DOCUMENT_ORDER-b.DOCUMENT_ORDER||a.CURRENCY_ORDER-b.CURRENCY_ORDER;
 });
 return rows;
}

export function dailySegmentationBreakdown(daily,selected,dimension){
 const eligible=new Set(selected.map(r=>JSON.stringify([String(r.DOCUMENT_NUMBER),key(r)]))),map=new Map();
 for(const row of daily){
  if(!eligible.has(JSON.stringify([String(row.DOCUMENT_NUMBER),key(row)])))continue;
  const value={category:row.CATEGORY_ID,customer:row.CUSTOMER_ID,month:row.PURCHASE_DAY.slice(0,7),year:row.PURCHASE_DAY.slice(0,4)}[dimension]??null;
  const groupKey=JSON.stringify([value==null?null:String(value),key(row)]);
  if(!map.has(groupKey))map.set(groupKey,{DIMENSION_KEY:value,CURRENCY_DESCRIPTION:row.CURRENCY_DESCRIPTION,CURRENCY_SYMBOL:row.CURRENCY_SYMBOL,TOTAL_AMOUNT:0,PURCHASE_COUNT:0,ids:new Set()});
  const g=map.get(groupKey);g.ids.add(String(row.DOCUMENT_NUMBER));g.TOTAL_AMOUNT+=Number(row.TOTAL_AMOUNT);g.PURCHASE_COUNT+=Number(row.PURCHASE_COUNT);
 }
 return [...map.values()].map(({ids,...row})=>({...row,MEMBER_COUNT:ids.size}));
}
