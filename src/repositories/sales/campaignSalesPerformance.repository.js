import { executeOracleQuery } from "../../database/oracle-query.database.js";

export const getCampaignForSalesAnalysis = async ({ connection, promotionId, campaignId }) => {
  const rows = await executeOracleQuery(connection, `
    SELECT COD_PROMOCION, COD_CAMPANIA, NOMBRE_PROMOCION, NOMBRE_CAMPANIA,
           TO_CHAR(FECHA_DESDE, 'DD/MM/YYYY') AS FECHA_DESDE,
           TO_CHAR(FECHA_HASTA, 'DD/MM/YYYY') AS FECHA_HASTA
      FROM VW_BOT_PROMOCIONES
     WHERE COD_PROMOCION = :promotionId
       AND COD_CAMPANIA = :campaignId
  `, { promotionId: String(promotionId), campaignId: String(campaignId) });
  if (rows.length !== 1) {
    throw new Error("No se pudo identificar una campaña única. Resuelve la promoción y la campaña antes de analizar las ventas.");
  }
  return rows[0];
};
