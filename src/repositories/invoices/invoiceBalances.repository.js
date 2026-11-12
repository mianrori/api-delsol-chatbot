// This view has no USER_CAN_CONSULT column. Oracle controls its visibility.
// Nested CASE validates VARCHAR2 dates before TO_DATE (compatible with Oracle 11g).
const dueDateSql=`CASE WHEN REGEXP_LIKE(TRIM(VENCIMIENTO), '^[0-9]{2}/[0-9]{2}/[0-9]{4}$') THEN
 CASE WHEN SUBSTR(TRIM(VENCIMIENTO),4,2) BETWEEN '01' AND '12'
 AND SUBSTR(TRIM(VENCIMIENTO),7,4) BETWEEN '0001' AND '9999' THEN
  CASE WHEN SUBSTR(TRIM(VENCIMIENTO),1,2) BETWEEN '01' AND
   TO_CHAR(LAST_DAY(TO_DATE('01/' || SUBSTR(TRIM(VENCIMIENTO),4,7),'FXDD/MM/YYYY')),'DD')
  THEN TO_DATE(TRIM(VENCIMIENTO),'FXDD/MM/YYYY') END END END`;

function scopeSql(args) {
  const binds={asOfDate:args.asOfDate},where=[];
  for(const [key,column]of [['customerIds','COD_CLIENTE'],['invoiceNumbers','NRO_FACTURA'],['sectors','SECTOR'],['currencies','SIMBOLO_MONEDA']]){
    if(args[key].length){const list=args[key].map((value,index)=>{const bind=key+index;binds[bind]=value;return ':'+bind;});where.push(`${column} IN (${list.join(', ')})`);}
  }
  for(const [key,op]of [['dueDateFrom','>='],['dueDateTo','<=']])if(args[key]){binds[key]=args[key];where.push(`DUE_DATE ${op} TO_DATE(:${key},'DD/MM/YYYY')`);}
  const due={overdue:'DUE_DATE < REF_DATE',dueToday:'DUE_DATE = REF_DATE',upcoming:'DUE_DATE > REF_DATE',undated:'DUE_DATE IS NULL'};
  if(due[args.dueStatus])where.push(due[args.dueStatus]);
  const balance={positive:'SALDO > 0',negative:'SALDO < 0',zero:'SALDO = 0',nonZero:'SALDO <> 0',unknown:'SALDO IS NULL'};
  if(balance[args.balanceStatus])where.push(balance[args.balanceStatus]);
  for(const [key,column,op]of [['minBalance','SALDO','>='],['maxBalance','SALDO','<='],['minDaysOverdue','DAYS_OVERDUE','>='],['maxDaysOverdue','DAYS_OVERDUE','<=']])if(args[key]!==undefined){binds[key]=args[key];where.push(`${column} ${op} :${key}`);}
  return {binds,cte:`WITH dated AS (
   SELECT NRO_FACTURA, SECTOR, VENCIMIENTO, COD_CLIENTE, NOM_CLIENTE, RAZON_SOCIAL, RUC, SIMBOLO_MONEDA, SALDO,
    ${dueDateSql} AS DUE_DATE, TO_DATE(:asOfDate,'DD/MM/YYYY') AS REF_DATE FROM VW_BOT_FACTURAS_SALDOS
  ), classified AS (
   SELECT dated.*, CASE WHEN DUE_DATE IS NOT NULL THEN GREATEST(REF_DATE-DUE_DATE,0) END AS DAYS_OVERDUE,
    CASE WHEN DUE_DATE IS NULL THEN 'undated' WHEN DUE_DATE<REF_DATE THEN 'overdue' WHEN DUE_DATE=REF_DATE THEN 'dueToday' ELSE 'upcoming' END AS DUE_STATUS,
    CASE WHEN DUE_DATE IS NULL THEN 'undated' WHEN DUE_DATE>REF_DATE THEN 'notDue' WHEN DUE_DATE=REF_DATE THEN 'dueToday'
     WHEN REF_DATE-DUE_DATE<=30 THEN '1-30' WHEN REF_DATE-DUE_DATE<=60 THEN '31-60' WHEN REF_DATE-DUE_DATE<=90 THEN '61-90'
     WHEN REF_DATE-DUE_DATE<=180 THEN '91-180' ELSE '181+' END AS AGING_BAND FROM dated
  ), filtered AS (SELECT * FROM classified ${where.length?'WHERE '+where.join(' AND '):''})`};
}

const metrics=`COUNT(*) AS TOTAL_ROWS, COUNT(DISTINCT NRO_FACTURA) AS INVOICE_COUNT, COUNT(DISTINCT COD_CLIENTE) AS CUSTOMER_COUNT,
 SUM(SALDO) AS TOTAL_BALANCE,
 SUM(CASE WHEN SALDO>0 THEN SALDO ELSE 0 END) AS POSITIVE_BALANCE,
 SUM(CASE WHEN SALDO<0 THEN SALDO ELSE 0 END) AS NEGATIVE_BALANCE,
 SUM(CASE WHEN DUE_STATUS='overdue' THEN SALDO ELSE 0 END) AS OVERDUE_BALANCE,
 SUM(CASE WHEN DUE_STATUS='dueToday' THEN SALDO ELSE 0 END) AS DUE_TODAY_BALANCE,
 SUM(CASE WHEN DUE_STATUS='upcoming' THEN SALDO ELSE 0 END) AS UPCOMING_BALANCE,
 SUM(CASE WHEN DUE_STATUS='undated' THEN SALDO ELSE 0 END) AS UNDATED_BALANCE,
 SUM(CASE WHEN SALDO IS NULL THEN 1 ELSE 0 END) AS UNKNOWN_BALANCE_ROWS,
 SUM(CASE WHEN DUE_DATE IS NULL THEN 1 ELSE 0 END) AS INVALID_DUE_DATE_ROWS,
 MAX(DAYS_OVERDUE) AS MAX_DAYS_OVERDUE`;
const numeric=(v)=>v==null?null:Number(v);
function mapMetrics(row) {
  return {currencySymbol:row.CURRENCY_SYMBOL??null,totalRows:Number(row.TOTAL_ROWS??0),invoiceCount:Number(row.INVOICE_COUNT??0),customerCount:Number(row.CUSTOMER_COUNT??0),
    totalBalance:numeric(row.TOTAL_BALANCE),positiveBalance:numeric(row.POSITIVE_BALANCE),negativeBalance:numeric(row.NEGATIVE_BALANCE),
    overdueBalance:numeric(row.OVERDUE_BALANCE),dueTodayBalance:numeric(row.DUE_TODAY_BALANCE),upcomingBalance:numeric(row.UPCOMING_BALANCE),undatedBalance:numeric(row.UNDATED_BALANCE),
    unknownBalanceRows:Number(row.UNKNOWN_BALANCE_ROWS??0),invalidDueDateRows:Number(row.INVALID_DUE_DATE_ROWS??0),maxDaysOverdue:numeric(row.MAX_DAYS_OVERDUE)};
}
const dimensions={
 customer:{group:'COD_CLIENTE',select:'COD_CLIENTE AS CUSTOMER_ID, MAX(NOM_CLIENTE) AS CUSTOMER_NAME, MAX(RAZON_SOCIAL) AS BUSINESS_NAME, MAX(RUC) AS TAX_ID'},
 invoice:{group:'NRO_FACTURA',select:'NRO_FACTURA AS INVOICE_NUMBER'},
 sector:{group:'SECTOR',select:'SECTOR'},
 dueMonth:{group:"TO_CHAR(DUE_DATE,'YYYY-MM')",select:"TO_CHAR(DUE_DATE,'YYYY-MM') AS DUE_MONTH"},
 dueStatus:{group:'DUE_STATUS',select:'DUE_STATUS'},agingBand:{group:'AGING_BAND',select:'AGING_BAND'},
};
export async function getInvoiceBalancesRepository({connection,...args}) {
  const {cte,binds}=scopeSql(args),execute=(sql,b=binds)=>connection.execute(sql,b,{outFormat:4002});
  const totals=await execute(`${cte} SELECT totals.*,
   (SELECT COUNT(DISTINCT COD_CLIENTE) FROM filtered) AS MATCHED_CUSTOMERS,
   (SELECT COUNT(DISTINCT NRO_FACTURA) FROM filtered) AS MATCHED_INVOICES
   FROM (SELECT SIMBOLO_MONEDA AS CURRENCY_SYMBOL, ${metrics} FROM filtered GROUP BY SIMBOLO_MONEDA) totals ORDER BY CURRENCY_SYMBOL`);
  const totalsByCurrency=(totals.rows??[]).map(mapMetrics);
  const groups=args.groupBy.map(g=>dimensions[g]),groupColumns=[...groups.map(g=>g.group),'SIMBOLO_MONEDA'];
  const grouped=`SELECT ${[...groups.map(g=>g.select),'SIMBOLO_MONEDA AS CURRENCY_SYMBOL',metrics].join(', ')} FROM filtered GROUP BY ${groupColumns.join(', ')}`;
  const totalRows=args.mode==='detail'?totalsByCurrency.reduce((n,r)=>n+r.totalRows,0):Number((await execute(`${cte} SELECT COUNT(*) AS TOTAL_GROUPS FROM (${grouped})`)).rows?.[0]?.TOTAL_GROUPS??0);
  const offset=(args.page-1)*args.rows,maxRow=offset+args.rows;
  const detailOrder={dueDateAsc:'DUE_DATE ASC NULLS LAST',balanceDesc:'SALDO DESC NULLS LAST',balanceAsc:'SALDO ASC NULLS LAST',overdueDaysDesc:'DAYS_OVERDUE DESC NULLS LAST',invoiceNumber:'NRO_FACTURA'};
  const summaryOrder={balanceDesc:'TOTAL_BALANCE DESC NULLS LAST',balanceAsc:'TOTAL_BALANCE ASC NULLS LAST',invoiceCountDesc:'INVOICE_COUNT DESC',group:'CURRENCY_SYMBOL'};
  // Currency is the leading sort key: ranks never compare unlike monetary units.
  const order=args.mode==='detail'?`SIMBOLO_MONEDA, ${detailOrder[args.orderBy]}, NRO_FACTURA, COD_CLIENTE, SECTOR, VENCIMIENTO, NOM_CLIENTE, RAZON_SOCIAL, RUC, SALDO`
    :`CURRENCY_SYMBOL, ${summaryOrder[args.orderBy]}, ${groups.map(g=>g.group).map(g=>g.startsWith('TO_CHAR')?'DUE_MONTH':g==='COD_CLIENTE'?'CUSTOMER_ID':g==='NRO_FACTURA'?'INVOICE_NUMBER':g).concat(['CURRENCY_SYMBOL']).join(', ')}`;
  const inner=args.mode==='detail'?'SELECT filtered.* FROM filtered':grouped;
  const result=await execute(`${cte} SELECT * FROM (SELECT result_rows.*, ROW_NUMBER() OVER (ORDER BY ${order}) AS RN FROM (${inner}) result_rows) WHERE RN>:offset AND RN<=:maxRow ORDER BY RN`,{...binds,offset,maxRow});
  const data=(result.rows??[]).map(row=>args.mode==='detail'?{
    invoiceNumber:row.NRO_FACTURA??null,sector:row.SECTOR??null,dueDate:row.DUE_DATE==null?null:row.VENCIMIENTO?.trim(),
    dueStatus:row.DUE_STATUS,agingBand:row.AGING_BAND,daysOverdue:numeric(row.DAYS_OVERDUE),
    customerId:row.COD_CLIENTE??null,customerName:row.NOM_CLIENTE??null,businessName:row.RAZON_SOCIAL??null,taxId:row.RUC??null,
    currencySymbol:row.SIMBOLO_MONEDA??null,balance:numeric(row.SALDO),
  }:{...mapMetrics(row),...Object.fromEntries(args.groupBy.flatMap(g=>g==='customer'?[['customerId',row.CUSTOMER_ID??null],['customerName',row.CUSTOMER_NAME??null],['businessName',row.BUSINESS_NAME??null],['taxId',row.TAX_ID??null]]:
    [[g==='invoice'?'invoiceNumber':g,g==='invoice'?row.INVOICE_NUMBER??null:g==='sector'?row.SECTOR??null:g==='dueMonth'?row.DUE_MONTH??null:g==='dueStatus'?row.DUE_STATUS:row.AGING_BAND]]))});
  const totalPages=Math.ceil(totalRows/args.rows);
  return {mode:args.mode,asOfDate:args.asOfDate,balanceBasis:'currentViewSnapshot',queryContext:args,groupBy:args.groupBy,totalsByCurrency,
    matchedCustomers:Number(totals.rows?.[0]?.MATCHED_CUSTOMERS??0),matchedInvoices:Number(totals.rows?.[0]?.MATCHED_INVOICES??0),
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
    MIN(CASE WHEN ${exact} THEN 0 ELSE 1 END) AS PRIORITY FROM VW_BOT_FACTURAS_SALDOS WHERE COD_CLIENTE IS NOT NULL AND ${where}
   GROUP BY COD_CLIENTE ORDER BY PRIORITY, CUSTOMER_NAME, COD_CLIENTE) WHERE ROWNUM<=21`,{query:q},{outFormat:4002});
  // Exact matches take precedence only if the bounded page is not truncated.
  const rows=result.rows??[],exactRows=rows.filter(r=>Number(r.PRIORITY)===0);
  return (rows.length<=20&&exactRows.length?exactRows:rows).map(r=>({customerId:r.COD_CLIENTE,customerName:r.CUSTOMER_NAME??null,businessName:r.BUSINESS_NAME??null,taxId:r.TAX_ID??null}));
}
