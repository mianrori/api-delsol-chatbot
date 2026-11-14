export function segmentationControl(input){
 const binds={},scope=[],eligible=[],metrics=[];
 const scopedPeriods=input.purchasePeriods??[];
 if(scopedPeriods.length){scope.push('('+scopedPeriods.map((p,i)=>{binds['from'+i]=p.dateFrom;binds['to'+i]=p.dateTo;return `(C.FECHA_COMPRA>=TO_DATE(:from${i},'DD/MM/YYYY') AND C.FECHA_COMPRA<TO_DATE(:to${i},'DD/MM/YYYY')+1)`;}).join(' OR ')+')');}
 else{binds.reference=input.referenceDate??'31/05/2023';binds.offset=1-(input.activityMonths??12);scope.push("C.FECHA_COMPRA>=ADD_MONTHS(TRUNC(TO_DATE(:reference,'DD/MM/YYYY'),'MM'),:offset) AND C.FECHA_COMPRA<TO_DATE(:reference,'DD/MM/YYYY')+1");}
 for(const [field,column] of [['customerIds','COD_CLIENTE'],['categoryIds','COD_RUBRO']])if(input[field]?.length)scope.push(`C.${column} IN (${input[field].map((v,i)=>{const key=field+i;binds[key]=v;return ':'+key;}).join(',')})`);
 if(input.gender){binds.sex=input.gender==='male'?'M':'F';eligible.push('S.GENERO=:sex');}
 if(input.birthMonth!=null){binds.birth=input.birthMonth;eligible.push('EXTRACT(MONTH FROM S.FECHA_NACIMIENTO)=:birth');}
 for(const [key,op] of [['ageMin','>='],['ageMax','<=']])if(input[key]!=null){binds[key]=input[key];eligible.push(`TRUNC(MONTHS_BETWEEN(TRUNC(SYSDATE),S.FECHA_NACIMIENTO)/12)${op}:${key}`);}
 if(scopedPeriods.length){const conditions=scopedPeriods.map((p,i)=>`EXISTS(SELECT 1 FROM scoped C WHERE C.COD_SOCIO=S.COD_SOCIO AND C.FECHA_COMPRA>=TO_DATE(:from${i},'DD/MM/YYYY') AND C.FECHA_COMPRA<TO_DATE(:to${i},'DD/MM/YYYY')+1)`);eligible.push('('+conditions.join(input.purchasePeriodMatch==='any'?' OR ':' AND ')+')');}
 if(input.activityStatus==='inactive')eligible.push('NOT EXISTS(SELECT 1 FROM scoped C WHERE C.COD_SOCIO=S.COD_SOCIO)');
 else if(input.activityStatus==='active')eligible.push('EXISTS(SELECT 1 FROM scoped C WHERE C.COD_SOCIO=S.COD_SOCIO)');
 for(const [key,column,op] of [['amountMin','TOTAL_AMOUNT','>='],['amountMax','TOTAL_AMOUNT','<='],['recurrenceMin','RECURRENCE_MONTHS','>='],['recurrenceMax','RECURRENCE_MONTHS','<=']])if(input[key]!=null){binds[key]=input[key];metrics.push(`${column}${op}:${key}`);}
 const cte=`WITH scoped AS (SELECT C.* FROM VW_BOT_COMPRAS_SOCIO C WHERE ${scope.join(' AND ')}),
 eligible AS (SELECT DISTINCT S.COD_SOCIO,S.NOMBRE_COMPLETO,S.GENERO,S.FECHA_NACIMIENTO FROM VW_BOT_SOCIOS S ${eligible.length?'WHERE '+eligible.join(' AND '):''}),
 control_metrics AS (SELECT S.COD_SOCIO DOCUMENT_NUMBER,S.NOMBRE_COMPLETO FULL_NAME,S.GENERO GENDER,
 TO_CHAR(S.FECHA_NACIMIENTO,'DD/MM/YYYY') BIRTH_DATE,EXTRACT(MONTH FROM S.FECHA_NACIMIENTO) BIRTH_MONTH,
 TRUNC(MONTHS_BETWEEN(TRUNC(SYSDATE),S.FECHA_NACIMIENTO)/12) AGE,
 C.MONEDA CURRENCY_DESCRIPTION,C.SIMBOLO_MONEDA CURRENCY_SYMBOL,NVL(SUM(C.IMPORTE),0) TOTAL_AMOUNT,
 COUNT(C.COD_SOCIO) PURCHASE_COUNT,COUNT(DISTINCT TO_CHAR(C.FECHA_COMPRA,'YYYY-MM')) RECURRENCE_MONTHS
 FROM eligible S LEFT JOIN scoped C ON C.COD_SOCIO=S.COD_SOCIO GROUP BY S.COD_SOCIO,S.NOMBRE_COMPLETO,S.GENERO,S.FECHA_NACIMIENTO,C.MONEDA,C.SIMBOLO_MONEDA),
 selected AS (SELECT * FROM control_metrics ${metrics.length?'WHERE '+metrics.join(' AND '):''})`;
 const column={totalAmount:'TOTAL_AMOUNT',purchaseCount:'PURCHASE_COUNT',recurrenceMonths:'RECURRENCE_MONTHS',fullName:'FULL_NAME'}[input.orderBy??'totalAmount'];
 return {cte,binds,sql:`${cte} SELECT * FROM selected ORDER BY ${column} ${input.orderDirection==='asc'?'ASC':'DESC'},FULL_NAME ASC,DOCUMENT_NUMBER ASC,CURRENCY_DESCRIPTION,CURRENCY_SYMBOL`};
}
