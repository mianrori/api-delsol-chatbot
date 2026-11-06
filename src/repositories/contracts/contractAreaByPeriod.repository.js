import { executeOracleQuery } from "../../database/oracle-query.database.js";
import { contractBusinessConfig } from "../../config/contractBusiness.config.js";

export const getContractAreaByMonthRepository = async ({
  connection,
  customerId,
  dateFrom,
  dateTo,
}) => {
  if (!connection) throw new Error("connection es obligatorio.");
  if (!customerId) throw new Error("customerId es obligatorio.");
  if (!dateFrom || !dateTo) {
    throw new Error("dateFrom y dateTo son obligatorios.");
  }

  const sql = `
    WITH MONTHS AS (
      SELECT
        ADD_MONTHS(
          TRUNC(TO_DATE(:dateFrom, 'DD/MM/YYYY'), 'MM'),
          LEVEL - 1
        ) AS MONTH_START
      FROM DUAL
      CONNECT BY LEVEL <= MONTHS_BETWEEN(
        TRUNC(TO_DATE(:dateTo, 'DD/MM/YYYY'), 'MM'),
        TRUNC(TO_DATE(:dateFrom, 'DD/MM/YYYY'), 'MM')
      ) + 1
    ),
    MONTH_AREAS AS (
      SELECT
        M.MONTH_START,
        C.TOTAL_SUP_LOCAL
      FROM MONTHS M
      LEFT JOIN VW_BOT_CONTRATOS_LOCALES C
        ON C.COD_CLIENTE = :customerId
       AND C.TIP_CONTRATO = :contractType
       AND C.TOTAL_SUP_LOCAL > 0
       AND C.FEC_CONTRATO <= LAST_DAY(M.MONTH_START)
       AND (
         C.FEC_VENCIMIENTO IS NULL
         OR C.FEC_VENCIMIENTO >= M.MONTH_START
       )
    )
    SELECT
      TO_CHAR(MONTH_START, 'MM/YYYY') AS PERIOD_MONTH,
      MIN(TOTAL_SUP_LOCAL) AS MIN_AREA,
      MAX(TOTAL_SUP_LOCAL) AS MAX_AREA,
      COUNT(DISTINCT TOTAL_SUP_LOCAL) AS AREA_VALUE_COUNT
    FROM MONTH_AREAS
    GROUP BY MONTH_START
    ORDER BY MONTH_START
  `;

  const rows = await executeOracleQuery(connection, sql, {
    customerId: String(customerId),
    dateFrom,
    dateTo,
    contractType: contractBusinessConfig.currentContract.contractType,
  });

  return rows.map((row) => ({
    periodMonth: row.PERIOD_MONTH ?? null,
    minArea: row.MIN_AREA == null ? null : Number(row.MIN_AREA),
    maxArea: row.MAX_AREA == null ? null : Number(row.MAX_AREA),
    distinctValues: Number(row.AREA_VALUE_COUNT ?? 0),
  }));
};
