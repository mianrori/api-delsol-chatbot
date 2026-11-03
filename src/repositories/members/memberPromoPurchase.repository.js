import { executeOracleQuery } from "../../database/oracle-query.database.js";
import config from "../../../config.js";

export const promoDimensions = {
  month: ["TO_CHAR(FECHA_COMPRA, 'YYYY-MM')", "MONTH", (r) => ({ month: r.MONTH })],
  year: ["TO_CHAR(FECHA_COMPRA, 'YYYY')", "YEAR", (r) => ({ year: r.YEAR })],
  promotion: ["COD_PROMOCION, PROMOCION", null, (r) => ({ promotionId: r.COD_PROMOCION == null ? null : String(r.COD_PROMOCION), promotionName: r.PROMOCION })],
  campaign: ["COD_CAMPANIA, CAMPANIA", null, (r) => ({ campaignId: r.COD_CAMPANIA == null ? null : Number(r.COD_CAMPANIA), campaignName: r.CAMPANIA })],
  customer: ["COD_CLIENTE, LOCAL", null, (r) => ({ customerId: r.COD_CLIENTE == null ? null : String(r.COD_CLIENTE), customerName: r.LOCAL })],
  category: ["COD_RUBRO, RUBRO", null, (r) => ({ categoryId: r.COD_RUBRO == null ? null : String(r.COD_RUBRO), categoryName: r.RUBRO })],
  bankOrigin: ["NVL(ORIGEN_BANCARIO, 'N')", "BANK_ORIGIN", (r) => originFields(r.BANK_ORIGIN)],
};
export const promoPageLimit = () => Math.min(100, Number.isSafeInteger(Number(config.limitFilter)) && Number(config.limitFilter) > 0 ? Number(config.limitFilter) : 100);
const originFields = (v) => v === "S" ? { bankOrigin: true, origin: "Banco Atlas" }
  : v === "N" || v == null ? { bankOrigin: false, origin: "No bancario" } : { bankOrigin: null, origin: "Origen no identificado" };
const identifyCurrency = (v) => {
  const s = String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ["PYG", "GS", "GS.", "₲"].includes(s) || s.includes("GUARANI") ? "PYG" : ["USD", "$", "US$"].includes(s) || s.includes("DOLAR") ? "USD" : null;
};
const currencyFields = (r) => {
  const a = identifyCurrency(r.CURRENCY_SYMBOL), b = identifyCurrency(r.CURRENCY_DESCRIPTION);
  const code = String(r.CURRENCY_SYMBOL ?? "").trim() && !a ? null : a && b && a !== b ? null : a ?? b;
  return { code, description: r.CURRENCY_DESCRIPTION ?? null, symbol: r.CURRENCY_SYMBOL ?? null };
};
const addIn = (filters, binds, column, values, prefix) => {
  if (!values.length) return;
  const names = values.map((v, i) => { binds[prefix + i] = v; return ":" + prefix + i; });
  filters.push(`${column} IN (${names.join(", ")})`);
};
export const getMemberPromoPurchasesRepository = async ({ connection, documentNumber, promotionIds = [], campaignIds = [], customerIds = [], categoryIds = [],
  dateFrom, dateTo, origin, mode = "summary", groupBy = [], metrics = ["totalAmount", "purchaseCount"], page = 1, rows = 20 }) => {
  if (!connection || !documentNumber) throw Error("Conexión y documento obligatorios.");
  if (!groupBy.every((g) => Object.hasOwn(promoDimensions, g)) || !metrics.every((m) => ["totalAmount", "purchaseCount"].includes(m))) throw Error("Agrupación o métrica inválida.");
  const binds = { documentNumber: String(documentNumber) }, filters = ["COD_SOCIO = :documentNumber"];
  if (dateFrom && dateTo) {
    binds.dateFrom = dateFrom; binds.dateTo = dateTo;
    filters.push("FECHA_COMPRA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')", "FECHA_COMPRA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1");
  }
  for (const [column, values, prefix] of [["COD_PROMOCION", promotionIds, "promotionId"], ["COD_CAMPANIA", campaignIds, "campaignId"], ["COD_CLIENTE", customerIds, "customerId"], ["COD_RUBRO", categoryIds, "categoryId"]]) addIn(filters, binds, column, values, prefix);
  if (origin) { binds.bankOrigin = origin === "bank" ? "S" : "N"; filters.push("NVL(ORIGEN_BANCARIO, 'N') = :bankOrigin"); }
  const where = filters.join(" AND ");
  if (mode === "detail") {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(rows) || rows < 1) throw Error("Paginación inválida.");
    rows = Math.min(rows, promoPageLimit());
    const offset = (page - 1) * rows;
    if (!Number.isSafeInteger(offset + rows)) throw Error("Paginación fuera de rango.");
    // Counts always use the same current Oracle session and filters. Client/model
    // knownTotalRows is deliberately not accepted as pagination authority.
    const count = await executeOracleQuery(connection, `SELECT COUNT(*) AS TOTAL_ROWS FROM VW_BOT_FACTURAS_PROMO WHERE ${where}`, binds);
    const totalRows = Number(count[0]?.TOTAL_ROWS ?? 0), totalPages = Math.ceil(totalRows / rows);
    const data = await executeOracleQuery(connection, `
      SELECT * FROM (
        SELECT TO_CHAR(FECHA, 'DD/MM/YYYY') AS REGISTER_DATE, TO_CHAR(FECHA_COMPRA, 'DD/MM/YYYY') AS PURCHASE_DATE,
          COD_PROMOCION, PROMOCION, COD_CAMPANIA, CAMPANIA, COD_CLIENTE, LOCAL, COD_RUBRO, RUBRO,
          MONEDA AS CURRENCY_DESCRIPTION, SIMBOLO_MONEDA AS CURRENCY_SYMBOL,
          TO_CHAR(NRO_FACTURA) AS INVOICE_NUMBER, MONTO AS AMOUNT, ORIGEN_BANCARIO,
          ROW_NUMBER() OVER (ORDER BY FECHA_COMPRA DESC, FECHA DESC, NRO_FACTURA DESC,
            COD_PROMOCION, COD_CAMPANIA, COD_CLIENTE, COD_RUBRO, SIMBOLO_MONEDA, MONEDA,
            MONTO, ORIGEN_BANCARIO, LOCAL, RUBRO, PROMOCION, CAMPANIA) AS RESULT_ROW_NUMBER
        FROM VW_BOT_FACTURAS_PROMO WHERE ${where}
      ) WHERE RESULT_ROW_NUMBER BETWEEN :startRow AND :endRow ORDER BY RESULT_ROW_NUMBER
    `, { ...binds, startRow: offset + 1, endRow: offset + rows });
    return { documentNumber: String(documentNumber), mode, page, rows, totalRows, totalPages,
      startRow: data.length ? offset + 1 : null, endRow: data.length ? offset + data.length : null, returnedRows: data.length,
      hasMore: page < totalPages, nextPage: page < totalPages ? page + 1 : null,
      data: data.map((r) => ({ registerDate: r.REGISTER_DATE, purchaseDate: r.PURCHASE_DATE,
        promotion: { id: r.COD_PROMOCION == null ? null : String(r.COD_PROMOCION), name: r.PROMOCION },
        campaign: { id: r.COD_CAMPANIA == null ? null : Number(r.COD_CAMPANIA), name: r.CAMPANIA },
        customer: { id: r.COD_CLIENTE == null ? null : String(r.COD_CLIENTE), name: r.LOCAL },
        category: { id: r.COD_RUBRO == null ? null : String(r.COD_RUBRO), name: r.RUBRO },
        currency: currencyFields(r), invoiceNumber: r.INVOICE_NUMBER, amount: r.AMOUNT == null ? null : Number(r.AMOUNT),
        ...(r.AMOUNT == null ? {reason:"Importe ausente; no se sustituye por cero."} : {}), ...originFields(r.ORIGEN_BANCARIO) })) };
  }
  const fields = groupBy.map((g) => promoDimensions[g][0] + (promoDimensions[g][1] ? " AS " + promoDimensions[g][1] : ""));
  const groups = [...groupBy.map((g) => promoDimensions[g][0]), "MONEDA", "SIMBOLO_MONEDA"];
  const data = await executeOracleQuery(connection, `SELECT ${[...fields, "MONEDA AS CURRENCY_DESCRIPTION", "SIMBOLO_MONEDA AS CURRENCY_SYMBOL",
    "COUNT(*) AS SOURCE_ROWS", ...(metrics.includes("purchaseCount") ? ["COUNT(*) AS PURCHASE_COUNT"] : []),
    ...(metrics.includes("totalAmount") ? ["CASE WHEN COUNT(MONTO) = COUNT(*) THEN SUM(MONTO) ELSE NULL END AS TOTAL_AMOUNT"] : [])].join(", ")}
    FROM VW_BOT_FACTURAS_PROMO WHERE ${where} GROUP BY ${groups.join(", ")} ORDER BY ${groups.join(", ")}`, binds);
  return { documentNumber: String(documentNumber), mode, data: data.map((r) => {
    const currency = currencyFields(r);
    return { ...Object.assign({}, ...groupBy.map((g) => promoDimensions[g][2](r))), currency,
      ...(metrics.includes("purchaseCount") ? { purchaseCount: Number(r.PURCHASE_COUNT) } : {}),
      ...(metrics.includes("totalAmount") ? { totalAmount: currency.code && r.TOTAL_AMOUNT != null ? Number(r.TOTAL_AMOUNT) : null } : {}),
      ...(metrics.includes("totalAmount") && (!currency.code || r.TOTAL_AMOUNT == null) ? { reason: !currency.code ? "Moneda desconocida o contradictoria; importe agregado sin calcular." : "Hay importes ausentes; no se sustituyen por cero." } : {}) };
  }) };
};
