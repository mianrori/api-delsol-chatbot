import { executeOracleQuery } from "../../database/oracle-query.database.js";
export const getPromotionSelectionRepository = async ({connection,promotionIds=[],campaignIds=[]}) => {
  const filters=[],binds={};
  for(const [values,column,prefix] of [[promotionIds,'COD_PROMOCION','selectionPromotion'],[campaignIds,'COD_CAMPANIA','selectionCampaign']]){
    if(values.length)filters.push(`${column} IN (${values.map((v,i)=>{binds[prefix+i]=v;return ':'+prefix+i;}).join(', ')})`);
  }
  if(!filters.length)throw Error('Selección sin filtros.');
  const rows=await executeOracleQuery(connection,`SELECT COD_PROMOCION,COD_CAMPANIA,NOMBRE_PROMOCION,NOMBRE_CAMPANIA FROM VW_BOT_PROMOCIONES WHERE ${filters.join(' AND ')} ORDER BY COD_PROMOCION,COD_CAMPANIA,NOMBRE_PROMOCION,NOMBRE_CAMPANIA`,binds);
  return [...new Map(rows.filter(r=>r.COD_PROMOCION!=null&&r.COD_CAMPANIA!=null).map(r=>[JSON.stringify([String(r.COD_PROMOCION),Number(r.COD_CAMPANIA)]),{promotionId:String(r.COD_PROMOCION),campaignId:Number(r.COD_CAMPANIA),promotionName:r.NOMBRE_PROMOCION,campaignName:r.NOMBRE_CAMPANIA}])).values()];
};
