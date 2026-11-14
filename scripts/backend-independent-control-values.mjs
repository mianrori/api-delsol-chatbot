// Numeric soles-type IDs are numbers in the tool contract. Normalize Oracle
// NUMBER/CHAR representations for comparisons, preserving null versus zero.
export const sameSolesType = (a,b) => {
  if(a==null||b==null)return a==null&&b==null;
  const numeric=v=>/^-?\d+$/.test(String(v).trim())&&Number.isSafeInteger(Number(v));
  return numeric(a)&&numeric(b)&&Number(a)===Number(b);
};

export function monthPeriod(date) {
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(date));
  if(!m)throw Error('CONTROL_DATE_INVALID');
  const [day,month,year]=m.slice(1).map(Number),d=new Date(Date.UTC(year,month-1,day));
  if(year<100||d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)throw Error('CONTROL_DATE_INVALID');
  const mm=String(month).padStart(2,'0'),last=new Date(Date.UTC(year,month,0)).getUTCDate();
  return {dateFrom:`01/${mm}/${year}`,dateTo:`${last}/${mm}/${year}`};
}

export const remainingCases=new Set(['INDIVIDUAL_PURCHASES_TWO_MEMBERS','MEMBER_SOLES_HISTORY','SOLES_USAGE_COMBINED_FILTERS','SOLES_USAGE_MEMBER_RANKING','VEHICLE_REGISTRATION_AGE_DISTINCTS']);
export const diagnosticCases=new Set(['INDIVIDUAL_PURCHASES_TWO_MEMBERS','MEMBER_SOLES_HISTORY','VEHICLE_REGISTRATION_AGE_DISTINCTS']);
export const purchaseSamples=rows=>[...new Map(rows.filter(r=>r.COD_SOCIO!=null&&r.C!=null&&r.R!=null).map(r=>[String(r.COD_SOCIO),r])).values()].slice(0,2);
export const solesCases=new Set(['MEMBER_SOLES_HISTORY']);
export const currencyCases=new Set(['PURCHASES_VS_SALES_INDEPENDENT','COMPARISON_DOLLAR_COLLISION_ORACLE_CTE','AFFECTED_AND_MISSING_POSITIVE_HTTP']);
// node-oracledb distinguishes two arguments from three arguments with an
// undefined options value (the latter is NJS-005). Preserve the real overload.
export const forwardOracleExecute=(connection,text,binds,options)=>options===undefined
  ? connection.execute(text,binds) : connection.execute(text,binds,options);
// Match get_member_soles' existing input contract. This normalizes the input
// only; never trim/cast the database column or strip leading/internal digits.
export function normalizeSolesDocumentForControl(value){
  if(typeof value!=='string'||!value.trim())throw Error('CONTROL_DOCUMENT_REQUIRED');
  return value.trim();
}
