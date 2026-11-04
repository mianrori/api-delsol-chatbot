import {analyzeMembers} from '../src/services/members/memberAnalysis.service.js';

// Read-only CTE fixtures: no tables, records, materialized views or grants change.
export async function checkSegmentationCases(connection,check){
 const members=`SELECT 'A' COD_SOCIO,'Synthetic A' NOMBRE_COMPLETO,CAST(NULL AS VARCHAR2(10)) GENERO,CAST(NULL AS DATE) FECHA_NACIMIENTO,CAST(NULL AS VARCHAR2(100)) EMAIL,'N' RECIBE_TELEMARKETING,CAST(NULL AS VARCHAR2(20)) TELEFONO FROM DUAL
 UNION ALL SELECT 'B','Synthetic B','F',CAST(NULL AS DATE),NULL,'N',NULL FROM DUAL
 UNION ALL SELECT 'C','Synthetic C',NULL,CAST(NULL AS DATE),NULL,'N',NULL FROM DUAL`;
 const purchases=[['A','2023-01-05','GUARANIES','PYG',100,'L','R'],['A','2023-01-06','DOLARES','USD',2,'L','R'],['A','2023-02-05','DOLARES','USD',3,'L2','R2'],['B','2023-01-07','GUARANIES','PYG',50,'L','R'],['B','2023-01-08','GUARANIES','PYG',25,'L2','R2']].map(([doc,date,desc,symbol,amount,local,category])=>`SELECT '${doc}' COD_SOCIO,DATE '${date}' FECHA_COMPRA,'${desc}' MONEDA,'${symbol}' SIMBOLO_MONEDA,${amount} IMPORTE,'${local}' COD_CLIENTE,'Synthetic ${local}' LOCAL,'${category}' COD_RUBRO,'Synthetic ${category}' RUBRO FROM DUAL`).join(' UNION ALL ');
 const fixture={execute:(sql,binds={},options={})=>{
  const definitions=[];if(sql.includes('VW_BOT_SOCIOS'))definitions.push(`fixture_members AS (${members})`);if(sql.includes('VW_BOT_COMPRAS_SOCIO'))definitions.push(`fixture_purchases AS (${purchases})`);
  const rewritten=sql.replaceAll('VW_BOT_SOCIOS','fixture_members').replaceAll('VW_BOT_COMPRAS_SOCIO','fixture_purchases').trim();
  return connection.execute(`WITH ${definitions.join(',')}${/^WITH\b/i.test(rewritten)?','+rewritten.replace(/^WITH\s+/i,''):' '+rewritten}`,binds,options);
 }};
 const january={dateFrom:'01/01/2023',dateTo:'31/01/2023'},february={dateFrom:'01/02/2023',dateTo:'28/02/2023'};
 const input={resultMode:'summary',purchasePeriods:[january],metrics:['totalAmount','purchaseCount','recurrenceMonths']};
 const r=await analyzeMembers({...input,connection:{execute:()=>{throw Error('UNTRUSTED_CONNECTION_REACHED');}},username:'UNTRUSTED'},fixture,'AUTHORIZED');
 check(r.summary.totalMatches===2&&r.summary.returnedCount===2&&r.summary.commerciallyActiveCount===2,'CTE_DISTINCT_MEMBERS_ACROSS_CURRENCIES');
 check(r.summary.purchaseCount===4&&r.summary.totalsByCurrency.length===2&&r.summary.totalsByCurrency.some(t=>t.currency.symbol==='PYG'&&t.totalAmount===175&&t.purchaseCount===3&&t.memberCount===2)&&r.summary.totalsByCurrency.some(t=>t.currency.symbol==='USD'&&t.totalAmount===2&&t.memberCount===1),'CTE_SUMMARY_MONEY_AND_COUNTS');
 const segment=await analyzeMembers({...input,breakdownBy:['gender','amountSegment','recurrenceSegment'],amountSegments:[{label:'Synthetic',min:0,max:1000}],recurrenceSegments:[{label:'Synthetic',min:1,max:2}]},fixture,'AUTHORIZED');
 check(segment.breakdown.gender.length===3&&segment.breakdown.gender.every(g=>g.currency&&g.memberCount===1),'CTE_MISSING_GENDER_GROUPS_BY_CURRENCY');
 check(segment.breakdown.amountSegments[0].totalAmount===null&&segment.breakdown.amountSegments[0].totalsByCurrency.length===2&&segment.breakdown.amountSegments[0].memberCount===2&&Boolean(segment.breakdown.amountSegments[0].reason),'CTE_AMOUNT_SEGMENT_NO_MIXED_TOTAL');
 check(segment.breakdown.recurrenceSegments[0].memberCount===2,'CTE_RECURRENCE_DISTINCT_MEMBERS');
 const group=await analyzeMembers({...input,breakdownBy:['category']},fixture,'AUTHORIZED');
 check(group.breakdown.category.length===3&&group.breakdown.category.some(g=>g.categoryId==='R'&&g.currency.symbol==='PYG'&&g.totalAmount===150&&g.memberCount===2)&&group.breakdown.category.some(g=>g.currency.symbol==='USD'&&g.totalAmount===2&&g.memberCount===1),'CTE_BREAKDOWN_GROUPS_RETAIN_CURRENCY');
 check(group.summary.totalMatches===2&&group.breakdown.category.reduce((n,g)=>n+g.memberCount,0)>group.summary.totalMatches,'CTE_GLOBAL_DISTINCT_NOT_SUM_OF_GROUPS');
 const all=await analyzeMembers({...input,purchasePeriods:[january,february],purchasePeriodMatch:'all'},fixture,'AUTHORIZED');
 check(all.summary.totalMatches===1&&all.summary.totalsByCurrency.some(t=>t.currency.symbol==='PYG'&&t.totalAmount===100)&&all.summary.totalsByCurrency.some(t=>t.currency.symbol==='USD'&&t.totalAmount===5),'CTE_ALL_PERIOD_MEMBERSHIP_ACROSS_CURRENCIES');
 const recurrence=await analyzeMembers({...input,purchasePeriods:[january,february],resultMode:'members',amountMin:0,orderBy:'recurrenceMonths',limit:1},fixture,'AUTHORIZED');
 check(recurrence.summary.returnedCount===1&&recurrence.members.length===2&&recurrence.members.every(m=>m.documentNumber==='A'&&m.recurrenceMonths===2&&m.birthDate===null&&m.age===null&&m.gender===null),'CTE_RANK_LIMIT_DISTINCT_MEMBERS_AND_RECURRENCE');
 let refused=false;try{await analyzeMembers({...input,resultMode:'members',amountMin:0,orderBy:'totalAmount',limit:1},fixture,'AUTHORIZED');}catch(e){refused=e.code==='MEMBER_RANKING_MULTIPLE_CURRENCIES';}check(refused,'CTE_NO_CROSS_CURRENCY_MONETARY_RANK');
 const inactive=await analyzeMembers({resultMode:'members',activityStatus:'inactive',activityMonths:5,referenceDate:'31/05/2023',orderBy:'fullName',limit:3},fixture,'AUTHORIZED');
 check(inactive.summary.totalMatches===1&&inactive.summary.commerciallyInactiveCount===1&&inactive.members[0]?.documentNumber==='C','CTE_INACTIVE_WITH_MISSING_DEMOGRAPHICS');
 let queried=false;const blocked={execute:()=>{queried=true;throw Error('UNEXPECTED_QUERY');}};let rejected=0;
 for(const fields of [{ageMin:40,ageMax:20},{gender:'unknown'},{purchasePeriodMatch:'unknown'},{purchasePeriods:[{dateFrom:'31/02/2023',dateTo:'01/03/2023'}]}])try{await analyzeMembers({...input,...fields},blocked,'AUTHORIZED');}catch{rejected++;}
 check(rejected===4&&!queried,'CTE_INVALID_FILTERS_BEFORE_ORACLE');
}
