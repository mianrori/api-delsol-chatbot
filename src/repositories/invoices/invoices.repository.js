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

  const safeGroupBy = groupBy.filter((item) => VALID_GROUP_BY.includes(item));

  const safeMetrics = metrics.filter((item) => VALID_METRICS.includes(item));

  const binds = {};

  /*
   * Filtro obligatorio de seguridad.
   * No existe ningún parámetro que permita desactivarlo.
   */
  const where = ["NVL(USER_CAN_CONSULT, 'S') <> 'N'"];

  if (customerIds.length > 0) {
    const clause = buildInClause({
      values: customerIds,
      prefix: "customerId",
      binds,
    });

    where.push(`COD_CLIENTE IN (${clause})`);
  }

  if (conceptIds.length > 0) {
    const clause = buildInClause({
      values: conceptIds,
      prefix: "conceptId",
      binds,
    });

    where.push(`COD_CONCEPTO IN (${clause})`);
  }

  if (dateFrom) {
    binds.dateFrom = dateFrom;

    where.push("FECHA_EMISION >= TO_DATE(:dateFrom, 'DD/MM/YYYY')");
  }

  if (dateTo) {
    binds.dateTo = dateTo;

    where.push("FECHA_EMISION < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1");
  }

  if (invoiceNumber) {
    binds.invoiceNumber = `%${String(invoiceNumber).trim().toUpperCase()}%`;

    where.push("UPPER(NRO_FACTURA) LIKE :invoiceNumber");
  }

  if (period) {
    binds.period = String(period).trim().toUpperCase();

    where.push("UPPER(PERIODO) = :period");
  }

  if (plate) {
    binds.plate = `%${String(plate)
      .trim()
      .toUpperCase()
      .replace(/[-\s]/g, "")}%`;

    where.push(`
      REPLACE(
        REPLACE(
          UPPER(MATRICULA),
          '-',
          ''
        ),
        ' ',
        ''
      ) LIKE :plate
    `);
  }

  if (cancelled === true || cancelled === false) {
    binds.cancelled = cancelled ? "S" : "N";

    where.push("NVL(ANULADO, 'N') = :cancelled");
  }

  const whereSql = `WHERE ${where.join("\n AND ")}`;

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

    const offset = (safePage - 1) * safeRows;

    const maxRow = offset + safeRows;

    binds.offset = offset;
    binds.maxRow = maxRow;

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

    const result = await connection.execute(sql, binds, {
      outFormat: 4002,
    });

    return {
      page: safePage,
      rows: safeRows,

      data: (result.rows ?? []).map((row) => ({
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
      })),
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

  /*
   * NOTA:
   * MAX(SIMBOLO_MONEDA) conserva la implementación inicial.
   *
   * Si una misma consulta puede devolver más de una moneda,
   * lo recomendable será agrupar también por moneda en una
   * siguiente iteración para impedir mezclas de importes.
   */
  select.push("MAX(SIMBOLO_MONEDA) AS CURRENCY_SYMBOL");

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

  if (safeGroupBy.length === 0) {
    return (
      mapped[0] ?? {
        totalAmount: 0,
        invoiceCount: 0,
        currencySymbol: null,
      }
    );
  }

  return {
    data: mapped,
  };
};
