import { executeOracleQuery } from "../../database/oracle-query.database.js";

const ORACLE_IN_LIMIT = 1000;

const DIMENSION_CONFIG = {
  month: {
    sales: {
      id: `TO_CHAR(V.FECHA, 'YYYY-MM')`,
      name: `TO_CHAR(V.FECHA, 'YYYY-MM')`,
    },

    purchase: {
      id: `TO_CHAR(C.FECHA_COMPRA, 'YYYY-MM')`,
      name: `TO_CHAR(C.FECHA_COMPRA, 'YYYY-MM')`,
    },
  },

  year: {
    sales: {
      id: `TO_CHAR(V.FECHA, 'YYYY')`,
      name: `TO_CHAR(V.FECHA, 'YYYY')`,
    },

    purchase: {
      id: `TO_CHAR(C.FECHA_COMPRA, 'YYYY')`,
      name: `TO_CHAR(C.FECHA_COMPRA, 'YYYY')`,
    },
  },

  customer: {
    sales: {
      id: `V.COD_CLIENTE`,
      name: `V.NOMBRE_CLIENTE`,
    },

    purchase: {
      id: `C.COD_CLIENTE`,
      name: `C.LOCAL`,
    },
  },

  category: {
    sales: {
      id: `V.COD_RUBRO`,
      name: `V.DES_RUBRO`,
    },

    purchase: {
      id: `C.COD_RUBRO`,
      name: `C.RUBRO`,
    },
  },
};

const normalizeBreakdownBy = (breakdownBy = []) => {
  if (!Array.isArray(breakdownBy)) {
    throw new Error("breakdownBy debe ser una lista.");
  }

  const dimensions = [...new Set(breakdownBy)];

  if (dimensions.length > 2) {
    throw new Error("breakdownBy admite como máximo dos dimensiones.");
  }

  for (const dimension of dimensions) {
    if (!Object.hasOwn(DIMENSION_CONFIG, dimension)) {
      throw new Error(`Desglose no soportado: ${dimension}`);
    }
  }

  return dimensions;
};

const createInFilter = ({ column, values, bindPrefix, binds }) => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const groups = [];

  for (let offset = 0; offset < values.length; offset += ORACLE_IN_LIMIT) {
    const chunk = values.slice(offset, offset + ORACLE_IN_LIMIT);

    const placeholders = chunk.map((value, index) => {
      const absoluteIndex = offset + index;
      const bindName = `${bindPrefix}${absoluteIndex}`;

      binds[bindName] = String(value);

      return `:${bindName}`;
    });

    groups.push(`
      ${column} IN (
        ${placeholders.join(", ")}
      )
    `);
  }

  if (groups.length === 1) {
    return groups[0];
  }

  return `
    (
      ${groups.join("\nOR\n")}
    )
  `;
};

const buildDimensionSql = ({ source, breakdownBy }) => {
  const selectParts = [];
  const groupByParts = [];

  breakdownBy.forEach((dimension, index) => {
    const config = DIMENSION_CONFIG[dimension][source];

    const position = index + 1;

    selectParts.push(`${config.id} AS DIMENSION_${position}_ID`);

    selectParts.push(`${config.name} AS DIMENSION_${position}_NAME`);

    groupByParts.push(config.id);

    if (config.name !== config.id) {
      groupByParts.push(config.name);
    }
  });

  while (selectParts.length < 4) {
    const position = Math.floor(selectParts.length / 2) + 1;

    selectParts.push(`CAST(NULL AS VARCHAR2(100)) AS DIMENSION_${position}_ID`);

    selectParts.push(
      `CAST(NULL AS VARCHAR2(500)) AS DIMENSION_${position}_NAME`,
    );
  }

  return {
    selectSql: selectParts.join(",\n"),

    groupBySql: groupByParts.length > 0 ? `,\n${groupByParts.join(",\n")}` : "",
  };
};

const buildSalesQuery = ({
  dateFrom,
  dateTo,
  customerIds,
  categoryIds,
  breakdownBy,
}) => {
  const binds = {
    dateFrom,
    dateTo,
  };

  const filters = [
    `V.FECHA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')`,
    `V.FECHA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1`,
  ];

  const customerFilter = createInFilter({
    column: "V.COD_CLIENTE",
    values: customerIds,
    bindPrefix: "salesCustomerId",
    binds,
  });

  if (customerFilter) {
    filters.push(customerFilter);
  }

  const categoryFilter = createInFilter({
    column: "V.COD_RUBRO",
    values: categoryIds,
    bindPrefix: "salesCategoryId",
    binds,
  });

  if (categoryFilter) {
    filters.push(categoryFilter);
  }

  const dimensions = buildDimensionSql({
    source: "sales",
    breakdownBy,
  });

  const sql = `
    SELECT
      ${dimensions.selectSql},

      V.DES_MONEDA AS CURRENCY_DESCRIPTION,
      V.SIGLAS_MONEDA AS CURRENCY_SYMBOL,

      NVL(
        SUM(V.MONTO_TOTAL),
        0
      ) AS SALES_AMOUNT

    FROM
      VW_BOT_VENTAS_LOCALES V

    WHERE
      ${filters.join("\nAND ")}

    GROUP BY
      V.DES_MONEDA,
      V.SIGLAS_MONEDA
      ${dimensions.groupBySql}
  `;

  return {
    sql,
    binds,
  };
};

const buildPurchasesQuery = ({
  dateFrom,
  dateTo,
  customerIds,
  categoryIds,
  breakdownBy,
}) => {
  const binds = {
    dateFrom,
    dateTo,
  };

  const filters = [
    `C.FECHA_COMPRA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')`,
    `C.FECHA_COMPRA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1`,
  ];

  const customerFilter = createInFilter({
    column: "C.COD_CLIENTE",
    values: customerIds,
    bindPrefix: "purchaseCustomerId",
    binds,
  });

  if (customerFilter) {
    filters.push(customerFilter);
  }

  const categoryFilter = createInFilter({
    column: "C.COD_RUBRO",
    values: categoryIds,
    bindPrefix: "purchaseCategoryId",
    binds,
  });

  if (categoryFilter) {
    filters.push(categoryFilter);
  }

  const dimensions = buildDimensionSql({
    source: "purchase",
    breakdownBy,
  });

  const sql = `
    SELECT
      ${dimensions.selectSql},

      C.MONEDA AS CURRENCY_DESCRIPTION,
      C.SIMBOLO_MONEDA AS CURRENCY_SYMBOL,

      NVL(
        SUM(C.IMPORTE),
        0
      ) AS EXCHANGE_AMOUNT,

      COUNT(*) AS INVOICE_COUNT,

      COUNT(
        DISTINCT C.COD_SOCIO
      ) AS MEMBER_COUNT

    FROM
      VW_BOT_COMPRAS_SOCIO C

    WHERE
      ${filters.join("\nAND ")}

    GROUP BY
      C.MONEDA,
      C.SIMBOLO_MONEDA
      ${dimensions.groupBySql}
  `;

  return {
    sql,
    binds,
  };
};

export const getMemberPurchasesVsSalesRepository = async ({
  connection,

  dateFrom,
  dateTo,

  customerIds = [],
  categoryIds = [],

  breakdownBy = [],
}) => {
  if (!dateFrom || !dateTo) {
    throw new Error("dateFrom y dateTo son obligatorios.");
  }

  const normalizedBreakdownBy = normalizeBreakdownBy(breakdownBy);

  const salesQuery = buildSalesQuery({
    dateFrom,
    dateTo,
    customerIds,
    categoryIds,
    breakdownBy: normalizedBreakdownBy,
  });

  const purchasesQuery = buildPurchasesQuery({
    dateFrom,
    dateTo,
    customerIds,
    categoryIds,
    breakdownBy: normalizedBreakdownBy,
  });

  // Run sequentially on the same proxy connection. Cancellation of the first
  // query must complete before another query can start or the connection closes.
  const salesResult = await executeOracleQuery(connection, salesQuery.sql, salesQuery.binds);
  const purchasesResult = await executeOracleQuery(connection, purchasesQuery.sql, purchasesQuery.binds);

  return {
    breakdownBy: normalizedBreakdownBy,

    salesRows: Array.isArray(salesResult) ? salesResult : [],

    purchaseRows: Array.isArray(purchasesResult) ? purchasesResult : [],
  };
};
