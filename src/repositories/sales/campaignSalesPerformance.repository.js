import { executeOracleQuery } from "../../database/oracle-query.database.js";

// Campaign totals must retain the exact currency pair. Do not aggregate money
// first and attach MAX(currency), which can silently relabel a mixed amount.
export const getCampaignPeriodSales = async ({ connection, dateFrom, dateTo, customerIds = [], categoryIds = [] }) => {
  const binds = { dateFrom, dateTo };
  const where = ["FECHA>=TO_DATE(:dateFrom,'DD/MM/YYYY')", "FECHA<TO_DATE(:dateTo,'DD/MM/YYYY')+1"];
  for (const [column, values, prefix] of [["COD_CLIENTE", customerIds, "c"], ["COD_RUBRO", categoryIds, "r"]]) {
    if (!values.length) continue;
    const placeholders = values.map((value, index) => {
      binds[prefix + index] = value;
      return ":" + prefix + index;
    });
    where.push(`${column} IN (${placeholders.join(",")})`);
  }
  const rows=await executeOracleQuery(connection,`SELECT DES_MONEDA AS CURRENCY_DESCRIPTION,SIGLAS_MONEDA AS CURRENCY_ABBREVIATION,
    SUM(MONTO_TOTAL) AS TOTAL_AMOUNT,SUM(CANTIDAD_FACTURAS) AS TOTAL_INVOICES,COUNT(*) AS SOURCE_ROWS
    FROM VW_BOT_VENTAS_LOCALES WHERE ${where.join(' AND ')} GROUP BY DES_MONEDA,SIGLAS_MONEDA ORDER BY DES_MONEDA,SIGLAS_MONEDA`,binds);
  const data = rows.map(row => {
    const description = row.CURRENCY_DESCRIPTION ?? null;
    const abbreviation = row.CURRENCY_ABBREVIATION ?? null;
    const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    // Preserve the existing PYG display without assigning a symbol to other currencies.
    const symbol = normalize(description).includes("GUARANI") || normalize(abbreviation) === "PYG" || normalize(abbreviation).includes("GUARANI") ? "\u20b2" : null;
    return {
      currency: { description, abbreviation, symbol, symbolPosition: symbol ? "prefix" : null },
      totalAmount: Number(row.TOTAL_AMOUNT ?? 0),
      totalInvoices: Number(row.TOTAL_INVOICES ?? 0),
      sourceRows: Number(row.SOURCE_ROWS),
    };
  });
  return { data };
};

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
