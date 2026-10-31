import { executeOracleQuery } from "../../database/oracle-query.database.js";

/*
|--------------------------------------------------------------------------
| Origen bancario
|--------------------------------------------------------------------------
|
| Ajustar estos valores solamente si VW_BOT_FACTURAS_PROMO utiliza
| códigos distintos a S/N.
|--------------------------------------------------------------------------
*/

const BANK_ORIGIN_VALUES = {
  bank: "S",
  nonBank: "N",
};

/*
|--------------------------------------------------------------------------
| Métricas
|--------------------------------------------------------------------------
*/

const METRIC_CONFIG = {
  totalAmount: {
    select: `
      NVL(
        SUM(MONTO),
        0
      ) AS TOTAL_AMOUNT
    `,

    map: (row) => ({
      totalAmount: Number(row.TOTAL_AMOUNT ?? 0),
    }),
  },

  purchaseCount: {
    select: `
      COUNT(*) AS PURCHASE_COUNT
    `,

    map: (row) => ({
      purchaseCount: Number(row.PURCHASE_COUNT ?? 0),
    }),
  },
};

/*
|--------------------------------------------------------------------------
| Agrupaciones
|--------------------------------------------------------------------------
*/

const GROUP_BY_CONFIG = {
  month: {
    select: `
      TO_CHAR(
        FECHA_COMPRA,
        'YYYY-MM'
      ) AS MONTH
    `,

    groupBy: `
      TO_CHAR(
        FECHA_COMPRA,
        'YYYY-MM'
      )
    `,

    orderBy: `
      TO_CHAR(
        FECHA_COMPRA,
        'YYYY-MM'
      )
    `,

    map: (row) => ({
      month: row.MONTH,
    }),
  },

  year: {
    select: `
      TO_CHAR(
        FECHA_COMPRA,
        'YYYY'
      ) AS YEAR
    `,

    groupBy: `
      TO_CHAR(
        FECHA_COMPRA,
        'YYYY'
      )
    `,

    orderBy: `
      TO_CHAR(
        FECHA_COMPRA,
        'YYYY'
      )
    `,

    map: (row) => ({
      year: row.YEAR,
    }),
  },

  promotion: {
    select: `
      COD_PROMOCION AS PROMOTION_ID,
      PROMOCION AS PROMOTION_NAME
    `,

    groupBy: `
      COD_PROMOCION,
      PROMOCION
    `,

    orderBy: `
      PROMOCION
    `,

    map: (row) => ({
      promotionId: row.PROMOTION_ID != null ? String(row.PROMOTION_ID) : null,

      promotionName: row.PROMOTION_NAME,
    }),
  },

  campaign: {
    select: `
      COD_CAMPANIA AS CAMPAIGN_ID,
      CAMPANIA AS CAMPAIGN_NAME
    `,

    groupBy: `
      COD_CAMPANIA,
      CAMPANIA
    `,

    orderBy: `
      CAMPANIA
    `,

    map: (row) => ({
      campaignId: row.CAMPAIGN_ID != null ? Number(row.CAMPAIGN_ID) : null,

      campaignName: row.CAMPAIGN_NAME,
    }),
  },

  customer: {
    select: `
      COD_CLIENTE AS CUSTOMER_ID,
      LOCAL AS CUSTOMER_NAME
    `,

    groupBy: `
      COD_CLIENTE,
      LOCAL
    `,

    orderBy: `
      LOCAL
    `,

    map: (row) => ({
      customerId: row.CUSTOMER_ID != null ? String(row.CUSTOMER_ID) : null,

      customerName: row.CUSTOMER_NAME,
    }),
  },

  category: {
    select: `
      COD_RUBRO AS CATEGORY_ID,
      RUBRO AS CATEGORY_NAME
    `,

    groupBy: `
      COD_RUBRO,
      RUBRO
    `,

    orderBy: `
      RUBRO
    `,

    map: (row) => ({
      categoryId: row.CATEGORY_ID != null ? String(row.CATEGORY_ID) : null,

      categoryName: row.CATEGORY_NAME,
    }),
  },

  bankOrigin: {
    select: `
      ORIGEN_BANCARIO AS BANK_ORIGIN
    `,

    groupBy: `
      ORIGEN_BANCARIO
    `,

    orderBy: `
      ORIGEN_BANCARIO
    `,

    map: (row) => ({
      bankOrigin: row.BANK_ORIGIN === BANK_ORIGIN_VALUES.bank,

      origin:
        row.BANK_ORIGIN === BANK_ORIGIN_VALUES.bank
          ? "Banco Atlas"
          : "No bancario",
    }),
  },
};

const createInFilter = ({
  column,
  values,
  bindPrefix,
  binds,
  mapper = (value) => String(value),
}) => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const placeholders = values.map((value, index) => {
    const bindName = `${bindPrefix}${index}`;

    binds[bindName] = mapper(value);

    return `:${bindName}`;
  });

  return `
    ${column} IN (
      ${placeholders.join(", ")}
    )
  `;
};

export const getMemberPromoPurchasesRepository = async ({
  connection,

  documentNumber,

  promotionIds = [],

  campaignIds = [],

  customerIds = [],

  categoryIds = [],

  dateFrom,

  dateTo,

  origin,

  mode = "summary",

  groupBy = [],

  metrics = ["totalAmount", "purchaseCount"],

  page = 1,

  rows = 20,

  knownTotalRows,
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
    throw new Error(`Agrupaciones no soportadas: ${invalidGroups.join(", ")}`);
  }

  const invalidMetrics = metrics.filter((item) => !METRIC_CONFIG[item]);

  if (invalidMetrics.length > 0) {
    throw new Error(`Métricas no soportadas: ${invalidMetrics.join(", ")}`);
  }

  if (mode === "summary" && metrics.length === 0) {
    throw new Error("Debe especificarse al menos una métrica.");
  }

  if (origin && !BANK_ORIGIN_VALUES[origin]) {
    throw new Error(`Origen no soportado: ${origin}`);
  }

  const binds = {
    documentNumber: String(documentNumber),
  };

  const filters = [
    `
        COD_SOCIO =
        :documentNumber
      `,
  ];

  if (dateFrom && dateTo) {
    binds.dateFrom = dateFrom;

    binds.dateTo = dateTo;

    filters.push(`
        FECHA_COMPRA >=
        TO_DATE(
          :dateFrom,
          'DD/MM/YYYY'
        )
      `);

    filters.push(`
        FECHA_COMPRA <
        TO_DATE(
          :dateTo,
          'DD/MM/YYYY'
        ) + 1
      `);
  }

  const promotionFilter = createInFilter({
    column: "COD_PROMOCION",

    values: promotionIds,

    bindPrefix: "promotionId",

    binds,
  });

  if (promotionFilter) {
    filters.push(promotionFilter);
  }

  const campaignFilter = createInFilter({
    column: "COD_CAMPANIA",

    values: campaignIds,

    bindPrefix: "campaignId",

    binds,

    mapper: (value) => Number(value),
  });

  if (campaignFilter) {
    filters.push(campaignFilter);
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

  if (origin) {
    binds.bankOrigin = BANK_ORIGIN_VALUES[origin];

    filters.push(`
        NVL(
          ORIGEN_BANCARIO,
          '${BANK_ORIGIN_VALUES.nonBank}'
        ) = :bankOrigin
      `);
  }

  if (mode === "detail") {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeRows = Math.min(Math.max(Number(rows) || 20, 1), 100);
    const offset = (safePage - 1) * safeRows;

    let totalRows;

    if (
      knownTotalRows !== undefined &&
      knownTotalRows !== null &&
      Number.isFinite(Number(knownTotalRows)) &&
      Number(knownTotalRows) >= 0
    ) {
      totalRows = Number(knownTotalRows);
      console.log(
        `[CHATBOT-DEV] MEMBER PROMO PURCHASES COUNT: reused totalRows=${totalRows}`,
      );
    } else {
      const countSql = `
        SELECT COUNT(*) AS TOTAL_ROWS
        FROM VW_BOT_FACTURAS_PROMO
        WHERE ${filters.join("\nAND ")}
      `;

      const countStartedAt = Date.now();
      const countResult = await executeOracleQuery(
        connection,
        countSql,
        binds,
      );

      console.log(
        `[CHATBOT-DEV] MEMBER PROMO PURCHASES COUNT: ${Date.now() - countStartedAt} ms`,
      );

      totalRows = Number(countResult?.[0]?.TOTAL_ROWS ?? 0);
    }

    const totalPages =
      totalRows === 0 ? 0 : Math.ceil(totalRows / safeRows);

    const detailBinds = {
      ...binds,
      pageOffset: offset,
      pageSize: safeRows,
    };

    const sql = `
      SELECT
        TO_CHAR(FECHA, 'DD/MM/YYYY') AS REGISTER_DATE,
        TO_CHAR(FECHA_COMPRA, 'DD/MM/YYYY') AS PURCHASE_DATE,
        COD_PROMOCION AS PROMOTION_ID,
        PROMOCION AS PROMOTION_NAME,
        COD_CAMPANIA AS CAMPAIGN_ID,
        CAMPANIA AS CAMPAIGN_NAME,
        COD_CLIENTE AS CUSTOMER_ID,
        LOCAL AS CUSTOMER_NAME,
        COD_RUBRO AS CATEGORY_ID,
        RUBRO AS CATEGORY_NAME,
        MONEDA AS CURRENCY_DESCRIPTION,
        SIMBOLO_MONEDA AS CURRENCY_SYMBOL,
        TO_CHAR(NRO_FACTURA) AS INVOICE_NUMBER,
        MONTO AS AMOUNT,
        ORIGEN_BANCARIO AS BANK_ORIGIN
      FROM VW_BOT_FACTURAS_PROMO
      WHERE ${filters.join("\nAND ")}
      ORDER BY FECHA_COMPRA DESC, NRO_FACTURA DESC
      OFFSET :pageOffset ROWS
      FETCH NEXT :pageSize ROWS ONLY
    `;

    const detailStartedAt = Date.now();
    const result = await executeOracleQuery(
      connection,
      sql,
      detailBinds,
    );

    console.log(
      `[CHATBOT-DEV] MEMBER PROMO PURCHASES DETAIL: ${Date.now() - detailStartedAt} ms`,
    );

    const detailRows = Array.isArray(result) ? result : [];

    return {
      documentNumber: String(documentNumber),
      mode: "detail",
      page: safePage,
      rows: safeRows,
      startRow: detailRows.length > 0 ? offset + 1 : null,
      endRow:
        detailRows.length > 0
          ? offset + detailRows.length
          : null,
      returnedRows: detailRows.length,
      totalRows,
      totalPages,
      hasMore: safePage < totalPages,
      nextPage: safePage < totalPages ? safePage + 1 : null,
      data: detailRows.map((row) => ({
        registerDate: row.REGISTER_DATE,
        purchaseDate: row.PURCHASE_DATE,
        promotion: {
          id:
            row.PROMOTION_ID != null
              ? String(row.PROMOTION_ID)
              : null,
          name: row.PROMOTION_NAME,
        },
        campaign: {
          id:
            row.CAMPAIGN_ID != null
              ? Number(row.CAMPAIGN_ID)
              : null,
          name: row.CAMPAIGN_NAME,
        },
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
        bankOrigin: row.BANK_ORIGIN === BANK_ORIGIN_VALUES.bank,
        origin:
          row.BANK_ORIGIN === BANK_ORIGIN_VALUES.bank
            ? "Banco Atlas"
            : "No bancario",
      })),
    };
  }

  const selectFields = [];

  for (const dimension of groupBy) {
    selectFields.push(GROUP_BY_CONFIG[dimension].select);
  }

  selectFields.push(`
      MONEDA AS CURRENCY_DESCRIPTION
    `);

  selectFields.push(`
      SIMBOLO_MONEDA AS CURRENCY_SYMBOL
    `);

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

      FROM
        VW_BOT_FACTURAS_PROMO

      WHERE
        ${filters.join("\nAND ")}

      GROUP BY
        ${groupByFields.join(",\n")}

      ${
        orderByFields.length > 0
          ? `
            ORDER BY
              ${orderByFields.join(",\n")}
          `
          : ""
      }
    `;

  console.log("getMemberPromoPurchasesRepository SUMMARY SQL:", sql);

  console.log("getMemberPromoPurchasesRepository SUMMARY binds:", binds);

  const result = await executeOracleQuery(connection, sql, binds);

  const resultRows = Array.isArray(result) ? result : [];

  const data = resultRows.map((row) => {
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

    data,
  };
};
