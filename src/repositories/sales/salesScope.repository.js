import {executeOracleQuery} from '../../database/oracle-query.database.js';

// Read catalog labels through the same authorized proxy connection as sales.
// A model proposal or a retained display label is never a source of names.
export async function getSalesScopeRepository(connection,{customerIds=[],categoryIds=[]}){
 const lookup=async(ids,{view,idColumn,nameColumn,idKey,nameKey})=>{
  const requested=[...new Set(ids.map(String))];if(!requested.length)return [];
  const binds=Object.fromEntries(requested.map((id,i)=>['scopeId'+i,id]));
  const rows=await executeOracleQuery(connection,`SELECT ${idColumn} AS SCOPE_ID, ${nameColumn} AS SCOPE_NAME FROM ${view} WHERE ${idColumn} IN (${Object.keys(binds).map(k=>':'+k).join(', ')})`,binds);
  // Match every name to its effective ID; do not choose between conflicting labels.
  return requested.flatMap(id=>{
   const names=[...new Set(rows.filter(row=>String(row.SCOPE_ID)===id&&typeof row.SCOPE_NAME==='string'&&row.SCOPE_NAME.trim()).map(row=>row.SCOPE_NAME.trim()))];
   return names.length===1?[{[idKey]:id,[nameKey]:names[0]}]:[];
  });
 };
 const customers=await lookup(customerIds,{view:'VW_BOT_CLIENTES',idColumn:'COD_CLIENTE',nameColumn:'NOMBRE_FANTASIA',idKey:'customerId',nameKey:'customerName'});
 const categories=await lookup(categoryIds,{view:'VW_BOT_RUBROS_LOCALES',idColumn:'COD_RUBRO',nameColumn:'DESCRIPCION',idKey:'categoryId',nameKey:'categoryName'});
 return {customers,categories};
}
