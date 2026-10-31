import { executeOracleQuery } from "../../database/oracle-query.database.js";
import { canUseMemberSummary } from "./memberSummary.repository.js";

const DIMENSIONS = {
  category: { select: "C.COD_RUBRO AS CATEGORY_ID, C.RUBRO AS CATEGORY_NAME", group: "C.COD_RUBRO, C.RUBRO", marker: "C.COD_RUBRO" },
  customer: { select: "C.COD_CLIENTE AS CUSTOMER_ID, C.LOCAL AS CUSTOMER_NAME", group: "C.COD_CLIENTE, C.LOCAL", marker: "C.COD_CLIENTE" },
  month: { select: "TO_CHAR(C.FECHA_COMPRA, 'YYYY-MM') AS MONTH", group: "TO_CHAR(C.FECHA_COMPRA, 'YYYY-MM')", marker: "TO_CHAR(C.FECHA_COMPRA, 'YYYY-MM')" },
  year: { select: "TO_CHAR(C.FECHA_COMPRA, 'YYYY') AS YEAR", group: "TO_CHAR(C.FECHA_COMPRA, 'YYYY')", marker: "TO_CHAR(C.FECHA_COMPRA, 'YYYY')" },
};

export const getMemberGroupedSummaryRepository = async (args, connection) => {
  const dimensions = args.breakdownBy;
  if (!Array.isArray(dimensions) || dimensions.length !== 1 || !DIMENSIONS[dimensions[0]] ||
    !canUseMemberSummary({ ...args, breakdownBy: [] })) return null;
  const dimension = dimensions[0];
  const config = DIMENSIONS[dimension];
  const period = args.purchasePeriods[0];
  const binds = { dateFrom: period.dateFrom, dateTo: period.dateTo };
  const filters = [];
  if (args.gender) {
    const gender = { male: "M", female: "F" }[args.gender];
    if (!gender) throw new Error(`Género no soportado: ${args.gender}`);
    binds.gender = gender;
    filters.push("S.GENERO = :gender");
  }
  if (args.birthMonth != null) {
    binds.birthMonth = Number(args.birthMonth);
    filters.push("EXTRACT(MONTH FROM S.FECHA_NACIMIENTO) = :birthMonth");
  }
  for (const [key, operator] of [["ageMin", ">="], ["ageMax", "<="]]) {
    if (args[key] != null) {
      binds[key] = Number(args[key]);
      filters.push(`TRUNC(MONTHS_BETWEEN(TRUNC(SYSDATE), S.FECHA_NACIMIENTO) / 12) ${operator} :${key}`);
    }
  }
  const startedAt = Date.now();
  // One aggregate statement produces the universe and each currency/group.
  // No personal rows or document lists leave Oracle; NULL groups remain data.
  const rows = await executeOracleQuery(connection, `
    SELECT
      CASE WHEN GROUPING(C.MONEDA) = 1 THEN 'universe'
        WHEN GROUPING(${config.marker}) = 1 THEN 'total' ELSE 'detail' END AS ROW_KIND,
      ${config.select}, C.MONEDA AS CURRENCY_DESCRIPTION, C.SIMBOLO_MONEDA AS CURRENCY_SYMBOL,
      COUNT(DISTINCT C.COD_SOCIO) AS MEMBER_COUNT,
      CASE WHEN GROUPING(C.MONEDA) = 0 THEN NVL(SUM(C.IMPORTE), 0) END AS TOTAL_AMOUNT,
      COUNT(*) AS PURCHASE_COUNT
    FROM VW_BOT_COMPRAS_SOCIO C
    INNER JOIN VW_BOT_SOCIOS S ON S.COD_SOCIO = C.COD_SOCIO
    WHERE C.FECHA_COMPRA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')
      AND C.FECHA_COMPRA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1
      ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
    GROUP BY GROUPING SETS (
      (${config.group}, C.MONEDA, C.SIMBOLO_MONEDA),
      (C.MONEDA, C.SIMBOLO_MONEDA), ()
    )
  `, binds);
  if (process.env.NODE_ENV === "development") {
    console.log(`[CHATBOT-DEV] MEMBER ANALYSIS GROUPED SUMMARY (${dimension}): ${Date.now() - startedAt} ms`);
  }
  const universe = rows.find((row) => row.ROW_KIND === "universe") ?? {};
  const currency = (row) => ({ description: row.CURRENCY_DESCRIPTION ?? null,
    symbol: /^(PYG|GUARANIES|GUARANÍES|₲)$/i.test(String(row.CURRENCY_SYMBOL ?? row.CURRENCY_DESCRIPTION))
      ? "₲" : row.CURRENCY_SYMBOL ?? null });
  const detail = rows.filter((row) => row.ROW_KIND === "detail").map((row) => ({
    ...(dimension === "category" ? { categoryId: row.CATEGORY_ID == null ? null : String(row.CATEGORY_ID), categoryName: row.CATEGORY_NAME ?? "Sin rubro" } : {}),
    ...(dimension === "customer" ? { customerId: row.CUSTOMER_ID == null ? null : String(row.CUSTOMER_ID), customerName: row.CUSTOMER_NAME ?? "Sin local" } : {}),
    ...(dimension === "month" ? { month: row.MONTH } : {}),
    ...(dimension === "year" ? { year: row.YEAR } : {}),
    currency: currency(row), memberCount: Number(row.MEMBER_COUNT ?? 0),
    totalAmount: Number(row.TOTAL_AMOUNT ?? 0), purchaseCount: Number(row.PURCHASE_COUNT ?? 0),
  }));
  return {
    memberCount: Number(universe.MEMBER_COUNT ?? 0), purchaseCount: Number(universe.PURCHASE_COUNT ?? 0),
    totalsByCurrency: rows.filter((row) => row.ROW_KIND === "total").map((row) => ({
      currency: currency(row), memberCount: Number(row.MEMBER_COUNT ?? 0),
      totalAmount: Number(row.TOTAL_AMOUNT ?? 0), purchaseCount: Number(row.PURCHASE_COUNT ?? 0),
    })),
    breakdown: { [dimension]: detail },
  };
};
