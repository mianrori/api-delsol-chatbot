import config from "../../../config.js";
import { executeOracleQuery } from "../../database/oracle-query.database.js";

export const searchCategoriesRepository = async (connection, search) => {
  const sql = `
    SELECT *
    FROM (
      SELECT
        COD_RUBRO,
        DESCRIPCION,
        UTL_MATCH.JARO_WINKLER_SIMILARITY(
          UPPER(
            REGEXP_REPLACE(
              TRANSLATE(
                DESCRIPCION,
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
      FROM VW_BOT_RUBROS_LOCALES
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
