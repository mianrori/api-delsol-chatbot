import { executeOracleQuery } from "../../database/oracle-query.database.js";

const METRIC_CONFIG = {
  totalAmount: {
    select: "NVL(SUM(IMPORTE), 0) AS TOTAL_AMOUNT",
    map: (row) => ({
      totalAmount: Number(row.TOTAL_AMOUNT ?? 0),
    }),
  },
  purchaseCount: {
    select: "COUNT(*) AS PURCHASE_COUNT",
    map: (row) => ({
      purchaseCount: Number(row.PURCHASE_COUNT ?? 0),
    }),
  },
};

const GROUP_BY_CONFIG = {
  month: {
    select: "TO_CHAR(FECHA_COMPRA, 'YYYY-MM') AS MONTH",
    groupBy: "TO_CHAR(FECHA_COMPRA, 'YYYY-MM')",
    orderBy: "TO_CHAR(FECHA_COMPRA, 'YYYY-MM')",
    map: (row) => ({ month: row.MONTH }),
  },
  year: {
    select: "TO_CHAR(FECHA_COMPRA, 'YYYY') AS YEAR",
    groupBy: "TO_CHAR(FECHA_COMPRA, 'YYYY')",
    orderBy: "TO_CHAR(FECHA_COMPRA, 'YYYY')",
    map: (row) => ({ year: row.YEAR }),
  },
  customer: {
    select: "COD_CLIENTE AS CUSTOMER_ID, LOCAL AS CUSTOMER_NAME",
    groupBy: "COD_CLIENTE, LOCAL",
    orderBy: "LOCAL",
    map: (row) => ({
      customerId: String(row.CUSTOMER_ID),
      customerName: row.CUSTOMER_NAME,
    }),
  },
  category: {
    select: "COD_RUBRO AS CATEGORY_ID, RUBRO AS CATEGORY_NAME",
    groupBy: "COD_RUBRO, RUBRO",
    orderBy: "RUBRO",
    map: (row) => ({
      categoryId: String(row.CATEGORY_ID),
      categoryName: row.CATEGORY_NAME,
    }),
  },
};

const createInFilter = ({ column, values, bindPrefix, binds }) => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const placeholders = values.map((value, index) => {
    const bindName = `${bindPrefix}${index}`;
    binds[bindName] = String(value);
    return `:${bindName}`;
  });

  return `${column} IN (${placeholders.join(", ")})`;
};

export const getMemberPurchasesRepository = async ({
  connection,
  documentNumber,
  customerIds = [],
  categoryIds = [],
  dateFrom,
  dateTo,
  mode = "summary",
  groupBy = [],
  metrics = ["totalAmount", "purchaseCount"],
  limit = 50,
}) => {
  if (!documentNumber) {
    throw new Error("documentNumber es obligatorio.");
  }

  if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
    throw new Error("dateFrom y dateTo deben especificarse juntos.");
  }

  if (!["summary", "detail"].includes(mode)) {
    throw new Error(`Modo no soportado: ${mode}`);
  }

  const invalidGroups = groupBy.filter((item) => !GROUP_BY_CONFIG[item]);
  if (invalidGroups.length > 0) {
    throw new Error(
      `Agrupaciones no soportadas: ${invalidGroups.join(", ")}`,
    );
  }

  const invalidMetrics = metrics.filter((item) => !METRIC_CONFIG[item]);
  if (invalidMetrics.length > 0) {
    throw new Error(
      `Métricas no soportadas: ${invalidMetrics.join(", ")}`,
    );
  }

  if (mode === "summary" && metrics.length === 0) {
    throw new Error("Debe especificarse al menos una métrica.");
  }

  const binds = {
    documentNumber: String(documentNumber),
  };

  const filters = ["COD_SOCIO = :documentNumber"];

  if (dateFrom && dateTo) {
    binds.dateFrom = dateFrom;
    binds.dateTo = dateTo;

    filters.push(
      "FECHA_COMPRA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')",
      "FECHA_COMPRA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1",
    );
  }

  const customerFilter = createInFilter({
    column: "COD_CLIENTE",
    values: customerIds,
    bindPrefix: "customerId",
    binds,
  });

  if (customerFilter) {
    filters.push(customerFilter);
  }

  const categoryFilter = createInFilter({
    column: "COD_RUBRO",
    values: categoryIds,
    bindPrefix: "categoryId",
    binds,
  });

  if (categoryFilter) {
    filters.push(categoryFilter);
  }

  if (mode === "detail") {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    binds.limit = safeLimit;

    const sql = `
      SELECT *
      FROM (
        SELECT
          TO_CHAR(FECHA, 'DD/MM/YYYY') AS REGISTER_DATE,
          TO_CHAR(FECHA_COMPRA, 'DD/MM/YYYY') AS PURCHASE_DATE,
          COD_CLIENTE AS CUSTOMER_ID,
          LOCAL AS CUSTOMER_NAME,
          COD_RUBRO AS CATEGORY_ID,
          RUBRO AS CATEGORY_NAME,
          MONEDA AS CURRENCY_DESCRIPTION,
          SIMBOLO_MONEDA AS CURRENCY_SYMBOL,
          TO_CHAR(NRO_FACTURA) AS INVOICE_NUMBER,
          IMPORTE AS AMOUNT
        FROM VW_BOT_COMPRAS_SOCIO
        WHERE ${filters.join("\nAND ")}
        ORDER BY FECHA_COMPRA DESC, NRO_FACTURA DESC
      )
      WHERE ROWNUM <= :limit
    `;

    const result = await executeOracleQuery(connection, sql, binds);
    const rows = Array.isArray(result) ? result : [];

    return {
      documentNumber: String(documentNumber),
      mode: "detail",
      data: rows.map((row) => ({
        purchaseDate: row.PURCHASE_DATE,
        registerDate: row.REGISTER_DATE,
        customer: {
          id:
            row.CUSTOMER_ID != null
              ? String(row.CUSTOMER_ID)
              : null,
          name: row.CUSTOMER_NAME,
        },
        category: {
          id:
            row.CATEGORY_ID != null
              ? String(row.CATEGORY_ID)
              : null,
          name: row.CATEGORY_NAME,
        },
        currency: {
          description: row.CURRENCY_DESCRIPTION,
          symbol: row.CURRENCY_SYMBOL,
          symbolPosition: "prefix",
        },
        invoiceNumber: row.INVOICE_NUMBER,
        amount: Number(row.AMOUNT ?? 0),
      })),
      limit: safeLimit,
    };
  }

  const selectFields = [];
  for (const dimension of groupBy) {
    selectFields.push(GROUP_BY_CONFIG[dimension].select);
  }

  selectFields.push(
    "MONEDA AS CURRENCY_DESCRIPTION",
    "SIMBOLO_MONEDA AS CURRENCY_SYMBOL",
  );

  for (const metric of metrics) {
    selectFields.push(METRIC_CONFIG[metric].select);
  }

  const groupByFields = groupBy.map(
    (dimension) => GROUP_BY_CONFIG[dimension].groupBy,
  );

  groupByFields.push("MONEDA", "SIMBOLO_MONEDA");

  const orderByFields = groupBy.map(
    (dimension) => GROUP_BY_CONFIG[dimension].orderBy,
  );

  const sql = `
    SELECT
      ${selectFields.join(",\n")}
    FROM VW_BOT_COMPRAS_SOCIO
    WHERE ${filters.join("\nAND ")}
    GROUP BY ${groupByFields.join(",\n")}
    ${
      orderByFields.length > 0
        ? `ORDER BY ${orderByFields.join(",\n")}`
        : ""
    }
  `;

  const result = await executeOracleQuery(connection, sql, binds);
  const rows = Array.isArray(result) ? result : [];

  const data = rows.map((row) => {
    let item = {};

    for (const dimension of groupBy) {
      item = {
        ...item,
        ...GROUP_BY_CONFIG[dimension].map(row),
      };
    }

    item.currency = {
      description: row.CURRENCY_DESCRIPTION,
      symbol: row.CURRENCY_SYMBOL,
      symbolPosition: "prefix",
    };

    for (const metric of metrics) {
      item = {
        ...item,
        ...METRIC_CONFIG[metric].map(row),
      };
    }

    return item;
  });

  return {
    documentNumber: String(documentNumber),
    mode: "summary",
    data,
  };
};
