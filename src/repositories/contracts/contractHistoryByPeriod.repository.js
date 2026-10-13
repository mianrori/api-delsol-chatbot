import { executeOracleQuery } from "../../database/oracle-query.database.js";
import { contractBusinessConfig } from "../../config/contractBusiness.config.js";

export const getHistoricalContractByMonthRepository = async ({
  connection, customerId, dateFrom, dateTo, localNumber,
  contractType, contractSeries, contractNumber,
}) => {
  if (!connection) throw new Error("connection es obligatorio.");
  if (!customerId) throw new Error("customerId es obligatorio.");
  if (!dateFrom || !dateTo) throw new Error("dateFrom y dateTo son obligatorios.");

  const binds = {
    customerId: String(customerId).trim(),
    dateFrom,
    dateTo,
    contractType: contractType ?? contractBusinessConfig.currentContract.contractType,
  };

  const contractFilters = [
    "C.COD_CLIENTE = :customerId",
    "C.TIP_CONTRATO = :contractType",
    "C.FEC_CONTRATO <= LAST_DAY(M.MONTH_START)",
    "(C.FEC_VENCIMIENTO IS NULL OR C.FEC_VENCIMIENTO >= M.MONTH_START)",
  ];

  if (localNumber !== undefined && localNumber !== null && localNumber !== "") {
    binds.localNumber = String(localNumber).trim();
    contractFilters.push("C.NRO_LOCAL = :localNumber");
  }
  if (contractSeries) {
    binds.contractSeries = String(contractSeries).trim();
    contractFilters.push("C.SER_CONTRATO = :contractSeries");
  }
  if (contractNumber !== undefined && contractNumber !== null) {
    binds.contractNumber = Number(contractNumber);
    contractFilters.push("C.NRO_CONTRATO = :contractNumber");
  }

  const sql = `
    WITH MONTHS AS (
      SELECT ADD_MONTHS(TRUNC(TO_DATE(:dateFrom, 'DD/MM/YYYY'), 'MM'), LEVEL - 1) AS MONTH_START
      FROM DUAL
      CONNECT BY LEVEL <= MONTHS_BETWEEN(
        TRUNC(TO_DATE(:dateTo, 'DD/MM/YYYY'), 'MM'),
        TRUNC(TO_DATE(:dateFrom, 'DD/MM/YYYY'), 'MM')
      ) + 1
    ),
    CONTRACTS_BY_MONTH AS (
      SELECT
        M.MONTH_START, C.COD_CLIENTE, C.NOM_CLIENTE, C.RAZON_SOCIAL, C.NRO_LOCAL,
        C.TIP_CONTRATO, C.SER_CONTRATO, C.NRO_CONTRATO, C.FEC_CONTRATO,
        C.FEC_VENCIMIENTO, C.TOTAL_SUP_LOCAL,
        ROW_NUMBER() OVER (
          PARTITION BY M.MONTH_START
          ORDER BY C.FEC_CONTRATO DESC NULLS LAST, C.NRO_CONTRATO DESC, C.SER_CONTRATO DESC
        ) AS RN
      FROM MONTHS M
      LEFT JOIN VW_BOT_CONTRATOS_LOCALES C
        ON ${contractFilters.join("\n       AND ")}
    )
    SELECT TO_CHAR(MONTH_START, 'MM/YYYY') AS PERIOD_MONTH,
      COD_CLIENTE, NOM_CLIENTE, RAZON_SOCIAL, NRO_LOCAL,
      TIP_CONTRATO, SER_CONTRATO, NRO_CONTRATO, FEC_CONTRATO, FEC_VENCIMIENTO, TOTAL_SUP_LOCAL
    FROM CONTRACTS_BY_MONTH
    WHERE RN = 1
    ORDER BY MONTH_START
  `;

  const rows = await executeOracleQuery(connection, sql, binds);
  return rows.map((row) => ({
    periodMonth: row.PERIOD_MONTH ?? null,
    customerId: row.COD_CLIENTE ?? null,
    customerName: row.NOM_CLIENTE ?? null,
    businessName: row.RAZON_SOCIAL ?? null,
    localNumber: row.NRO_LOCAL ?? null,
    contract: row.TIP_CONTRATO && row.SER_CONTRATO && row.NRO_CONTRATO != null
      ? { type: row.TIP_CONTRATO, series: row.SER_CONTRATO, number: Number(row.NRO_CONTRATO) }
      : null,
    contractDate: row.FEC_CONTRATO ?? null,
    expirationDate: row.FEC_VENCIMIENTO ?? null,
    totalLocalArea: row.TOTAL_SUP_LOCAL == null ? null : Number(row.TOTAL_SUP_LOCAL),
  }));
};
