import config from "../../../config.js";
import { executeOracleQuery } from "../../database/oracle-query.database.js";

export const searchCustomersRepository = async (connection, search) => {
  const sql = `
    SELECT *
    FROM (
      SELECT
        C.COD_CLIENTE,
        C.NOMBRE_FANTASIA,
        C.RAZON_SOCIAL,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM VW_BOT_CONTRATOS_LOCALES CL
            WHERE CL.COD_CLIENTE = C.COD_CLIENTE
              AND CL.TIP_CONTRATO = 'CNT'
              AND CL.ESTADO = 'A'
          )
          THEN 'S'
          ELSE 'N'
        END AS CONTRATO_ACTIVO,
        UTL_MATCH.JARO_WINKLER_SIMILARITY(
          UPPER(
            REGEXP_REPLACE(
              TRANSLATE(
                C.NOMBRE_FANTASIA,
                'ÁÉÍÓÚÜÑáéíóúüñ',
                'AEIOUUNAEIOUUN'
              ),
              '[^A-Za-z0-9]',
              ''
            )
          ),
          UPPER(
            REGEXP_REPLACE(
              TRANSLATE(
                :search,
                'ÁÉÍÓÚÜÑáéíóúüñ',
                'AEIOUUNAEIOUUN'
              ),
              '[^A-Za-z0-9]',
              ''
            )
          )
        ) AS SIMILARITY
      FROM VW_BOT_CLIENTES C
      ORDER BY SIMILARITY DESC
    )
    WHERE SIMILARITY >= :minSimilarity
      AND ROWNUM <= :limit
  `;

  return executeOracleQuery(connection, sql, {
    search,
    minSimilarity: Number(config.minSimilarity || 70),
    limit: Number(config.limitFilter || 5),
  });
};
