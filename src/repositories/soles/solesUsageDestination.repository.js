import { executeOracleQuery } from "../../database/oracle-query.database.js";

export const searchSolesUsageDestinationsRepository = async ({ connection, search, limit = 20 }) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("El límite debe estar entre 1 y 50.");
  const query = String(search ?? "").trim().toUpperCase();
  return executeOracleQuery(connection, `
    SELECT * FROM (
      SELECT candidates.*, COUNT(*) OVER() AS TOTAL_MATCHES FROM (
        SELECT DISTINCT TIPO_DESTINO AS DESTINATION_TYPE, COD_DESTINO AS DESTINATION_CODE, DESTINO AS DESTINATION_NAME FROM VW_BOT_SOLES_UTILIZADOS WHERE DESTINO IS NOT NULL AND COD_DESTINO IS NOT NULL
      ) candidates
      WHERE INSTR(UPPER(TRIM(DESTINATION_NAME)), :search) > 0
      ORDER BY CASE WHEN UPPER(TRIM(DESTINATION_NAME)) = :search THEN 1 ELSE 2 END, DESTINATION_NAME, DESTINATION_TYPE, DESTINATION_CODE
    ) WHERE ROWNUM <= :resultLimit
  `, { search: query, resultLimit: limit });
};
