import { executeOracleQuery } from "../../database/oracle-query.database.js";
// src/repositories/memberSoles.repository.js
// Compatible con Oracle 11g.

const VALID_STATUS = ["current", "expired", "all"];
const VALID_MODE = ["balance", "detail", "summary"];
const VALID_GROUP_BY = [
  "type",
  "month",
  "year",
  "expirationMonth",
  "expirationDate",
];

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
};

const buildInClause = ({ values, prefix, binds }) => {
  if (!values.length) return null;

  return values
    .map((value, index) => {
      const key = `${prefix}${index}`;
      binds[key] = value;
      return `:${key}`;
    })
    .join(", ");
};

export const getMemberSolesRepository = async ({
  connection,
  documentNumber,
  typeIds = [],
  status = "current",
  mode = "balance",
  groupBy = [],
  referenceDate,
  generationDateFrom,
  generationDateTo,
  expirationDateFrom,
  expirationDateTo,
  page = 1,
  rows = 20,
}) => {
  if (!documentNumber) throw new Error("documentNumber es obligatorio.");

  if (!VALID_STATUS.includes(status)) {
    throw new Error(`status inválido: ${status}`);
  }

  if (!VALID_MODE.includes(mode)) {
    throw new Error(`mode inválido: ${mode}`);
  }

  typeIds = normalizeArray(typeIds);
  groupBy = normalizeArray(groupBy);

  if (groupBy.some((item) => !VALID_GROUP_BY.includes(item))) throw new Error("Agrupación de soles no soportada.");
  if (status !== "all" && !referenceDate) throw new Error("La fecha de referencia es obligatoria para clasificar la vigencia.");
  const safeGroupBy = [...new Set(groupBy)];

  const binds = {
    documentNumber: String(documentNumber).trim(),
  };

  const where = ["COD_SOCIO = :documentNumber"];

  if (typeIds.length > 0) {
    const groups = [];
    for (let offset = 0; offset < typeIds.length; offset += 1000) {
      const clause = buildInClause({ values: typeIds.slice(offset, offset + 1000), prefix: `typeId${offset}_`, binds });
      groups.push(`COD_TIPO_SOL IN (${clause})`);
    }
    where.push(`(${groups.join(" OR ")})`);
  }

  if (referenceDate && status !== "all") {
    binds.referenceDate = referenceDate;

    if (status === "current") {
      where.push(`
        (
          VENCIMIENTO IS NULL
          OR VENCIMIENTO >= TO_DATE(:referenceDate, 'DD/MM/YYYY')
        )
      `);
    }

    if (status === "expired") {
      where.push(`
        VENCIMIENTO IS NOT NULL
        AND VENCIMIENTO < TO_DATE(:referenceDate, 'DD/MM/YYYY')
      `);
    }
  }

  if (generationDateFrom) {
    binds.generationDateFrom = generationDateFrom;

    where.push(`
      FECHA_ALTA >= TO_DATE(:generationDateFrom, 'DD/MM/YYYY')
    `);
  }

  if (generationDateTo) {
    binds.generationDateTo = generationDateTo;

    where.push(`
      FECHA_ALTA < TO_DATE(:generationDateTo, 'DD/MM/YYYY') + 1
    `);
  }

  if (expirationDateFrom) {
    binds.expirationDateFrom = expirationDateFrom;

    where.push(`
      VENCIMIENTO >= TO_DATE(:expirationDateFrom, 'DD/MM/YYYY')
    `);
  }

  if (expirationDateTo) {
    binds.expirationDateTo = expirationDateTo;

    where.push(`
      VENCIMIENTO < TO_DATE(:expirationDateTo, 'DD/MM/YYYY') + 1
    `);
  }

  const whereSql = `WHERE ${where.join("\n AND ")}`;

  /*
   * =============================================================
   * BALANCE
   * =============================================================
   */
  if (mode === "balance") {
    const sql = `
      SELECT
        MAX(NOM_SOCIO) AS MEMBER_NAME,
        NVL(SUM(NVL(SALDO, 0)), 0) AS BALANCE,
        COUNT(*) AS RECORD_COUNT
      FROM VW_BOT_SOLES_GENERADOS
      ${whereSql}
    `;

    const result = await executeOracleQuery(connection, sql, binds);

    const row = result[0] ?? {};

    return {
      documentNumber: String(documentNumber),
      memberName: row.MEMBER_NAME ?? null,
      balance: Number(row.BALANCE ?? 0),
      recordCount: Number(row.RECORD_COUNT ?? 0),
    };
  }

  /*
   * =============================================================
   * DETAIL
   * =============================================================
   */
  if (mode === "detail") {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeRows = Math.max(Number(rows) || 20, 1);
    const offset = (safePage - 1) * safeRows;
    const maxRow = offset + safeRows;

    binds.offset = offset;
    binds.maxRow = maxRow;

    const sql = `
      WITH filtered AS (
        SELECT COD_SOCIO, NOM_SOCIO, COD_TIPO_SOL, DES_TIPO_SOL,
               NRO_TRANSACCION, TOTAL, SALDO, FECHA_ALTA, VENCIMIENTO
          FROM VW_BOT_SOLES_GENERADOS ${whereSql}
      ), ranked AS (
        SELECT filtered.*, ROW_NUMBER() OVER (
          ORDER BY FECHA_ALTA DESC NULLS LAST, NRO_TRANSACCION DESC, COD_TIPO_SOL,
                   VENCIMIENTO NULLS LAST, TOTAL, SALDO
        ) AS RN FROM filtered
      )
      SELECT totals.TOTAL_ROWS, page_rows.COD_SOCIO, page_rows.NOM_SOCIO,
             page_rows.COD_TIPO_SOL, page_rows.DES_TIPO_SOL, page_rows.NRO_TRANSACCION,
             page_rows.TOTAL, page_rows.SALDO,
             TO_CHAR(page_rows.FECHA_ALTA, 'DD/MM/YYYY') AS FECHA_ALTA,
             TO_CHAR(page_rows.VENCIMIENTO, 'DD/MM/YYYY') AS VENCIMIENTO
        FROM (SELECT COUNT(*) AS TOTAL_ROWS FROM filtered) totals
        LEFT JOIN (SELECT * FROM ranked WHERE RN > :offset AND RN <= :maxRow) page_rows ON 1 = 1
       ORDER BY page_rows.RN
    `;

    const result = await executeOracleQuery(connection, sql, binds);

    const totalRows = Number(result[0]?.TOTAL_ROWS ?? 0);
    const detailRows = result.filter((row) => row.COD_SOCIO != null);
    return {
      page: safePage,
      rows: safeRows,
      totalRows,
      returnedRows: detailRows.length,
      totalPages: Math.ceil(totalRows / safeRows),
      hasMore: maxRow < totalRows,
      nextPage: maxRow < totalRows ? safePage + 1 : null,
      startRow: detailRows.length ? offset + 1 : null,
      endRow: detailRows.length ? offset + detailRows.length : null,
      data: detailRows.map((row) => ({
        documentNumber: row.COD_SOCIO ?? null,
        memberName: row.NOM_SOCIO ?? null,

        type: {
          typeId:
            row.COD_TIPO_SOL === null || row.COD_TIPO_SOL === undefined
              ? null
              : Number(row.COD_TIPO_SOL),

          description: row.DES_TIPO_SOL ?? null,
        },

        transactionNumber: row.NRO_TRANSACCION ?? null,

        generatedAmount: Number(row.TOTAL ?? 0),

        balance: Number(row.SALDO ?? 0),

        createdAt: row.FECHA_ALTA ?? null,

        expirationDate: row.VENCIMIENTO ?? null,
      })),
    };
  }

  /*
   * =============================================================
   * SUMMARY
   * =============================================================
   */
  const select = [];
  const groupBySql = [];
  const orderBySql = [];

  if (safeGroupBy.includes("type")) {
    select.push(
      "COD_TIPO_SOL AS TYPE_ID",
      "MAX(DES_TIPO_SOL) AS TYPE_DESCRIPTION",
    );

    groupBySql.push("COD_TIPO_SOL");

    orderBySql.push("COD_TIPO_SOL");
  }

  if (safeGroupBy.includes("month")) {
    select.push("TO_CHAR(FECHA_ALTA, 'MM/YYYY') AS MONTH");

    groupBySql.push("TO_CHAR(FECHA_ALTA, 'MM/YYYY')");

    orderBySql.push("MIN(TRUNC(FECHA_ALTA, 'MM'))");
  }

  if (safeGroupBy.includes("year")) {
    select.push("TO_CHAR(FECHA_ALTA, 'YYYY') AS YEAR");

    groupBySql.push("TO_CHAR(FECHA_ALTA, 'YYYY')");

    orderBySql.push("TO_CHAR(FECHA_ALTA, 'YYYY')");
  }

  if (safeGroupBy.includes("expirationMonth")) {
    select.push("TO_CHAR(VENCIMIENTO, 'MM/YYYY') AS EXPIRATION_MONTH");

    groupBySql.push("TO_CHAR(VENCIMIENTO, 'MM/YYYY')");

    orderBySql.push("MIN(TRUNC(VENCIMIENTO, 'MM'))");
  }

  /*
   * Agrupación por fecha exacta de vencimiento.
   * TO_CHAR(NULL, ...) ya devuelve NULL, por lo que no se necesita CASE.
   */
  if (safeGroupBy.includes("expirationDate")) {
    select.push("TO_CHAR(TRUNC(VENCIMIENTO), 'DD/MM/YYYY') AS EXPIRATION_DATE");

    groupBySql.push("TRUNC(VENCIMIENTO)");

    /*
     * Priorizamos los vencimientos más próximos.
     * Los registros sin vencimiento quedan al final.
     */
    orderBySql.unshift("TRUNC(VENCIMIENTO) NULLS LAST");
  }

  select.push(
    "MAX(NOM_SOCIO) AS MEMBER_NAME",
    "NVL(SUM(NVL(TOTAL, 0)), 0) AS GENERATED_AMOUNT",
    "NVL(SUM(NVL(SALDO, 0)), 0) AS BALANCE",
    "COUNT(*) AS RECORD_COUNT",
  );

  const groupClause =
    groupBySql.length > 0 ? `GROUP BY ${groupBySql.join(", ")}` : "";

  const orderClause =
    orderBySql.length > 0 ? `ORDER BY ${orderBySql.join(", ")}` : "";

  const sql = `
    SELECT
      ${select.join(",\n      ")}
    FROM VW_BOT_SOLES_GENERADOS
    ${whereSql}
    ${groupClause}
    ${orderClause}
  `;

  const result = await executeOracleQuery(connection, sql, binds);

  const mapped = result.map((row) => ({
    memberName: row.MEMBER_NAME ?? null,

    typeId: row.TYPE_ID == null ? undefined : Number(row.TYPE_ID),

    typeDescription: row.TYPE_DESCRIPTION ?? undefined,

    month: row.MONTH ?? undefined,

    year: row.YEAR ?? undefined,

    expirationMonth: row.EXPIRATION_MONTH ?? undefined,

    expirationDate: row.EXPIRATION_DATE ?? null,

    generatedAmount: Number(row.GENERATED_AMOUNT ?? 0),

    balance: Number(row.BALANCE ?? 0),

    recordCount: Number(row.RECORD_COUNT ?? 0),
  }));

  if (safeGroupBy.length === 0) {
    return (
      mapped[0] ?? {
        memberName: null,
        generatedAmount: 0,
        balance: 0,
        recordCount: 0,
      }
    );
  }

  return {
    data: mapped,
  };
};
