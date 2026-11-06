// Columns are repository constants; user search values are always binds.
export const oracleSearchText=column=>`UPPER(REGEXP_REPLACE(TRANSLATE(NVL(${column}, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN'), '[^A-Za-z0-9]', ''))`;
export const normalizeSearchText=value=>typeof value==='string'?value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''):'';
