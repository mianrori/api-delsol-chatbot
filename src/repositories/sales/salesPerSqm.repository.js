import { executeOracleQuery } from "../../database/oracle-query.database.js";
import { contractBusinessConfig } from "../../config/contractBusiness.config.js";

const GROUP_BY_CONFIG = {
  day: {
    select: "TO_CHAR(TRUNC(FECHA), 'DD/MM/YYYY') AS SALE_DATE",
    groupBy: "TRUNC(FECHA)",
    orderBy: "TRUNC(FECHA)",
    map: (row) => ({ date: row.SALE_DATE ?? null }),
  },
  month: {
    select: "TO_CHAR(TRUNC(FECHA, 'MM'), 'MM/YYYY') AS MONTH",
    groupBy: "TRUNC(FECHA, 'MM')",
    orderBy: "TRUNC(FECHA, 'MM')",
    map: (row) => ({ month: row.MONTH ?? null }),
  },
  year: {
    select: "TO_CHAR(FECHA, 'YYYY') AS YEAR",
    groupBy: "TO_CHAR(FECHA, 'YYYY')",
    orderBy: "TO_CHAR(FECHA, 'YYYY')",
    map: (row) => ({ year: row.YEAR ?? null }),
  },
  customer: {
    select: `
      COD_CLIENTE AS CUSTOMER_ID,
      NOMBRE_CLIENTE AS CUSTOMER_NAME
    `,
    groupBy: `
      COD_CLIENTE,
      NOMBRE_CLIENTE
    `,
    orderBy: "NOMBRE_CLIENTE",
    map: (row) => ({
      customerId: row.CUSTOMER_ID == null ? null : String(row.CUSTOMER_ID),
      customerName: row.CUSTOMER_NAME ?? null,
    }),
  },
};

const createInFilter = ({ column, values, bindPrefix, binds }) => {
  if (!Array.isArray(values) || values.length === 0) return null;

  const placeholders = values.map((value, index) => {
    const bindName = `${bindPrefix}${index}`;
    binds[bindName] = String(value);
    return `:${bindName}`;
  });

  return `${column} IN (${placeholders.join(", ")})`;
};

const mapCurrency = (row) => ({
  description: row.CURRENCY_DESCRIPTION ?? null,
  abbreviation: row.CURRENCY_ABBREVIATION ?? null,
  distinctCurrencyCount: Number(row.CURRENCY_COUNT ?? 0),
});

const mapMetricRow = (row, groupBy) => {
  let mapped = {};

  for (const dimension of groupBy) {
    mapped = {
      ...mapped,
      ...GROUP_BY_CONFIG[dimension].map(row),
    };
  }

  const minArea =
    row.MIN_AREA == null ? null : Number(row.MIN_AREA);
  const maxArea =
    row.MAX_AREA == null ? null : Number(row.MAX_AREA);
  const areaValueCount = Number(row.AREA_VALUE_COUNT ?? 0);
  const missingAreaRows = Number(row.MISSING_AREA_ROWS ?? 0);

  return {
    ...mapped,
    totalSales: Number(row.TOTAL_AMOUNT ?? 0),
    totalInvoices: Number(row.TOTAL_INVOICES ?? 0),
    sourceSalesPerSqm:
      row.SALES_PER_SQM_SOURCE == null
        ? null
        : Number(row.SALES_PER_SQM_SOURCE),
    area: {
      min: minArea,
      max: maxArea,
      changedWithinPeriod: areaValueCount > 1,
      distinctValues: areaValueCount,
      missingSalesRows: missingAreaRows,
      complete: missingAreaRows === 0 && minArea !== null,
    },
    currency: mapCurrency(row),
  };
};

export const getSalesPerSqmRepository = async ({
  connection,
  customerIds = [],
  dateFrom,
  dateTo,
  groupBy = [],
}) => {
  if (!connection) throw new Error("connection es obligatorio.");
  if (!dateFrom || !dateTo) {
    throw new Error("dateFrom y dateTo son obligatorios.");
  }

  const invalidGroups = groupBy.filter((item) => !GROUP_BY_CONFIG[item]);

  if (invalidGroups.length > 0) {
    throw new Error(
      `Agrupaciones no soportadas: ${invalidGroups.join(", ")}`,
    );
  }

  const binds = {
    dateFrom,
    dateTo,
    contractType: contractBusinessConfig.currentContract.contractType,
  };

  const filters = [
    "V.FECHA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')",
    "V.FECHA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1",
  ];

  const customerFilter = createInFilter({
    column: "V.COD_CLIENTE",
    values: customerIds,
    bindPrefix: "customerId",
    binds,
  });

  if (customerFilter) filters.push(customerFilter);

  const selectDimensions = groupBy.map(
    (dimension) => GROUP_BY_CONFIG[dimension].select,
  );

  const groupDimensions = groupBy.map(
    (dimension) => GROUP_BY_CONFIG[dimension].groupBy,
  );

  const orderDimensions = groupBy.map(
    (dimension) => GROUP_BY_CONFIG[dimension].orderBy,
  );

  const sql = `
    WITH SALES_WITH_AREA AS (
      SELECT
        V.FECHA,
        V.COD_CLIENTE,
        V.NOMBRE_CLIENTE,
        V.MONTO_TOTAL,
        V.CANTIDAD_FACTURAS,
        V.DES_MONEDA,
        V.SIGLAS_MONEDA,
        (
          SELECT
            MAX(C.TOTAL_SUP_LOCAL)
              KEEP (
                DENSE_RANK LAST
                ORDER BY C.FEC_CONTRATO, C.NRO_CONTRATO, C.SER_CONTRATO
              )
          FROM VW_BOT_CONTRATOS_LOCALES C
          WHERE C.COD_CLIENTE = V.COD_CLIENTE
            AND C.TIP_CONTRATO = :contractType
            AND C.FEC_CONTRATO <= V.FECHA
            AND (
              C.FEC_VENCIMIENTO IS NULL
              OR C.FEC_VENCIMIENTO >= V.FECHA
            )
            AND C.TOTAL_SUP_LOCAL > 0
        ) AS TOTAL_SUP_LOCAL
      FROM VW_BOT_VENTAS_LOCALES V
      WHERE
        ${filters.join("\n        AND ")}
    )
    SELECT
      ${selectDimensions.length > 0 ? `${selectDimensions.join(",\n      ")},` : ""}
      NVL(SUM(MONTO_TOTAL), 0) AS TOTAL_AMOUNT,
      NVL(SUM(CANTIDAD_FACTURAS), 0) AS TOTAL_INVOICES,
      CASE
        WHEN SUM(CASE WHEN TOTAL_SUP_LOCAL IS NULL THEN 1 ELSE 0 END) = 0
        THEN NVL(SUM(MONTO_TOTAL / TOTAL_SUP_LOCAL), 0)
        ELSE NULL
      END AS SALES_PER_SQM_SOURCE,
      MIN(TOTAL_SUP_LOCAL) AS MIN_AREA,
      MAX(TOTAL_SUP_LOCAL) AS MAX_AREA,
      COUNT(DISTINCT TOTAL_SUP_LOCAL) AS AREA_VALUE_COUNT,
      SUM(CASE WHEN TOTAL_SUP_LOCAL IS NULL THEN 1 ELSE 0 END)
        AS MISSING_AREA_ROWS,
      MAX(DES_MONEDA) AS CURRENCY_DESCRIPTION,
      MAX(SIGLAS_MONEDA) AS CURRENCY_ABBREVIATION,
      COUNT(DISTINCT SIGLAS_MONEDA) AS CURRENCY_COUNT
    FROM SALES_WITH_AREA
    ${groupDimensions.length > 0
      ? `GROUP BY ${groupDimensions.join(",\n      ")}`
      : ""}
    ${orderDimensions.length > 0
      ? `ORDER BY ${orderDimensions.join(",\n      ")}`
      : ""}
  `;

  const rows = await executeOracleQuery(connection, sql, binds);
  const mapped = rows.map((row) => mapMetricRow(row, groupBy));

  if (groupBy.length === 0) {
    return mapped[0] ?? {
      totalSales: 0,
      totalInvoices: 0,
      sourceSalesPerSqm: null,
      area: {
        min: null,
        max: null,
        changedWithinPeriod: false,
        distinctValues: 0,
        missingSalesRows: 0,
        complete: false,
      },
      currency: {
        description: null,
        abbreviation: null,
        distinctCurrencyCount: 0,
      },
    };
  }

  return { data: mapped };
};
