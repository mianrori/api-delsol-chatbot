import {searchPromotionsRepository} from '../src/repositories/promotions/promotion.repository.js';

// All rows are synthetic SELECTs over DUAL. No DEV rows or schema are changed.
export async function checkSearchPromotionTies(connection,check){
 const values=[['Navidad Alpha','2023-12-31'],['Navidad Beta','2023-12-31'],['Navidad Alpha','2023-12-30'],['Navidad Alpha','2023-12-31']];
 const source=rows=>'fixture_promotions AS ('+rows.map(([name,end])=>`SELECT 'SYNTHETIC-P' COD_PROMOCION,1 COD_CAMPANIA,'${name}' NOMBRE_PROMOCION,'Synthetic campaign' NOMBRE_CAMPANIA,DATE '2023-12-01' FECHA_DESDE,DATE '${end}' FECHA_HASTA FROM DUAL`).join(' UNION ALL ')+')';
 const key=r=>JSON.stringify([String(r.COD_PROMOCION),Number(r.COD_CAMPANIA),r.NOMBRE_PROMOCION,r.NOMBRE_CAMPANIA,r.FECHA_DESDE,r.FECHA_HASTA]);
 const control=(await connection.execute(`WITH ${source(values)} SELECT DISTINCT COD_PROMOCION,COD_CAMPANIA,NOMBRE_PROMOCION,NOMBRE_CAMPANIA,TO_CHAR(FECHA_DESDE,'DD/MM/YYYY') FECHA_DESDE,TO_CHAR(FECHA_HASTA,'DD/MM/YYYY') FECHA_HASTA FROM fixture_promotions`)).rows;
 const expected=control.map(key).sort(),actual=[];
 for(let page=1;page<=4;page++){
  const fixture=source(page%2?values:[...values].reverse());
  const adapter={execute:(sql,binds)=>{
   const query=sql.trim().replaceAll('VW_BOT_PROMOCIONES','fixture_promotions');
   return connection.execute(/^WITH\b/i.test(query)?`WITH ${fixture}, ${query.replace(/^WITH\s+/i,'')}`:`WITH ${fixture} ${query}`,binds);
  }};
  const r=await searchPromotionsRepository(adapter,'Naviddad',{page,rows:1});
  check(r.matchMode==='approximate'&&r.totalRows===3&&r.totalPages===3,'ORACLE_TIED_OPTIONS_DISTINCT_TOTAL_'+page);
  check(r.hasMore===(page<3)&&r.nextPage===(page<3?page+1:null),'ORACLE_TIED_OPTIONS_END_METADATA_'+page);
  actual.push(...r.items.map(key));
 }
 check(JSON.stringify(actual)===JSON.stringify(expected),'ORACLE_TIED_OPTIONS_STABLE_FULL_SEQUENCE');
 check(actual.length===3&&new Set(actual).size===3,'ORACLE_TIED_OPTIONS_NO_REPETITIONS_OR_OMISSIONS');
}
