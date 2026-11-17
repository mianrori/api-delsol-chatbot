import {normalizeInvoicePlate} from '../../utils/invoicePlate.js';
// src/repositories/invoices.repository.js

const VALID_GROUP_BY = ["invoice", "customer", "concept", "month", "year"];

const VALID_METRICS = ["totalAmount", "invoiceCount"];

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  return [value];
};

const buildInClause = ({ values, prefix, binds }) => {
  if (!values.length) {
    return null;
  }

  const placeholders = values.map((value, index) => {
    const key = `${prefix}${index}`;

    binds[key] = value;

    return `:${key}`;
  });

  return placeholders.join(", ");
};

export const getInvoicesRepository = async ({
  connection,

  customerIds = [],
  conceptIds = [],

  dateFrom,
  dateTo,

  invoiceNumber,
  period,
  plate,

  cancelled,

  mode = "detail",

  groupBy = [],
  metrics = ["totalAmount", "invoiceCount"],

  page = 1,
  rows = 20,
}) => {
  customerIds = normalizeArray(customerIds);
  conceptIds = normalizeArray(conceptIds);
  groupBy = normalizeArray(groupBy);
  metrics = normalizeArray(metrics);

  if (!["detail", "summary"].includes(mode)) throw new Error("mode no soportado.");
  if (groupBy.some((item) => !VALID_GROUP_BY.includes(item))) throw new Error("groupBy no soportado.");
  if (!metrics.length || metrics.some((item) => !VALID_METRICS.includes(item))) throw new Error("metrics no soportado.");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(rows) || rows < 1 || rows > 100) {
    throw new Error("Paginación inválida.");
  }
  if (cancelled !== undefined && typeof cancelled !== "boolean") throw new Error("cancelled debe ser booleano.");
  const parseDate = (value) => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value));
    if (!match) throw new Error("Fecha inválida.");
    const [, day, month, year] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Fecha inválida.");
    return date;
  };
  const from = dateFrom === undefined ? null : parseDate(dateFrom);
  const to = dateTo === undefined ? null : parseDate(dateTo);
  if (from && to && from > to) throw new Error("Rango de fechas inválido.");

  const safeGroupBy = groupBy.filter((item) => VALID_GROUP_BY.includes(item));

  const safeMetrics = metrics.filter((item) => VALID_METRICS.includes(item));

  const binds = {};

  // Build the effective scope once, independently of row authorization.
  const filters = [];

  if (customerIds.length > 0) {
    const clause = buildInClause({
      values: customerIds,
      prefix: "customerId",
      binds,
    });

    filters.push(`COD_CLIENTE IN (${clause})`);
  }

  if (conceptIds.length > 0) {
    const clause = buildInClause({
      values: conceptIds,
      prefix: "conceptId",
      binds,
    });

    filters.push(`COD_CONCEPTO IN (${clause})`);
  }

  if (dateFrom) {
    binds.dateFrom = dateFrom;

    filters.push("FECHA_EMISION >= TO_DATE(:dateFrom, 'DD/MM/YYYY')");
  }

  if (dateTo) {
    binds.dateTo = dateTo;

    filters.push("FECHA_EMISION < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1");
  }

  if (invoiceNumber) {
    binds.invoiceNumber = `%${String(invoiceNumber).trim().toUpperCase()}%`;

    filters.push("UPPER(NRO_FACTURA) LIKE :invoiceNumber");
  }

  if (period) {
    binds.period = String(period).trim().toUpperCase();

    filters.push("UPPER(PERIODO) = :period");
  }

  const normalizedPlate=normalizeInvoicePlate(plate);
  if (normalizedPlate!==undefined) {
    binds.plate = normalizedPlate;

    filters.push(`
      REGEXP_REPLACE(UPPER(MATRICULA), '[-[:space:]]', '') = :plate
    `);
  }

  if (cancelled === true || cancelled === false) {
    binds.cancelled = cancelled ? "S" : "N";

    filters.push("NVL(ANULADO, 'N') = :cancelled");
  }

  // Mandatory for all data, totals, summaries and pagination; no bypass argument.
  const whereSql = `WHERE ${["NVL(USER_CAN_CONSULT, 'S') <> 'N'", ...filters].join("\n AND ")}`;
  // Only a permission bit leaves this probe: never restricted rows or counts.
  // Keep every requested filter, independently of the authorized page.
  const restrictedWhereSql = `WHERE ${["USER_CAN_CONSULT = 'N'", ...filters].join("\n AND ")}`;
  const restrictedFlagSql = `CASE WHEN EXISTS (
    SELECT 1 FROM VW_BOT_FACTURAS ${restrictedWhereSql}
  ) THEN 1 ELSE 0 END AS HAS_RESTRICTED_DATA`;

  /*
   * =============================================================
   * DETAIL MODE
   * =============================================================
   *
   * Oracle 11g no soporta:
   *
   * OFFSET :offset ROWS
   * FETCH NEXT :rows ROWS ONLY
   *
   * Por eso utilizamos ROW_NUMBER().
   *
   * Cada fila representa un concepto/detalle de una factura.
   */
  if (mode === "detail") {
    const safePage = Math.max(Number(page) || 1, 1);

    const safeRows = Math.max(Number(rows) || 20, 1);

    /*
     * El total se obtiene con exactamente los mismos filtros que el detalle.
     * COUNT(*) representa filas de detalle/concepto.
     * COUNT(DISTINCT NRO_FACTURA) representa facturas reales.
     */
    const countSql = `
      SELECT totals.*, ${restrictedFlagSql} FROM (
      SELECT
        COUNT(*) AS TOTAL_ROWS,
        COUNT(DISTINCT NRO_FACTURA) AS TOTAL_INVOICES
      FROM VW_BOT_FACTURAS
      ${whereSql}
      ) totals
    `;

    const countResult = await connection.execute(countSql, binds, {
      outFormat: 4002,
    });

    const totalRows = Number(
      countResult.rows?.[0]?.TOTAL_ROWS ?? 0,
    );

    const totalInvoices = Number(
      countResult.rows?.[0]?.TOTAL_INVOICES ?? 0,
    );

    const totalPages =
      totalRows > 0 ? Math.ceil(totalRows / safeRows) : 0;

    const offset = (safePage - 1) * safeRows;

    const maxRow = offset + safeRows;

    const detailBinds = {
      ...binds,
      offset,
      maxRow,
    };

    const sql = `
      SELECT
        FECHA_EMISION,
        NRO_FACTURA,
        CONDICION_VENTA,
        SECTOR,
        PDF,
        ANULADO,
        PERIODO,
        VENCIMIENTO,
        TIPO_CONTRATO,
        SERIE_CONTRATO,
        NRO_CONTRATO,
        COD_CLIENTE,
        NOM_CLIENTE,
        RAZON_SOCIAL,
        RUC,
        COD_CONCEPTO,
        DES_CONCEPTO,
        SIMBOLO_MONEDA,
        COTIZACION_MONEDA,
        PRECIO_UNITARIO,
        CANTIDAD,
        GRAVADA,
        EXENTA,
        IVA,
        IMPORTE,
        MATRICULA
      FROM (
        SELECT
          q.*,
          ROW_NUMBER() OVER (
            ORDER BY
              FECHA_EMISION DESC,
              NRO_FACTURA DESC,
              COD_CONCEPTO
          ) AS RN
        FROM (
          SELECT
            FECHA_EMISION,
            NRO_FACTURA,
            CONDICION_VENTA,
            SECTOR,
            PDF,
            ANULADO,
            PERIODO,
            VENCIMIENTO,
            TIPO_CONTRATO,
            SERIE_CONTRATO,
            NRO_CONTRATO,
            COD_CLIENTE,
            NOM_CLIENTE,
            RAZON_SOCIAL,
            RUC,
            COD_CONCEPTO,
            DES_CONCEPTO,
            SIMBOLO_MONEDA,
            COTIZACION_MONEDA,
            PRECIO_UNITARIO,
            CANTIDAD,
            GRAVADA,
            EXENTA,
            IVA,
            IMPORTE,
            MATRICULA
          FROM VW_BOT_FACTURAS
          ${whereSql}
        ) q
      )
      WHERE
        RN > :offset
        AND RN <= :maxRow
      ORDER BY RN
    `;

    const result = await connection.execute(sql, detailBinds, {
      outFormat: 4002,
    });

    const data = (result.rows ?? []).map((row) => ({
        issueDate: row.FECHA_EMISION ?? null,

        invoiceNumber: row.NRO_FACTURA ?? null,

        saleCondition: row.CONDICION_VENTA ?? null,

        sector: row.SECTOR ?? null,

        pdf: row.PDF ?? null,

        cancelled: row.ANULADO === "S",

        period: row.PERIODO ?? null,

        dueDate: row.VENCIMIENTO ?? null,

        contract: {
          type: row.TIPO_CONTRATO ?? null,

          series: row.SERIE_CONTRATO ?? null,

          number: row.NRO_CONTRATO ?? null,
        },

        customer: {
          customerId: row.COD_CLIENTE ?? null,

          name: row.NOM_CLIENTE ?? null,

          businessName: row.RAZON_SOCIAL ?? null,

          taxId: row.RUC ?? null,
        },

        concept: {
          conceptId: row.COD_CONCEPTO ?? null,

          description: row.DES_CONCEPTO ?? null,
        },

        currencySymbol: row.SIMBOLO_MONEDA ?? null,

        exchangeRate: row.COTIZACION_MONEDA ?? null,

        unitPrice: row.PRECIO_UNITARIO ?? null,

        quantity: row.CANTIDAD ?? null,

        taxableAmount: row.GRAVADA ?? null,

        exemptAmount: row.EXENTA ?? null,

        vatAmount: row.IVA ?? null,

        amount: row.IMPORTE ?? null,

        plate: row.MATRICULA ?? null,
      }));

    const returnedRows = data.length;
    const hasMore = safePage < totalPages;

    return {
      ...(Number(countResult.rows?.[0]?.HAS_RESTRICTED_DATA) === 1 ? {hasRestrictedData: true} : {}),
      page: safePage,
      rows: safeRows,
      returnedRows,
      totalRows,
      totalInvoices,
      totalPages,
      hasMore,
      nextPage: hasMore ? safePage + 1 : null,
      previousPage: safePage > 1 ? safePage - 1 : null,
      data,
    };
  }

  /*
   * =============================================================
   * SUMMARY MODE
   * =============================================================
   */

  const select = [];
  const groupBySql = [];
  const orderBySql = [];

  if (safeGroupBy.includes("invoice")) {
    select.push("NRO_FACTURA AS INVOICE_NUMBER");

    groupBySql.push("NRO_FACTURA");

    orderBySql.push("NRO_FACTURA");
  }

  if (safeGroupBy.includes("customer")) {
    select.push(
      "COD_CLIENTE AS CUSTOMER_ID",
      "MAX(NOM_CLIENTE) AS CUSTOMER_NAME",
      "MAX(RAZON_SOCIAL) AS BUSINESS_NAME",
      "MAX(RUC) AS TAX_ID",
    );

    groupBySql.push("COD_CLIENTE");

    orderBySql.push("COD_CLIENTE");
  }

  if (safeGroupBy.includes("concept")) {
    select.push(
      "COD_CONCEPTO AS CONCEPT_ID",
      "MAX(DES_CONCEPTO) AS CONCEPT_DESCRIPTION",
    );

    groupBySql.push("COD_CONCEPTO");

    orderBySql.push("COD_CONCEPTO");
  }

  if (safeGroupBy.includes("month")) {
    select.push("TO_CHAR(FECHA_EMISION, 'MM/YYYY') AS MONTH");

    groupBySql.push("TO_CHAR(FECHA_EMISION, 'MM/YYYY')");

    /*
     * Se ordena cronológicamente, no alfabéticamente.
     */
    orderBySql.push("MIN(TRUNC(FECHA_EMISION, 'MM'))");
  }

  if (safeGroupBy.includes("year")) {
    select.push("TO_CHAR(FECHA_EMISION, 'YYYY') AS YEAR");

    groupBySql.push("TO_CHAR(FECHA_EMISION, 'YYYY')");

    orderBySql.push("TO_CHAR(FECHA_EMISION, 'YYYY')");
  }

  if (safeMetrics.includes("totalAmount")) {
    select.push("SUM(IMPORTE) AS TOTAL_AMOUNT");
  }

  if (safeMetrics.includes("invoiceCount")) {
    /*
     * Cada factura puede contener varias filas
     * porque cada fila representa un concepto.
     */
    select.push("COUNT(DISTINCT NRO_FACTURA) AS INVOICE_COUNT");
  }

  // Cada moneda conserva sus propios importes y conteos, también sin dimensiones.
  select.push("SIMBOLO_MONEDA AS CURRENCY_SYMBOL");
  groupBySql.push("SIMBOLO_MONEDA");
  orderBySql.push("SIMBOLO_MONEDA");

  const groupClause =
    groupBySql.length > 0 ? `GROUP BY ${groupBySql.join(", ")}` : "";

  const orderClause =
    orderBySql.length > 0 ? `ORDER BY ${orderBySql.join(", ")}` : "";

  const sql = `
    SELECT
      ${select.join(",\n      ")}
    FROM VW_BOT_FACTURAS
    ${whereSql}
    ${groupClause}
    ${orderClause}
  `;

  const result = await connection.execute(sql, binds, {
    outFormat: 4002,
  });
  const access = await connection.execute(`SELECT ${restrictedFlagSql} FROM DUAL`, binds, {outFormat: 4002});
  const restricted = Number(access.rows?.[0]?.HAS_RESTRICTED_DATA) === 1
    ? {hasRestrictedData: true, hasAuthorizedData: (result.rows ?? []).length > 0} : {};

  const mapped = (result.rows ?? []).map((row) => ({
    invoiceNumber: row.INVOICE_NUMBER ?? undefined,

    customerId: row.CUSTOMER_ID ?? undefined,

    customerName: row.CUSTOMER_NAME ?? undefined,

    businessName: row.BUSINESS_NAME ?? undefined,

    taxId: row.TAX_ID ?? undefined,

    conceptId: row.CONCEPT_ID ?? undefined,

    conceptDescription: row.CONCEPT_DESCRIPTION ?? undefined,

    month: row.MONTH ?? undefined,

    year: row.YEAR ?? undefined,

    totalAmount: row.TOTAL_AMOUNT ?? undefined,

    invoiceCount: row.INVOICE_COUNT ?? undefined,

    currencySymbol: row.CURRENCY_SYMBOL ?? null,
  }));

  if (safeGroupBy.length === 0 && mapped.length <= 1) {
    return {
      ...(mapped[0] ?? {
        totalAmount: 0,
        invoiceCount: 0,
        currencySymbol: null,
      }),
      ...restricted,
    };
  }

  return {
    ...restricted,
    data: mapped,
  };
};
