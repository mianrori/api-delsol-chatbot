import { executeOracleQuery } from "../../database/oracle-query.database.js";

export const searchSolesUsageMovementTypesRepository = async ({ connection, search, limit = 20 }) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("El límite debe estar entre 1 y 50.");
  const query = String(search ?? "").trim().toUpperCase();
  return executeOracleQuery(connection, `
    SELECT * FROM (
      SELECT candidates.*, COUNT(*) OVER() AS TOTAL_MATCHES FROM (
        SELECT DISTINCT TIPO_MOVIMIENTO AS MOVEMENT_TYPE FROM VW_BOT_SOLES_UTILIZADOS WHERE TIPO_MOVIMIENTO IS NOT NULL
      ) candidates
      WHERE (:search IS NULL OR INSTR(UPPER(TRIM(MOVEMENT_TYPE)), :search) > 0)
      ORDER BY CASE WHEN UPPER(TRIM(MOVEMENT_TYPE)) = :search THEN 1 ELSE 2 END, MOVEMENT_TYPE
    ) WHERE ROWNUM <= :resultLimit
  `, { search: query || null, resultLimit: limit });
};
