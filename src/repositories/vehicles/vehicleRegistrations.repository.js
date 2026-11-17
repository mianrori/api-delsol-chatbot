import { executeOracleQuery } from "../../database/oracle-query.database.js";

// Fixed SQL expressions only. All user-provided filter values are bound.
const dimensions = {
  day: ["TO_CHAR(FECHA_ALTA, 'YYYY-MM-DD')", "DAY"],
  month: ["TO_CHAR(FECHA_ALTA, 'YYYY-MM')", "MONTH"], year: ["TO_CHAR(FECHA_ALTA, 'YYYY')", "YEAR"],
  gender: ["GENDER", "GENDER"], age: ["AGE", "AGE"],
  ageRange: ["CASE WHEN AGE IS NULL THEN 'Sin datos' WHEN AGE < 18 THEN '0-17' WHEN AGE < 30 THEN '18-29' WHEN AGE < 40 THEN '30-39' WHEN AGE < 50 THEN '40-49' WHEN AGE < 60 THEN '50-59' ELSE '60+' END", "AGE_RANGE"],
  brand: ["MARCA", "BRAND"], model: ["MODELO", "MODEL"], color: ["COLOR", "COLOR"], active: ["ACTIVO", "ACTIVE"], automaticDebit: ["DEBITO_AUTOMATICO", "AUTOMATIC_DEBIT"],
};
export const getVehicleRegistrationsRepository = async ({ connection, ...args }) => {
  const { groupBy, mode, page, rows } = args;
  if (!Array.isArray(groupBy) || groupBy.some((key) => !Object.hasOwn(dimensions, key))) throw new Error("Agrupación inválida.");
  const demographic = groupBy.some((key) => ["gender", "age", "ageRange"].includes(key)) || args.gender != null || args.ageMin != null || args.ageMax != null;
  const binds = { dateFrom: args.dateFrom, dateTo: args.dateTo, active: "S" };
  const filters = ["V.ACTIVO = :active", "V.FECHA_ALTA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')", "V.FECHA_ALTA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1"];
  for (const [key, column] of [["automaticDebit", "DEBITO_AUTOMATICO"], ["brand", "MARCA"], ["model", "MODELO"], ["color", "COLOR"]]) {
    if (args[key] == null) continue;
    binds[key] = typeof args[key] === "boolean" ? (args[key] ? "S" : "N") : args[key].toUpperCase();
    filters.push(`UPPER(TRIM(V.${column})) = :${key}`);
  }
  const demographicFilters = [];
  if (args.gender != null) { binds.gender = { male: "M", female: "F", unknown: "Sin datos" }[args.gender]; demographicFilters.push("GENDER = :gender"); }
  for (const [key, operator] of [["ageMin", ">="], ["ageMax", "<="]]) if (args[key] != null) { binds[key] = args[key]; demographicFilters.push(`AGE ${operator} :${key}`); }
  let source;
  if (demographic) {
    const ageDate = args.ageReference === "registration" ? "TRUNC(V.FECHA_ALTA)" : "TO_DATE(:referenceDate, 'DD/MM/YYYY')";
    if (args.ageReference !== "registration") binds.referenceDate = args.referenceDate;
    const age = `TRUNC(MONTHS_BETWEEN(${ageDate}, S.FECHA_NACIMIENTO) / 12)`;
    // One demographic record per member prevents joins from multiplying registrations.
    // Conflicting demographic values are treated as unknown rather than chosen arbitrarily.
    source = `WITH members AS (
      SELECT COD_SOCIO,
        CASE WHEN COUNT(DISTINCT GENERO) = 1 THEN MIN(GENERO) END AS GENERO,
        CASE WHEN COUNT(DISTINCT FECHA_NACIMIENTO) = 1 THEN MIN(FECHA_NACIMIENTO) END AS FECHA_NACIMIENTO
      FROM VW_BOT_SOCIOS GROUP BY COD_SOCIO
    ), base AS (
      SELECT V.*, CASE WHEN S.GENERO IN ('M','F') THEN S.GENERO ELSE 'Sin datos' END AS GENDER,
        CASE WHEN S.FECHA_NACIMIENTO <= ${ageDate} AND ${age} BETWEEN 0 AND 120 THEN ${age} END AS AGE
      FROM VW_BOT_VEHICULOS V LEFT JOIN members S ON S.COD_SOCIO = V.COD_SOCIO
      WHERE ${filters.join(" AND ")}
    ), filtered AS (SELECT * FROM base ${demographicFilters.length ? `WHERE ${demographicFilters.join(" AND ")}` : ""})`;
  } else source = `WITH filtered AS (SELECT V.* FROM VW_BOT_VEHICULOS V WHERE ${filters.join(" AND ")})`;
  // Counts are independent of groups: distinct plates/members cannot be added across groups.
  const counts = "COUNT(*) AS VEHICLE_COUNT, COUNT(DISTINCT UPPER(TRIM(MATRICULA))) AS PLATE_COUNT, COUNT(DISTINCT COD_SOCIO) AS MEMBER_COUNT";
  const totals = (row) => ({ vehicleCount: Number(row?.VEHICLE_COUNT ?? 0), plateCount: Number(row?.PLATE_COUNT ?? 0), memberCount: Number(row?.MEMBER_COUNT ?? 0) });
  if (mode === "detail") {
    binds.startRow = (page - 1) * rows + 1; binds.endRow = page * rows;
    const result = await executeOracleQuery(connection, `${source}, ranked AS (
      SELECT filtered.*, ROW_NUMBER() OVER(ORDER BY FECHA_ALTA DESC NULLS LAST, MATRICULA, COD_SOCIO, MARCA, MODELO, COLOR, ACTIVO, DEBITO_AUTOMATICO) AS RN FROM filtered
    ), totals AS (SELECT ${counts} FROM filtered)
    SELECT P.*, T.VEHICLE_COUNT, T.PLATE_COUNT, T.MEMBER_COUNT, TO_CHAR(P.FECHA_ALTA, 'DD/MM/YYYY') AS REGISTRATION_DATE
    FROM totals T LEFT JOIN ranked P ON P.RN BETWEEN :startRow AND :endRow ORDER BY P.RN`, binds);
    const total = totals(result[0]);
    const data = result.filter((row) => row.RN != null).map((row) => ({
      plate: row.MATRICULA ?? null, documentNumber: row.COD_SOCIO == null ? null : String(row.COD_SOCIO), fullName: row.NOM_SOCIO ?? null,
      brand: row.MARCA ?? null, model: row.MODELO ?? null, color: row.COLOR ?? null, active: row.ACTIVO ?? null, automaticDebit: row.DEBITO_AUTOMATICO ?? null,
      registrationDate: row.REGISTRATION_DATE ?? null,
      ...(demographic ? { gender: row.GENDER ?? null, age: row.AGE ?? null } : {}),
    }));
    return { data, totals: total, pagination: { page, rows, returnedRows: data.length, totalRows: total.vehicleCount,
      totalPages: Math.ceil(total.vehicleCount / rows), hasMore: page * rows < total.vehicleCount,
      nextPage: page * rows < total.vehicleCount ? page + 1 : null } };
  }
  if (!groupBy.length) {
    const result = await executeOracleQuery(connection, `${source} SELECT ${counts} FROM filtered`, binds);
    return { data: [], totals: totals(result[0]) };
  }
  const fields = groupBy.map((key) => dimensions[key]);
  const result = await executeOracleQuery(connection, `${source}, grouped AS (
    SELECT ${fields.map(([expr, alias]) => `${expr} AS ${alias}`).join(", ")}, ${counts}
    FROM filtered GROUP BY ${fields.map(([expr]) => expr).join(", ")}
  ), totals AS (SELECT ${counts} FROM filtered)
  SELECT G.*, T.VEHICLE_COUNT AS TOTAL_VEHICLE_COUNT, T.PLATE_COUNT AS TOTAL_PLATE_COUNT, T.MEMBER_COUNT AS TOTAL_MEMBER_COUNT
  FROM totals T LEFT JOIN grouped G ON 1=1 ORDER BY ${fields.map(([, alias]) => `G.${alias} NULLS LAST`).join(", ")}`, binds);
  return { data: result.filter((row) => row.VEHICLE_COUNT != null).map((row) => ({ ...Object.fromEntries(groupBy.map((key) => [key, row[dimensions[key][1]] ?? null])), ...totals(row) })),
    totals: { vehicleCount: Number(result[0]?.TOTAL_VEHICLE_COUNT ?? 0), plateCount: Number(result[0]?.TOTAL_PLATE_COUNT ?? 0), memberCount: Number(result[0]?.TOTAL_MEMBER_COUNT ?? 0) } };
};
