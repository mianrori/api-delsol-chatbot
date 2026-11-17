import { executeOracleQuery } from "../../database/oracle-query.database.js";
import { contractBusinessConfig } from "../../config/contractBusiness.config.js";

export const getHistoricalContractByMonthRepository = async ({
  connection, customerId, dateFrom, dateTo, localNumber,
  contractType, contractSeries, contractNumber,
}) => {
  if (!connection || !customerId || !dateFrom || !dateTo) throw new Error("Conexión, cliente y período obligatorios.");
  const binds = { customerId: String(customerId).trim(), dateFrom, dateTo,
    contractType: contractType ?? contractBusinessConfig.currentContract.contractType };
  const filters = ["C.COD_CLIENTE = :customerId", "C.TIP_CONTRATO = :contractType"];
  for (const [key, column] of [["localNumber", "NRO_LOCAL"], ["contractSeries", "SER_CONTRATO"], ["contractNumber", "NRO_CONTRATO"]]) {
    const value = { localNumber, contractSeries, contractNumber }[key];
    if (value !== undefined && value !== null && value !== "") {
      binds[key] = key === "contractNumber" ? Number(value) : String(value).trim();
      filters.push(`C.${column} = :${key}`);
    }
  }
  const rows = await executeOracleQuery(connection, `
    WITH MONTHS AS (
      SELECT ADD_MONTHS(TRUNC(TO_DATE(:dateFrom, 'DD/MM/YYYY'), 'MM'), LEVEL - 1) AS MONTH_START
      FROM DUAL CONNECT BY LEVEL <= MONTHS_BETWEEN(TRUNC(TO_DATE(:dateTo, 'DD/MM/YYYY'), 'MM'),
        TRUNC(TO_DATE(:dateFrom, 'DD/MM/YYYY'), 'MM')) + 1
    ), PERIODS AS (
      SELECT MONTH_START, GREATEST(MONTH_START, TO_DATE(:dateFrom, 'DD/MM/YYYY')) AS PERIOD_START,
        LEAST(ADD_MONTHS(MONTH_START, 1), TO_DATE(:dateTo, 'DD/MM/YYYY') + 1) AS PERIOD_END
      FROM MONTHS
    ), CANDIDATES AS (
      SELECT M.MONTH_START, C.COD_CLIENTE, C.NOM_CLIENTE, C.RAZON_SOCIAL, C.NRO_LOCAL,
        C.TIP_CONTRATO, C.SER_CONTRATO, C.NRO_CONTRATO, C.FEC_CONTRATO, C.FEC_VENCIMIENTO, C.TOTAL_SUP_LOCAL,
        COUNT(C.TIP_CONTRATO) OVER (PARTITION BY M.MONTH_START) AS MATCH_COUNT,
        CASE WHEN C.FEC_CONTRATO <= M.PERIOD_START
          AND (C.FEC_VENCIMIENTO IS NULL OR C.FEC_VENCIMIENTO >= M.PERIOD_END - 1/86400)
          THEN 1 ELSE 0 END AS COVERS_PERIOD,
        ROW_NUMBER() OVER (PARTITION BY M.MONTH_START ORDER BY C.FEC_CONTRATO, C.NRO_CONTRATO, C.SER_CONTRATO) AS RN
      FROM PERIODS M LEFT JOIN VW_BOT_CONTRATOS_LOCALES C ON ${filters.join(" AND ")}
        AND C.FEC_CONTRATO < M.PERIOD_END
        AND (C.FEC_VENCIMIENTO IS NULL OR C.FEC_VENCIMIENTO >= M.PERIOD_START)
    )
    SELECT TO_CHAR(MONTH_START, 'MM/YYYY') AS PERIOD_MONTH, CANDIDATES.*
    FROM CANDIDATES WHERE RN = 1 ORDER BY MONTH_START
  `, binds);
  return rows.map((row) => {
    const count = Number(row.MATCH_COUNT ?? 0), unique = count === 1;
    const applicable = unique && Number(row.COVERS_PERIOD ?? 0) === 1;
    return {
      periodMonth: row.PERIOD_MONTH, customerId: row.COD_CLIENTE ?? null,
      customerName: row.NOM_CLIENTE ?? null, businessName: row.RAZON_SOCIAL ?? null,
      localNumber: unique ? row.NRO_LOCAL ?? null : null,
      contract: unique ? { type: row.TIP_CONTRATO, series: row.SER_CONTRATO, number: Number(row.NRO_CONTRATO) } : null,
      contractDate: unique ? row.FEC_CONTRATO : null, expirationDate: unique ? row.FEC_VENCIMIENTO : null,
      totalLocalArea: applicable && row.TOTAL_SUP_LOCAL != null && Number(row.TOTAL_SUP_LOCAL) > 0 ? Number(row.TOTAL_SUP_LOCAL) : null,
      applicable, matchCount: count,
      resolution: count > 1 ? "CONTRACT_AMBIGUOUS" : !count ? "CONTRACT_NOT_AVAILABLE" : applicable ? "APPLICABLE" : "CONTRACT_PARTIAL_PERIOD",
    };
  });
};
