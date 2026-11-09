// ERP invoice searches ignore whitespace and hyphens; never broaden a blank filter.
export function normalizeInvoicePlate(plate){
 if(plate==null)return undefined;
 if(typeof plate!=='string')throw new Error('La matr\u00edcula debe ser texto.');
 const normalized=plate.toUpperCase().replace(/[-\s]/g,'');
 if(!normalized)throw new Error('La matr\u00edcula no puede estar vac\u00eda.');
 return normalized;
}
