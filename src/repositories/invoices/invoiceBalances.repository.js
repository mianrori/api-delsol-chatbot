import oracledb from 'oracledb';
// This view has no USER_CAN_CONSULT column. Oracle controls its visibility.
// Nested CASE validates VARCHAR2 dates before TO_DATE (compatible with Oracle 11g).
const dueDateSql=`CASE WHEN REGEXP_LIKE(TRIM(VENCIMIENTO), '^[0-9]{2}/[0-9]{2}/[0-9]{4}$') THEN
 CASE WHEN SUBSTR(TRIM(VENCIMIENTO),4,2) BETWEEN '01' AND '12'
 AND SUBSTR(TRIM(VENCIMIENTO),7,4) BETWEEN '0001' AND '9999' THEN
  CASE WHEN SUBSTR(TRIM(VENCIMIENTO),1,2) BETWEEN '01' AND
   TO_CHAR(LAST_DAY(TO_DATE('01/' || SUBSTR(TRIM(VENCIMIENTO),4,7),'FXDD/MM/YYYY')),'DD')
  THEN TO_DATE(TRIM(VENCIMIENTO),'FXDD/MM/YYYY') END END END`;

function scopeSql(args) {
  const binds={asOfDate:args.asOfDate},where=["(DEUDA >= 0 OR DEUDA IS NULL)"];
  for(const [key,column]of [['customerIds','COD_CLIENTE'],['invoiceNumbers','NRO_FACTURA'],['invoiceSeries','SERIE_FACTURA'],['sectors','SECTOR'],['currencies','SIMBOLO_MONEDA'],['currencyCodes','COD_MONEDA']]){
    if(args[key].length){const list=args[key].map((value,index)=>{const bind=key+index;binds[bind]=value;return ':'+bind;});where.push(`${column} IN (${list.join(', ')})`);}
  }
  if(args.invoices.length){where.push('('+args.invoices.map((pair,i)=>{binds['exactSeries'+i]=pair.invoiceSeries;binds['exactNumber'+i]=pair.invoiceNumber;return '(SERIE_FACTURA=:exactSeries'+i+' AND NRO_FACTURA=:exactNumber'+i+')';}).join(' OR ')+')');}
  for(const [key,op]of [['dueDateFrom','>='],['dueDateTo','<=']])if(args[key]){binds[key]=args[key];where.push(`DUE_DATE ${op} TO_DATE(:${key},'DD/MM/YYYY')`);}
  const due={overdue:'DUE_DATE < REF_DATE',dueToday:'DUE_DATE = REF_DATE',upcoming:'DUE_DATE > REF_DATE',undated:'DUE_DATE IS NULL'};
  if(due[args.dueStatus])where.push(due[args.dueStatus]);
  const balance={pending:'DEUDA > 0',settled:'DEUDA = 0',unknown:'DEUDA IS NULL'};
  if(balance[args.debtStatus])where.push(balance[args.debtStatus]);
  for(const [key,column,op]of [['minDebt','DEUDA','>='],['maxDebt','DEUDA','<='],['minDaysOverdue','DAYS_OVERDUE','>='],['maxDaysOverdue','DAYS_OVERDUE','<=']])if(args[key]!==undefined){binds[key]=args[key];where.push(`${column} ${op} :${key}`);}
  return {binds,cte:`WITH dated AS (
   SELECT SERIE_FACTURA, NRO_FACTURA, SECTOR, VENCIMIENTO, COD_CLIENTE, NOM_CLIENTE, RAZON_SOCIAL, RUC, COD_MONEDA, SIMBOLO_MONEDA, DEUDA,
    ${dueDateSql} AS DUE_DATE, TO_DATE(:asOfDate,'DD/MM/YYYY') AS REF_DATE FROM VW_BOT_FACTURAS_SALDOS
  ), classified AS (
   SELECT dated.*, CASE WHEN DUE_DATE IS NOT NULL THEN GREATEST(REF_DATE-DUE_DATE,0) END AS DAYS_OVERDUE,
    CASE WHEN DUE_DATE IS NULL THEN 'undated' WHEN DUE_DATE<REF_DATE THEN 'overdue' WHEN DUE_DATE=REF_DATE THEN 'dueToday' ELSE 'upcoming' END AS DUE_STATUS,
    CASE WHEN DUE_DATE IS NULL THEN 'undated' WHEN DUE_DATE>REF_DATE THEN 'notDue' WHEN DUE_DATE=REF_DATE THEN 'dueToday'
     WHEN REF_DATE-DUE_DATE<=30 THEN '1-30' WHEN REF_DATE-DUE_DATE<=60 THEN '31-60' WHEN REF_DATE-DUE_DATE<=90 THEN '61-90'
     WHEN REF_DATE-DUE_DATE<=180 THEN '91-180' ELSE '181+' END AS AGING_BAND FROM dated
  ), identities AS (
   SELECT classified.*, COUNT(*) OVER (PARTITION BY SERIE_FACTURA,NRO_FACTURA) AS IDENTITY_COPIES
   FROM classified WHERE DEUDA>=0 OR DEUDA IS NULL
  ), filtered AS (SELECT * FROM identities ${where.length?'WHERE '+where.join(' AND '):''})`};
}

const numeric=v=>v==null?null:Number(v);
export async function getInvoiceBalancesRepository({connection,...args}) {
  const execute=(sql,binds={})=>connection.execute(sql,binds,{outFormat:4002,fetchInfo:{DEUDA:{type:oracledb.STRING}}});
  // Neither a symbol nor an invoice number is a proven business identifier.
  // Check Oracle access, but never sum/rank money or invent invoice identities.
  if(((args.mode==='detail'&&['debtDesc','debtAsc'].includes(args.orderBy))||args.minDebt!==undefined||args.maxDebt!==undefined)&&args.currencyCodes.length!==1){
    await execute('SELECT NRO_FACTURA FROM VW_BOT_FACTURAS_SALDOS WHERE 1=0');
    return {status:'REQUIRES_SOURCE_IDENTITY',currencyIdentity:'nativeCode',invoiceIdentity:'unverified',monetaryAggregationAvailable:false,
      reason:'La divisa dispone de COD_MONEDA, pero falta demostrar la clave de factura y la granularidad aditiva de cada registro. No se agregan deudas; ordenar o filtrar importes individuales requiere un único currencyCodes.',queryContext:args};
  }
  const {cte,binds}=scopeSql(args);
  const integritySql=`COUNT(*) AS TOTAL_ROWS,
   SUM(CASE WHEN IDENTITY_COPIES>1 THEN 1 ELSE 0 END) AS DUPLICATE_ROWS,
   SUM(CASE WHEN TRIM(SERIE_FACTURA) IS NULL OR TRIM(NRO_FACTURA) IS NULL THEN 1 ELSE 0 END) AS MISSING_IDENTITY_ROWS,
   SUM(CASE WHEN TRIM(COD_MONEDA) IS NULL THEN 1 ELSE 0 END) AS MISSING_CURRENCY_ROWS,
   SUM(CASE WHEN DEUDA IS NULL THEN 1 ELSE 0 END) AS UNKNOWN_DEBT_ROWS`;
  if(args.mode==='summary'){
    const fields={customer:['COD_CLIENTE','customerId'],invoice:['SERIE_FACTURA','invoiceSeries','NRO_FACTURA','invoiceNumber'],sector:['SECTOR','sector'],dueMonth:["TO_CHAR(DUE_DATE,'YYYY-MM')",'dueMonth'],dueStatus:['DUE_STATUS','dueStatus'],agingBand:['AGING_BAND','agingBand']};
    const dimensions=args.groupBy.flatMap(k=>{const f=fields[k];return Array.from({length:f.length/2},(_,i)=>[f[i*2],f[i*2+1]]);});
    const selected=dimensions.map(([col],i)=>col+' AS DIM'+i),grouped=['COD_MONEDA',...dimensions.map(([col])=>col)];
    const order={debtDesc:'DEUDA DESC',debtAsc:'DEUDA ASC',invoiceCountDesc:'INVOICE_COUNT DESC',group:'COD_MONEDA'}[args.orderBy];
    // Gate and sums share one Oracle statement snapshot. Never select a representative duplicate.
    const result=await execute(cte+`, integrity AS (SELECT ${integritySql} FROM filtered),
     grouped AS (SELECT COD_MONEDA,${selected.length?selected.join(',')+',':''} COUNT(*) INVOICE_COUNT,SUM(DEUDA) DEUDA FROM filtered
      WHERE NOT EXISTS (SELECT 1 FROM integrity WHERE NVL(DUPLICATE_ROWS,0)>0 OR NVL(MISSING_IDENTITY_ROWS,0)>0 OR NVL(MISSING_CURRENCY_ROWS,0)>0 OR NVL(UNKNOWN_DEBT_ROWS,0)>0)
      GROUP BY ${grouped.join(',')}), ranked AS (SELECT grouped.*,COUNT(*) OVER() GROUP_COUNT,
       ROW_NUMBER() OVER(PARTITION BY COD_MONEDA ORDER BY ${order}${dimensions.length?','+dimensions.map((_,i)=>'DIM'+i).join(','):''}) CURRENCY_RANK,
       ROW_NUMBER() OVER(ORDER BY COD_MONEDA,${order}${dimensions.length?','+dimensions.map((_,i)=>'DIM'+i).join(','):''}) RN FROM grouped)
     SELECT integrity.*, (SELECT COUNT(*) FROM grouped) TOTAL_GROUPS, ranked.* FROM integrity LEFT JOIN ranked ON ranked.RN>:offset AND ranked.RN<=:maxRow ORDER BY ranked.RN`,{...binds,offset:(args.page-1)*args.rows,maxRow:args.page*args.rows});
    const head=result.rows?.[0]??{},duplicates=Number(head.DUPLICATE_ROWS??0),missing=Number(head.MISSING_IDENTITY_ROWS??0),unknown=Number(head.UNKNOWN_DEBT_ROWS??0),currencyMissing=Number(head.MISSING_CURRENCY_ROWS??0);
    const blocked=duplicates>0||missing>0||unknown>0||currencyMissing>0;
    const data=blocked?undefined:(result.rows??[]).filter(r=>r.RN!=null).map(r=>({currencyCode:r.COD_MONEDA,...Object.fromEntries(dimensions.map(([,key],i)=>[key,r['DIM'+i]??null])),invoiceCount:Number(r.INVOICE_COUNT),debt:String(r.DEUDA),currencyRank:Number(r.CURRENCY_RANK)}));
    const totalGroups=Number(head.TOTAL_GROUPS??0),totalPages=Math.ceil(totalGroups/args.rows);
    return {status:blocked?'INCONSISTENT_HISTORY':'OK_SUMMARY',mode:'summary',queryContext:args,asOfDate:args.asOfDate,
      monetaryAggregationAvailable:!blocked,invoiceCount:blocked?null:Number(head.TOTAL_ROWS??0),duplicateRows:duplicates,missingIdentityRows:missing,unknownDebtRows:unknown,missingCurrencyRows:currencyMissing,
      warning:blocked?'Hay registros históricos inconsistentes o información incompleta; los cálculos afectados no se calculan.':null,
      data,page:args.page,rows:args.rows,totalRows:totalGroups,totalPages,hasMore:args.page<totalPages,nextPage:args.page<totalPages?args.page+1:null};
  }
  const counted=await execute(cte+` SELECT COUNT(*) AS TOTAL_ROWS, COUNT(DISTINCT NRO_FACTURA) AS DISTINCT_INVOICE_NUMBERS,
   SUM(CASE WHEN IDENTITY_COPIES>1 THEN 1 ELSE 0 END) AS DUPLICATE_ROWS,
   SUM(CASE WHEN TRIM(SERIE_FACTURA) IS NULL OR TRIM(NRO_FACTURA) IS NULL THEN 1 ELSE 0 END) AS MISSING_IDENTITY_ROWS,
   COUNT(DISTINCT CASE WHEN SERIE_FACTURA IS NOT NULL AND NRO_FACTURA IS NOT NULL THEN LENGTH(SERIE_FACTURA)||':'||SERIE_FACTURA||LENGTH(NRO_FACTURA)||':'||NRO_FACTURA END) AS DISTINCT_INVOICE_PAIRS,
   COUNT(DISTINCT COD_CLIENTE) AS DISTINCT_CUSTOMERS,
   SUM(CASE WHEN DEUDA IS NULL THEN 1 ELSE 0 END) AS UNKNOWN_DEBT_ROWS,
   SUM(CASE WHEN DUE_DATE IS NULL THEN 1 ELSE 0 END) AS INVALID_DUE_DATE_ROWS FROM filtered`,binds);
  const counts=counted.rows?.[0]??{},totalRows=Number(counts.TOTAL_ROWS??0),offset=(args.page-1)*args.rows;
  const order={debtDesc:'DEUDA DESC NULLS LAST',debtAsc:'DEUDA ASC NULLS LAST',dueDateAsc:'DUE_DATE ASC NULLS LAST',overdueDaysDesc:'DAYS_OVERDUE DESC NULLS LAST',invoiceNumber:'NRO_FACTURA'}[args.orderBy];
  const currencyOrder=['debtDesc','debtAsc'].includes(args.orderBy)?'COD_MONEDA, ':'';
  const result=await execute(cte+` SELECT * FROM (SELECT filtered.*, ROW_NUMBER() OVER (
   ORDER BY ${currencyOrder}${order}, SERIE_FACTURA, NRO_FACTURA, COD_CLIENTE, SECTOR, COD_MONEDA, SIMBOLO_MONEDA, VENCIMIENTO, NOM_CLIENTE, RAZON_SOCIAL, RUC, DEUDA) AS RN
   FROM filtered) WHERE RN>:offset AND RN<=:maxRow ORDER BY RN`,{...binds,offset,maxRow:offset+args.rows});
  const data=(result.rows??[]).map(row=>({invoiceSeries:row.SERIE_FACTURA??null,invoiceNumber:row.NRO_FACTURA??null,sector:row.SECTOR??null,dueDate:row.DUE_DATE==null?null:row.VENCIMIENTO?.trim(),
    dueStatus:row.DUE_STATUS,agingBand:row.AGING_BAND,daysOverdue:numeric(row.DAYS_OVERDUE),customerId:row.COD_CLIENTE??null,
    customerName:row.NOM_CLIENTE??null,businessName:row.RAZON_SOCIAL??null,taxId:row.RUC??null,currencySymbol:row.SIMBOLO_MONEDA??null,currencyCode:row.COD_MONEDA??null,debt:row.DEUDA==null?null:String(row.DEUDA),debtState:row.DEUDA==null?'unknown':/^0(?:\.0*)?$/.test(String(row.DEUDA))?'settled':'pending'}));
  const totalPages=Math.ceil(totalRows/args.rows);
  return {status:'OK_DETAIL_ONLY',mode:'detail',asOfDate:args.asOfDate,debtBasis:'currentViewSnapshot',queryContext:args,groupBy:[],
    duplicateRows:Number(counts.DUPLICATE_ROWS??0),invoiceCount:Number(counts.DUPLICATE_ROWS??0)||Number(counts.MISSING_IDENTITY_ROWS??0)?null:totalRows,
    warning:Number(counts.DUPLICATE_ROWS??0)||Number(counts.MISSING_IDENTITY_ROWS??0)?'Hay registros históricos inconsistentes: se conserva el detalle sin deduplicar; no se calculan totales, rankings ni conteos de facturas.':null,
    currencyIdentity:'nativeCode',invoiceIdentity:'scopeCheckedSeriesNumber',monetaryAggregationAvailable:false,
    matchedCustomers:Number(counts.DISTINCT_CUSTOMERS??0),matchedInvoiceNumbers:Number(counts.DISTINCT_INVOICE_NUMBERS??0),matchedInvoicePairs:Number(counts.DISTINCT_INVOICE_PAIRS??0),
    unknownDebtRows:Number(counts.UNKNOWN_DEBT_ROWS??0),invalidDueDateRows:Number(counts.INVALID_DUE_DATE_ROWS??0),
    page:args.page,rows:args.rows,totalRows,totalPages,returnedRows:data.length,hasMore:args.page<totalPages,nextPage:args.page<totalPages?args.page+1:null,previousPage:args.page>1?args.page-1:null,data};
}

export async function searchInvoiceBalanceCustomersRepository({connection,query}) {
  const normalized=column=>`UPPER(REGEXP_REPLACE(TRANSLATE(NVL(${column},''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN'),'[^A-Za-z0-9]',''))`;
  const q=query.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'');
  if(!q)throw new Error('La búsqueda debe contener letras o números.');
  const exact=`${normalized('COD_CLIENTE')}=:query OR ${normalized('RUC')}=:query OR ${normalized('NOM_CLIENTE')}=:query OR ${normalized('RAZON_SOCIAL')}=:query`;
  const where=`(${exact} OR INSTR(${normalized('NOM_CLIENTE')},:query)>0 OR INSTR(${normalized('RAZON_SOCIAL')},:query)>0)`;
  const result=await connection.execute(`SELECT * FROM (
   SELECT COD_CLIENTE, MAX(NOM_CLIENTE) AS CUSTOMER_NAME, MAX(RAZON_SOCIAL) AS BUSINESS_NAME, MAX(RUC) AS TAX_ID,
    MIN(CASE WHEN ${exact} THEN 0 ELSE 1 END) AS PRIORITY FROM VW_BOT_FACTURAS_SALDOS WHERE (DEUDA >= 0 OR DEUDA IS NULL) AND COD_CLIENTE IS NOT NULL AND ${where}
   GROUP BY COD_CLIENTE ORDER BY PRIORITY, CUSTOMER_NAME, COD_CLIENTE) WHERE ROWNUM<=21`,{query:q},{outFormat:4002});
  // Exact matches take precedence only if the bounded page is not truncated.
  const rows=result.rows??[],exactRows=rows.filter(r=>Number(r.PRIORITY)===0);
  return (rows.length<=20&&exactRows.length?exactRows:rows).map(r=>({customerId:r.COD_CLIENTE,customerName:r.CUSTOMER_NAME??null,businessName:r.BUSINESS_NAME??null,taxId:r.TAX_ID??null}));
}
