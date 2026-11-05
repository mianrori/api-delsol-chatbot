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
