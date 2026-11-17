import { executeOracleQuery } from "../../database/oracle-query.database.js";

const fullMonthRange = (period) => {
  const parse = (value) => {
    const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? ""));
    if (!parts) return null;
    const [, day, month, year] = parts.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day ? date : null;
  };
  const from = parse(period?.dateFrom);
  const to = parse(period?.dateTo);
  return from && to && from <= to && from.getUTCDate() === 1 &&
    to.getUTCDate() === new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate();
};

export const canUseMemberSummary = (args) => {
  const supported = new Set([
    "resultMode", "purchasePeriods", "metrics", "breakdownBy", "gender",
    "birthMonth", "ageMin", "ageMax", "activityStatus",
  ]);
  return args.resultMode === "summary" && Object.keys(args).every((key) => supported.has(key)) &&
    Array.isArray(args.purchasePeriods) && args.purchasePeriods.length === 1 &&
    Boolean(fullMonthRange(args.purchasePeriods[0])) &&
    (!args.activityStatus || args.activityStatus === "active") &&
    (!args.breakdownBy || (Array.isArray(args.breakdownBy) && args.breakdownBy.length === 0)) &&
    (!args.metrics || (Array.isArray(args.metrics) && args.metrics.every((metric) =>
      ["totalAmount", "purchaseCount"].includes(metric))));
};

// The monthly view is the same PYG source used by the existing fast ranking.
// Unsupported filters or partial months retain the original query semantics.
export const getMemberSummaryRepository = async (args, connection) => {
  if (!canUseMemberSummary(args)) return null;
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
  const rows = await executeOracleQuery(connection, `
    SELECT COUNT(*) AS MEMBER_COUNT,
      NVL(SUM(TOTAL_AMOUNT), 0) AS TOTAL_AMOUNT,
      NVL(SUM(PURCHASE_COUNT), 0) AS PURCHASE_COUNT
    FROM (
      SELECT M.COD_SOCIO, SUM(M.TOTAL_AMOUNT) AS TOTAL_AMOUNT,
        SUM(M.PURCHASE_COUNT) AS PURCHASE_COUNT
      FROM MV_BOT_COMPRAS_SOCIO_MES M
      INNER JOIN VW_BOT_SOCIOS S ON S.COD_SOCIO = M.COD_SOCIO
      WHERE M.MES >= TO_DATE(:dateFrom, 'DD/MM/YYYY')
        AND M.MES < ADD_MONTHS(TRUNC(TO_DATE(:dateTo, 'DD/MM/YYYY'), 'MM'), 1)
        ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
      GROUP BY M.COD_SOCIO
    )
  `, binds);
  if (process.env.NODE_ENV === "development") {
    console.log(`[CHATBOT-DEV] MEMBER ANALYSIS MV SUMMARY: ${Date.now() - startedAt} ms`);
  }
  const row = rows[0] ?? {};
  return {
    memberCount: Number(row.MEMBER_COUNT ?? 0),
    totalAmount: Number(row.TOTAL_AMOUNT ?? 0),
    purchaseCount: Number(row.PURCHASE_COUNT ?? 0),
  };
};
