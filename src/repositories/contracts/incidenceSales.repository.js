import { executeOracleQuery } from "../../database/oracle-query.database.js";

// Preserve each source currency; MAX(currency) cannot validate a mixed total.
export const getIncidenceSalesRepository = async ({ connection, customerId, dateFrom, dateTo }) => {
  const rows = await executeOracleQuery(connection, `
    SELECT TO_CHAR(FECHA, 'MM/YYYY') AS PERIOD_MONTH, SIGLAS_MONEDA AS CURRENCY_CODE,
      DES_MONEDA AS CURRENCY_DESCRIPTION, SUM(MONTO_TOTAL) AS TOTAL_AMOUNT,
      COUNT(*) AS SALES_ROWS, SUM(CASE WHEN MONTO_TOTAL IS NULL THEN 1 ELSE 0 END) AS INVALID_ROWS
    FROM VW_BOT_VENTAS_LOCALES
    WHERE COD_CLIENTE = :customerId AND FECHA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')
      AND FECHA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1
    GROUP BY TO_CHAR(FECHA, 'MM/YYYY'), SIGLAS_MONEDA, DES_MONEDA
    ORDER BY TO_DATE(TO_CHAR(FECHA, 'MM/YYYY'), 'MM/YYYY'), SIGLAS_MONEDA, DES_MONEDA
  `, { customerId: String(customerId), dateFrom, dateTo });
  return rows.map((r) => ({ month: r.PERIOD_MONTH, amount: r.TOTAL_AMOUNT == null ? null : Number(r.TOTAL_AMOUNT),
    rowCount: Number(r.SALES_ROWS), invalidRows: Number(r.INVALID_ROWS ?? 0), code: r.CURRENCY_CODE, description: r.CURRENCY_DESCRIPTION }));
};
