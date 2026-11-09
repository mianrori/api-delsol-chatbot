const cell=value=>String(value).replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');

export function buildSalesScope(input={},scope={},restoreValue=v=>v){
 const names=(ids,rows,idKey,nameKey)=>{
  if(!Array.isArray(ids)||!ids.length)return null;
  const found=ids.map(id=>{
   const matches=(rows??[]).filter(row=>String(restoreValue(row[idKey]))===String(restoreValue(id)));
   if(matches.length!==1||typeof matches[0][nameKey]!=='string'||!matches[0][nameKey].trim())return null;
   const label=restoreValue(matches[0][nameKey]);
   return typeof label==='string'&&label.trim()&&!/\[PII_[A-Z_]+_\d+\]/.test(label)?cell(label.trim()):null;
  });
  return found.every(Boolean)?found.join(', '):null;
 };
 const hasLocal=Boolean(input.customerIds?.length),hasCategory=Boolean(input.categoryIds?.length);
 const customers=names(input.customerIds,scope?.customers,'customerId','customerName');
 const categories=names(input.categoryIds,scope?.categories,'categoryId','categoryName');
 let text;
 if(!hasLocal&&categories)text=`todos los locales ${input.categoryIds.length===1?'del rubro':'de los rubros'} ${categories}`;
 else if(customers&&categories)text=`${input.customerIds.length===1?'local':'locales'} ${customers}; ${input.categoryIds.length===1?'rubro':'rubros'} ${categories}`;
 else text=`${customers?`${input.customerIds.length===1?'local':'locales'} ${customers}`:hasLocal?'locales seleccionados':'todos los locales'}; ${categories?`${input.categoryIds.length===1?'rubro':'rubros'} ${categories}`:hasCategory?'rubros seleccionados':'todos los rubros'}`;
 return `Alcance: ${text}${input.dayType==='weekend'?'; fines de semana':input.dayType==='weekday'?'; días hábiles':''}.`;
}
