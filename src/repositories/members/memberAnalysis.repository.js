import { executeOracleQuery } from "../../database/oracle-query.database.js";

const GENDER_VALUES = {
  male: "M",
  female: "F",
};

const ORDER_BY_CONFIG = {
  totalAmount: "TOTAL_AMOUNT",
  purchaseCount: "PURCHASE_COUNT",
  recurrenceMonths: "RECURRENCE_MONTHS",
  fullName: "FULL_NAME",
};

const BREAKDOWN_CONFIG = {
  category: {
    select: `
      C.COD_RUBRO AS CATEGORY_ID,
      C.RUBRO AS CATEGORY_NAME
    `,
    groupBy: `
      C.COD_RUBRO,
      C.RUBRO
    `,
    orderBy: `
      C.RUBRO
    `,
    map: (row) => ({
      categoryId: row.CATEGORY_ID != null ? String(row.CATEGORY_ID) : null,
      categoryName: row.CATEGORY_NAME ?? null,
    }),
  },

  customer: {
    select: `
      C.COD_CLIENTE AS CUSTOMER_ID,
      C.LOCAL AS CUSTOMER_NAME
    `,
    groupBy: `
      C.COD_CLIENTE,
      C.LOCAL
    `,
    orderBy: `
      C.LOCAL
    `,
    map: (row) => ({
      customerId: row.CUSTOMER_ID != null ? String(row.CUSTOMER_ID) : null,
      customerName: row.CUSTOMER_NAME ?? null,
    }),
  },

  month: {
    select: `
      TO_CHAR(C.FECHA_COMPRA, 'YYYY-MM') AS MONTH
    `,
    groupBy: `
      TO_CHAR(C.FECHA_COMPRA, 'YYYY-MM')
    `,
    orderBy: `
      TO_CHAR(C.FECHA_COMPRA, 'YYYY-MM')
    `,
    map: (row) => ({
      month: row.MONTH,
    }),
  },

  year: {
    select: `
      TO_CHAR(C.FECHA_COMPRA, 'YYYY') AS YEAR
    `,
    groupBy: `
      TO_CHAR(C.FECHA_COMPRA, 'YYYY')
    `,
    orderBy: `
      TO_CHAR(C.FECHA_COMPRA, 'YYYY')
    `,
    map: (row) => ({
      year: row.YEAR,
    }),
  },
};

const ORACLE_IN_LIMIT = 1000;

const isFullMonthPeriod = (period) => {
  const matchFrom = String(period?.dateFrom ?? "").match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  );
  const matchTo = String(period?.dateTo ?? "").match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  );

  if (!matchFrom || !matchTo) {
    return false;
  }

  const [, fromDay, fromMonth, fromYear] = matchFrom;
  const [, toDay, toMonth, toYear] = matchTo;

  if (Number(fromDay) !== 1) {
    return false;
  }

  const lastDay = new Date(
    Date.UTC(Number(toYear), Number(toMonth), 0),
  ).getUTCDate();

  return Number(toDay) === lastDay;
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

const createActivityCondition = ({ alias }) => {
  return `
    (
      ${alias}.FECHA_COMPRA >=
        ADD_MONTHS(
          TRUNC(
            TO_DATE(:referenceDate, 'DD/MM/YYYY'),
            'MM'
          ),
          :activityMonthOffset
        )
      AND
      ${alias}.FECHA_COMPRA <
        TRUNC(
          TO_DATE(:referenceDate, 'DD/MM/YYYY')
        ) + 1
    )
  `;
};

const createPurchasePeriodCondition = ({
  alias,
  purchasePeriods,
  binds,
  bindPrefix,
}) => {
  if (!Array.isArray(purchasePeriods) || purchasePeriods.length === 0) {
    return null;
  }

  const conditions = purchasePeriods.map((period, index) => {
    const fromBind = `${bindPrefix}${index}DateFrom`;
    const toBind = `${bindPrefix}${index}DateTo`;

    binds[fromBind] = period.dateFrom;
    binds[toBind] = period.dateTo;

    return `
      (
        ${alias}.FECHA_COMPRA >= TO_DATE(:${fromBind}, 'DD/MM/YYYY')
        AND
        ${alias}.FECHA_COMPRA < TO_DATE(:${toBind}, 'DD/MM/YYYY') + 1
      )
    `;
  });

  return `
    (
      ${conditions.join("\nOR ")}
    )
  `;
};

const createMetricScopeCondition = ({
  alias,
  purchasePeriods,
  customerIds,
  categoryIds,
  binds,
  bindPrefix,
}) => {
  const filters = [];

  const periodCondition = createPurchasePeriodCondition({
    alias,
    purchasePeriods,
    binds,
    bindPrefix: `${bindPrefix}Period`,
  });

  filters.push(periodCondition || createActivityCondition({ alias }));

  const customerFilter = createInFilter({
    column: `${alias}.COD_CLIENTE`,
    values: customerIds,
    bindPrefix: `${bindPrefix}CustomerId`,
    binds,
  });

  if (customerFilter) {
    filters.push(customerFilter);
  }

  const categoryFilter = createInFilter({
    column: `${alias}.COD_RUBRO`,
    values: categoryIds,
    bindPrefix: `${bindPrefix}CategoryId`,
    binds,
  });

  if (categoryFilter) {
    filters.push(categoryFilter);
  }

  return `
    (
      ${filters.join("\nAND ")}
    )
  `;
};

const createPurchasePeriodMatchFilter = ({
  purchasePeriods,
  purchasePeriodMatch,
  customerIds,
  categoryIds,
  binds,
}) => {
  if (!Array.isArray(purchasePeriods) || purchasePeriods.length === 0) {
    return null;
  }

  const existsConditions = purchasePeriods.map((period, index) => {
    const fromBind = `requiredPeriod${index}DateFrom`;
    const toBind = `requiredPeriod${index}DateTo`;

    binds[fromBind] = period.dateFrom;
    binds[toBind] = period.dateTo;

    const filters = [
      `P.COD_SOCIO = S.COD_SOCIO`,
      `P.FECHA_COMPRA >= TO_DATE(:${fromBind}, 'DD/MM/YYYY')`,
      `P.FECHA_COMPRA < TO_DATE(:${toBind}, 'DD/MM/YYYY') + 1`,
    ];

    const customerFilter = createInFilter({
      column: "P.COD_CLIENTE",
      values: customerIds,
      bindPrefix: `requiredPeriod${index}CustomerId`,
      binds,
    });

    if (customerFilter) {
      filters.push(customerFilter);
    }

    const categoryFilter = createInFilter({
      column: "P.COD_RUBRO",
      values: categoryIds,
      bindPrefix: `requiredPeriod${index}CategoryId`,
      binds,
    });

    if (categoryFilter) {
      filters.push(categoryFilter);
    }

    return `
      EXISTS (
        SELECT 1
        FROM VW_BOT_COMPRAS_SOCIO P
        WHERE ${filters.join("\nAND ")}
      )
    `;
  });

  const operator = purchasePeriodMatch === "any" ? "OR" : "AND";

  return `
    (
      ${existsConditions.join(`\n${operator} `)}
    )
  `;
};

export const getMemberAnalysisRepository = async ({
  connection,
  birthMonth,
  gender,
  ageMin,
  ageMax,
  activityStatus,
  activityMonths = 12,
  referenceDate,
  purchasePeriods = [],
  purchasePeriodMatch = "all",
  customerIds = [],
  categoryIds = [],
  amountMin,
  amountMax,
  recurrenceMin,
  recurrenceMax,
  metrics = [],
  orderBy = "totalAmount",
  orderDirection = "desc",
  limit = 10,
}) => {
  const binds = {};

  // limit=null se utiliza para exportaciones.
  if (limit != null) {
    binds.limit = Number(limit);
  }

  const purchaseFilters = [];
  let periodConditions = [];

  if (Array.isArray(purchasePeriods) && purchasePeriods.length > 0) {
    periodConditions = purchasePeriods.map((period, index) => {
      if (!period?.dateFrom || !period?.dateTo) {
        throw new Error("Cada período debe contener dateFrom y dateTo.");
      }

      const fromBind = `period${index}DateFrom`;
      const toBind = `period${index}DateTo`;

      binds[fromBind] = period.dateFrom;
      binds[toBind] = period.dateTo;

      return `
        (
          FECHA_COMPRA >= TO_DATE(:${fromBind}, 'DD/MM/YYYY')
          AND
          FECHA_COMPRA < TO_DATE(:${toBind}, 'DD/MM/YYYY') + 1
        )
      `;
    });

    purchaseFilters.push(`
      (
        ${periodConditions.join("\nOR ")}
      )
    `);
  } else if (referenceDate) {
    binds.referenceDate = referenceDate;
    binds.activityMonthOffset = -(Number(activityMonths) - 1);

    purchaseFilters.push(`
      FECHA_COMPRA >=
        ADD_MONTHS(
          TRUNC(
            TO_DATE(:referenceDate, 'DD/MM/YYYY'),
            'MM'
          ),
          :activityMonthOffset
        )
    `);

    purchaseFilters.push(`
      FECHA_COMPRA <
        TRUNC(
          TO_DATE(:referenceDate, 'DD/MM/YYYY')
        ) + 1
    `);
  } else {
    binds.activityMonthOffset = -(Number(activityMonths) - 1);

    purchaseFilters.push(`
      FECHA_COMPRA >=
        ADD_MONTHS(
          TRUNC(SYSDATE, 'MM'),
          :activityMonthOffset
        )
    `);

    purchaseFilters.push(`
      FECHA_COMPRA < TRUNC(SYSDATE) + 1
    `);
  }

  const customerFilter = createInFilter({
    column: "COD_CLIENTE",
    values: customerIds,
    bindPrefix: "customerId",
    binds,
  });

  if (customerFilter) {
    purchaseFilters.push(customerFilter);
  }

  const categoryFilter = createInFilter({
    column: "COD_RUBRO",
    values: categoryIds,
    bindPrefix: "categoryId",
    binds,
  });

  if (categoryFilter) {
    purchaseFilters.push(categoryFilter);
  }

  const purchaseHaving = [];

  if (purchasePeriods.length > 1 && purchasePeriodMatch === "all") {
    purchasePeriods.forEach((period, index) => {
      const fromBind = `period${index}DateFrom`;
      const toBind = `period${index}DateTo`;

      purchaseHaving.push(`
        SUM(
          CASE
            WHEN
              FECHA_COMPRA >= TO_DATE(:${fromBind}, 'DD/MM/YYYY')
              AND
              FECHA_COMPRA < TO_DATE(:${toBind}, 'DD/MM/YYYY') + 1
            THEN 1
            ELSE 0
          END
        ) > 0
      `);
    });
  }

  const memberFilters = [];

  if (birthMonth != null) {
    binds.birthMonth = Number(birthMonth);

    memberFilters.push(`
      EXTRACT(
        MONTH FROM S.FECHA_NACIMIENTO
      ) = :birthMonth
    `);
  }

  if (gender) {
    const genderValue = GENDER_VALUES[gender];

    if (!genderValue) {
      throw new Error(`Género no soportado: ${gender}`);
    }

    binds.gender = genderValue;

    memberFilters.push(`
      S.GENERO = :gender
    `);
  }

  if (ageMin != null) {
    binds.ageMin = Number(ageMin);

    memberFilters.push(`
      S.FECHA_NACIMIENTO IS NOT NULL
    `);

    memberFilters.push(`
      TRUNC(
        MONTHS_BETWEEN(
          TRUNC(SYSDATE),
          S.FECHA_NACIMIENTO
        ) / 12
      ) >= :ageMin
    `);
  }

  if (ageMax != null) {
    binds.ageMax = Number(ageMax);

    if (
      !memberFilters.some((filter) => filter.includes("S.FECHA_NACIMIENTO"))
    ) {
      memberFilters.push(`
        S.FECHA_NACIMIENTO IS NOT NULL
      `);
    }

    memberFilters.push(`
      TRUNC(
        MONTHS_BETWEEN(
          TRUNC(SYSDATE),
          S.FECHA_NACIMIENTO
        ) / 12
      ) <= :ageMax
    `);
  }

  const requiresPurchases =
    activityStatus === "active" ||
    (Array.isArray(purchasePeriods) && purchasePeriods.length > 0);

  const joinType = requiresPurchases ? "INNER JOIN" : "LEFT JOIN";

  if (activityStatus === "inactive") {
    memberFilters.push(`
      P.DOCUMENT_NUMBER IS NULL
    `);
  }

  const metricFilters = [];

  if (amountMin != null) {
    binds.amountMin = Number(amountMin);
    metricFilters.push(`TOTAL_AMOUNT >= :amountMin`);
  }

  if (amountMax != null) {
    binds.amountMax = Number(amountMax);
    metricFilters.push(`TOTAL_AMOUNT <= :amountMax`);
  }

  if (recurrenceMin != null) {
    binds.recurrenceMin = Number(recurrenceMin);
    metricFilters.push(`RECURRENCE_MONTHS >= :recurrenceMin`);
  }

  if (recurrenceMax != null) {
    binds.recurrenceMax = Number(recurrenceMax);
    metricFilters.push(`RECURRENCE_MONTHS <= :recurrenceMax`);
  }

  const orderColumn = ORDER_BY_CONFIG[orderBy] ?? ORDER_BY_CONFIG.totalAmount;

  const direction =
    String(orderDirection).toLowerCase() === "asc" ? "ASC" : "DESC";

  const limitClause =
    limit != null
      ? `
        WHERE
          ROWNUM <= :limit
      `
      : "";

  const canUseRankingFastPath =
    limit != null &&
    activityStatus !== "inactive" &&
    metricFilters.length === 0 &&
    customerIds.length === 0 &&
    categoryIds.length === 0 &&
    Array.isArray(purchasePeriods) &&
    purchasePeriods.length === 1 &&
    purchasePeriods.every(isFullMonthPeriod) &&
    ["totalAmount", "purchaseCount", "recurrenceMonths"].includes(orderBy);

  if (canUseRankingFastPath) {
    const rankingOrderColumn =
      ORDER_BY_CONFIG[orderBy] ?? ORDER_BY_CONFIG.totalAmount;

    const period = purchasePeriods[0];
    const rankingBinds = {
      rankingDateFrom: period.dateFrom,
      rankingDateTo: period.dateTo,
      fetchLimit: Number(limit) + 1,
    };

    if (birthMonth != null) {
      rankingBinds.birthMonth = Number(birthMonth);
    }

    if (gender) {
      rankingBinds.gender = GENDER_VALUES[gender];
    }

    if (ageMin != null) {
      rankingBinds.ageMin = Number(ageMin);
    }

    if (ageMax != null) {
      rankingBinds.ageMax = Number(ageMax);
    }

    const demographicWhere =
      memberFilters.length > 0
        ? `
          AND
          ${memberFilters.join("\nAND ")}
        `
        : "";

    const rankingSql = `
      SELECT *
      FROM (
        SELECT
          M.COD_SOCIO AS DOCUMENT_NUMBER,
          S.NOMBRE_COMPLETO AS FULL_NAME,
          TO_CHAR(
            S.FECHA_NACIMIENTO,
            'DD/MM/YYYY'
          ) AS BIRTH_DATE,
          EXTRACT(
            MONTH FROM S.FECHA_NACIMIENTO
          ) AS BIRTH_MONTH,
          S.GENERO AS GENDER,
          CASE
            WHEN S.FECHA_NACIMIENTO IS NOT NULL
            THEN
              TRUNC(
                MONTHS_BETWEEN(
                  TRUNC(SYSDATE),
                  S.FECHA_NACIMIENTO
                ) / 12
              )
            ELSE NULL
          END AS AGE,
          'GUARANIES' AS CURRENCY_DESCRIPTION,
          '₲' AS CURRENCY_SYMBOL,
          SUM(M.TOTAL_AMOUNT) AS TOTAL_AMOUNT,
          SUM(M.PURCHASE_COUNT) AS PURCHASE_COUNT,
          COUNT(*) AS RECURRENCE_MONTHS,
          1 AS COMMERCIALLY_ACTIVE
        FROM
          MV_BOT_COMPRAS_SOCIO_MES M
        INNER JOIN
          VW_BOT_SOCIOS S
            ON S.COD_SOCIO = M.COD_SOCIO
        WHERE
          M.MES >= TRUNC(
            TO_DATE(:rankingDateFrom, 'DD/MM/YYYY'),
            'MM'
          )
          AND M.MES < ADD_MONTHS(
            TRUNC(
              TO_DATE(:rankingDateTo, 'DD/MM/YYYY'),
              'MM'
            ),
            1
          )
          ${demographicWhere}
        GROUP BY
          M.COD_SOCIO,
          S.NOMBRE_COMPLETO,
          S.FECHA_NACIMIENTO,
          S.GENERO
        ORDER BY
          ${rankingOrderColumn} ${direction},
          S.NOMBRE_COMPLETO ASC
      )
      WHERE
        ROWNUM <= :fetchLimit
    `;

    console.log(
      "[CHATBOT-DEV] MEMBER ANALYSIS: using materialized ranking path",
    );
    console.log(
      "getMemberAnalysisRepository ranking SQL:",
      rankingSql,
    );
    console.log(
      "getMemberAnalysisRepository ranking binds:",
      rankingBinds,
    );

    const rankingStartedAt = Date.now();
    const rankingResult = await executeOracleQuery(
      connection,
      rankingSql,
      rankingBinds,
    );

    console.log(
      `[CHATBOT-DEV] MEMBER ANALYSIS MV RANKING: ${Date.now() - rankingStartedAt} ms`,
    );

    const rankingRows = Array.isArray(rankingResult)
      ? rankingResult
      : [];

    const hasMore = rankingRows.length > Number(limit);
    const rows = rankingRows.slice(0, Number(limit));

    return {
      rows,
      totalMatches: hasMore ? null : rows.length,
      hasMore,
    };
  }

  const sql = `
    WITH PURCHASES AS (
      SELECT
        COD_SOCIO AS DOCUMENT_NUMBER,
        MONEDA AS CURRENCY_DESCRIPTION,
        SIMBOLO_MONEDA AS CURRENCY_SYMBOL,
        SUM(IMPORTE) AS TOTAL_AMOUNT,
        COUNT(*) AS PURCHASE_COUNT,
        COUNT(
          DISTINCT TO_CHAR(
            FECHA_COMPRA,
            'YYYYMM'
          )
        ) AS RECURRENCE_MONTHS
      FROM
        VW_BOT_COMPRAS_SOCIO
      WHERE
        ${purchaseFilters.join("\nAND ")}
      GROUP BY
        COD_SOCIO,
        MONEDA,
        SIMBOLO_MONEDA
      ${
        purchaseHaving.length > 0
          ? `
            HAVING
              ${purchaseHaving.join("\nAND ")}
          `
          : ""
      }
    ),

    MEMBER_DATA AS (
      SELECT
        S.COD_SOCIO AS DOCUMENT_NUMBER,
        S.NOMBRE_COMPLETO AS FULL_NAME,
        S.EMAIL AS EMAIL,
        S.RECIBE_TELEMARKETING AS RECEIVES_TELEMARKETING,
        S.TELEFONO AS PHONE,
        TO_CHAR(
          S.FECHA_NACIMIENTO,
          'DD/MM/YYYY'
        ) AS BIRTH_DATE,
        EXTRACT(
          MONTH FROM S.FECHA_NACIMIENTO
        ) AS BIRTH_MONTH,
        S.GENERO AS GENDER,
        CASE
          WHEN S.FECHA_NACIMIENTO IS NOT NULL
          THEN
            TRUNC(
              MONTHS_BETWEEN(
                TRUNC(SYSDATE),
                S.FECHA_NACIMIENTO
              ) / 12
            )
          ELSE NULL
        END AS AGE,
        P.CURRENCY_DESCRIPTION,
        P.CURRENCY_SYMBOL,
        NVL(P.TOTAL_AMOUNT, 0) AS TOTAL_AMOUNT,
        NVL(P.PURCHASE_COUNT, 0) AS PURCHASE_COUNT,
        NVL(P.RECURRENCE_MONTHS, 0) AS RECURRENCE_MONTHS,
        CASE
          WHEN P.DOCUMENT_NUMBER IS NOT NULL THEN 1
          ELSE 0
        END AS COMMERCIALLY_ACTIVE
      FROM
        VW_BOT_SOCIOS S
      ${joinType}
        PURCHASES P
          ON P.DOCUMENT_NUMBER = S.COD_SOCIO
      ${
        memberFilters.length > 0
          ? `
            WHERE
              ${memberFilters.join("\nAND ")}
          `
          : ""
      }
    ),

    FILTERED_MEMBERS AS (
      SELECT
        DOCUMENT_NUMBER,
        FULL_NAME,
        EMAIL,
        RECEIVES_TELEMARKETING,
        PHONE,
        BIRTH_DATE,
        BIRTH_MONTH,
        GENDER,
        AGE,
        CURRENCY_DESCRIPTION,
        CURRENCY_SYMBOL,
        TOTAL_AMOUNT,
        PURCHASE_COUNT,
        RECURRENCE_MONTHS,
        COMMERCIALLY_ACTIVE
      FROM
        MEMBER_DATA
      ${
        metricFilters.length > 0
          ? `
            WHERE
              ${metricFilters.join("\nAND ")}
          `
          : ""
      }
    ),

    TOTAL_COUNT AS (
      SELECT
        COUNT(
          DISTINCT DOCUMENT_NUMBER
        ) AS TOTAL_MATCHES
      FROM
        FILTERED_MEMBERS
    )

    SELECT *
    FROM (
      SELECT
        F.DOCUMENT_NUMBER,
        F.FULL_NAME,
        F.EMAIL,
        F.RECEIVES_TELEMARKETING,
        F.PHONE,
        F.BIRTH_DATE,
        F.BIRTH_MONTH,
        F.GENDER,
        F.AGE,
        F.CURRENCY_DESCRIPTION,
        F.CURRENCY_SYMBOL,
        F.TOTAL_AMOUNT,
        F.PURCHASE_COUNT,
        F.RECURRENCE_MONTHS,
        F.COMMERCIALLY_ACTIVE,
        T.TOTAL_MATCHES
      FROM
        FILTERED_MEMBERS F
      CROSS JOIN
        TOTAL_COUNT T
      ORDER BY
        ${orderColumn}
        ${direction},
        F.FULL_NAME ASC
    )
    ${limitClause}
  `;

  console.log("getMemberAnalysisRepository SQL:", sql);
  console.log("getMemberAnalysisRepository binds:", binds);

  const result = await executeOracleQuery(connection, sql, binds);

  const rows = Array.isArray(result) ? result : [];

  const totalMatches = rows.length > 0 ? Number(rows[0].TOTAL_MATCHES ?? 0) : 0;

  const cleanRows = rows.map(({ TOTAL_MATCHES, ...row }) => row);

  return {
    rows: cleanRows,
    totalMatches,
  };
};

export const getMemberPurchaseBreakdownRepository = async ({
  connection,
  documentNumbers = [],
  dimension,
  activityMonths = 12,
  referenceDate,
  purchasePeriods = [],
  customerIds = [],
  categoryIds = [],
}) => {
  if (!Array.isArray(documentNumbers) || documentNumbers.length === 0) {
    return [];
  }

  const config = BREAKDOWN_CONFIG[dimension];

  if (!config) {
    throw new Error(`Desglose no soportado: ${dimension}`);
  }

  const binds = {};

  /*
   * Si se especifican purchasePeriods, createMetricScopeCondition utiliza
   * únicamente los binds de esos períodos. Los binds de actividad se agregan
   * solo cuando no hay períodos explícitos para evitar ORA-01036.
   */
  if (!Array.isArray(purchasePeriods) || purchasePeriods.length === 0) {
    if (!referenceDate) {
      throw new Error(
        "referenceDate es obligatorio cuando no se especifican purchasePeriods.",
      );
    }

    binds.referenceDate = referenceDate;
    binds.activityMonthOffset = -(Number(activityMonths) - 1);
  }

  const documentFilter = createInFilter({
    column: "C.COD_SOCIO",
    values: documentNumbers,
    bindPrefix: "documentNumber",
    binds,
  });

  const metricCondition = createMetricScopeCondition({
    alias: "C",
    purchasePeriods,
    customerIds,
    categoryIds,
    binds,
    bindPrefix: "breakdown",
  });

  const sql = `
    SELECT
      C.COD_SOCIO AS DOCUMENT_NUMBER,
      ${config.select},
      NVL(SUM(C.IMPORTE), 0) AS TOTAL_AMOUNT,
      COUNT(*) AS PURCHASE_COUNT

    FROM VW_BOT_COMPRAS_SOCIO C

    WHERE ${documentFilter}
      AND ${metricCondition}

    GROUP BY
      C.COD_SOCIO,
      ${config.groupBy}

    ORDER BY
      C.COD_SOCIO,
      ${config.orderBy}
  `;

  console.log("getMemberPurchaseBreakdownRepository SQL:", sql);
  console.log("getMemberPurchaseBreakdownRepository binds:", binds);

  const result = await executeOracleQuery(connection, sql, binds);
  const rows = Array.isArray(result) ? result : [];

  return rows.map((row) => ({
    documentNumber: String(row.DOCUMENT_NUMBER),
    ...config.map(row),
    totalAmount: Number(row.TOTAL_AMOUNT ?? 0),
    purchaseCount: Number(row.PURCHASE_COUNT ?? 0),
  }));
};
