import { executeOracleQuery } from "../../database/oracle-query.database.js";

const METRIC_CONFIG = {
  totalAmount: {
    select: "NVL(SUM(MONTO_TOTAL), 0) AS TOTAL_AMOUNT",
    map: (row) => ({
      totalAmount: Number(row.TOTAL_AMOUNT ?? 0),
    }),
  },
  totalInvoices: {
    select: "NVL(SUM(CANTIDAD_FACTURAS), 0) AS TOTAL_INVOICES",
    map: (row) => ({
      totalInvoices: Number(row.TOTAL_INVOICES ?? 0),
    }),
  },
};

const CURRENCY_CONFIG = {
  select: `
    MAX(DES_MONEDA) AS CURRENCY_DESCRIPTION,
    MAX(SIGLAS_MONEDA) AS CURRENCY_ABBREVIATION
  `,
  map: (row) => ({
    currency: {
      description: row.CURRENCY_DESCRIPTION ?? null,
      abbreviation: row.CURRENCY_ABBREVIATION ?? null,
    },
  }),
};

const VALID_DAY_TYPES = ["weekend", "weekday"];

const GROUP_BY_CONFIG = {
  day: {
    select: `
      TO_CHAR(TRUNC(FECHA), 'DD/MM/YYYY') AS SALE_DATE,
      (TRUNC(FECHA) - TRUNC(FECHA, 'IW')) AS WEEKDAY_INDEX
    `,
    groupBy: `
      TRUNC(FECHA),
      (TRUNC(FECHA) - TRUNC(FECHA, 'IW'))
    `,
    orderBy: "TRUNC(FECHA)",
    map: (row) => {
      const dayNames = [
        "Lunes",
        "Martes",
        "Miércoles",
        "Jueves",
        "Viernes",
        "Sábado",
        "Domingo",
      ];

      const weekdayIndex = Number(row.WEEKDAY_INDEX);

      return {
        date: row.SALE_DATE ?? null,
        dayOfWeek:
          Number.isInteger(weekdayIndex) &&
          weekdayIndex >= 0 &&
          weekdayIndex <= 6
            ? dayNames[weekdayIndex]
            : null,
      };
    },
  },

  month: {
    select: "TO_CHAR(FECHA, 'MM') AS MONTH",
    groupBy: "TO_CHAR(FECHA, 'MM')",
    orderBy: "TO_CHAR(FECHA, 'MM')",
    map: (row) => ({
      month: row.MONTH,
    }),
  },

  year: {
    select: "TO_CHAR(FECHA, 'YYYY') AS YEAR",
    groupBy: "TO_CHAR(FECHA, 'YYYY')",
    orderBy: "TO_CHAR(FECHA, 'YYYY')",
    map: (row) => ({
      year: row.YEAR,
    }),
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
      customerId: String(row.CUSTOMER_ID),
      customerName: row.CUSTOMER_NAME,
    }),
  },

  category: {
    select: `
      COD_RUBRO AS CATEGORY_ID,
      DES_RUBRO AS CATEGORY_NAME
    `,
    groupBy: `
      COD_RUBRO,
      DES_RUBRO
    `,
    orderBy: "DES_RUBRO",
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

export const getSalesRepository = async ({
  connection,
  customerIds = [],
  categoryIds = [],
  dateFrom,
  dateTo,
  dayType,
  groupBy = [],
  metrics = ["totalAmount", "totalInvoices"],
}) => {
  if (!dateFrom || !dateTo) {
    throw new Error("dateFrom y dateTo son obligatorios.");
  }

  if (dayType && !VALID_DAY_TYPES.includes(dayType)) {
    throw new Error(`Tipo de día no soportado: ${dayType}`);
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

  if (metrics.length === 0) {
    throw new Error("Debe especificarse al menos una métrica.");
  }

  const binds = {
    dateFrom,
    dateTo,
  };

  const filters = [
    "FECHA >= TO_DATE(:dateFrom, 'DD/MM/YYYY')",
    "FECHA < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1",
  ];

  if (dayType === "weekend") {
    filters.push("(TRUNC(FECHA) - TRUNC(FECHA, 'IW')) IN (5, 6)");
  }

  if (dayType === "weekday") {
    filters.push("(TRUNC(FECHA) - TRUNC(FECHA, 'IW')) BETWEEN 0 AND 4");
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

  const selectFields = [];

  for (const dimension of groupBy) {
    selectFields.push(GROUP_BY_CONFIG[dimension].select);
  }

  selectFields.push(CURRENCY_CONFIG.select);

  for (const metric of metrics) {
    selectFields.push(METRIC_CONFIG[metric].select);
  }

  const groupByFields = groupBy.map(
    (dimension) => GROUP_BY_CONFIG[dimension].groupBy,
  );

  const orderByFields = groupBy.map(
    (dimension) => GROUP_BY_CONFIG[dimension].orderBy,
  );

  const sql = `
    SELECT
      ${selectFields.join(",\n")}
    FROM VW_BOT_VENTAS_LOCALES
    WHERE
      ${filters.join("\nAND ")}
    ${
      groupByFields.length > 0
        ? `GROUP BY ${groupByFields.join(",\n")}`
        : ""
    }
    ${
      orderByFields.length > 0
        ? `ORDER BY ${orderByFields.join(",\n")}`
        : ""
    }
  `;

  const rows = await executeOracleQuery(connection, sql, binds);

  const data = rows.map((row) => {
    let mapped = {};

    for (const dimension of groupBy) {
      mapped = {
        ...mapped,
        ...GROUP_BY_CONFIG[dimension].map(row),
      };
    }

    mapped = {
      ...mapped,
      ...CURRENCY_CONFIG.map(row),
    };

    for (const metric of metrics) {
      mapped = {
        ...mapped,
        ...METRIC_CONFIG[metric].map(row),
      };
    }

    return mapped;
  });

  if (groupBy.length === 0) {
    return (
      data[0] ?? {
        currency: {
          description: null,
          abbreviation: null,
        },
        totalAmount: 0,
        totalInvoices: 0,
      }
    );
  }

  return {
    data,
  };
};
