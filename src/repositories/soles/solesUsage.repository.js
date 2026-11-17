import { executeOracleQuery } from "../../database/oracle-query.database.js";
const GROUP_BY_CONFIG = {
  member: {
    select: ["COD_SOCIO AS MEMBER_DOCUMENT_NUMBER", "NOM_SOCIO AS MEMBER_NAME"],
    groupBy: ["COD_SOCIO", "NOM_SOCIO"],
    orderBy: ["NOM_SOCIO", "COD_SOCIO"],
  },
  movementType: {
    select: ["TIPO_MOVIMIENTO AS MOVEMENT_TYPE"],
    groupBy: ["TIPO_MOVIMIENTO"],
    orderBy: ["TIPO_MOVIMIENTO"],
  },
  destinationType: {
    select: ["TIPO_DESTINO AS DESTINATION_TYPE"],
    groupBy: ["TIPO_DESTINO"],
    orderBy: ["TIPO_DESTINO"],
  },
  destination: {
    select: [
      "TIPO_DESTINO AS DESTINATION_TYPE",
      "COD_DESTINO AS DESTINATION_CODE",
      "DESTINO AS DESTINATION_NAME",
    ],
    groupBy: ["TIPO_DESTINO", "COD_DESTINO", "DESTINO"],
    orderBy: ["DESTINO", "TIPO_DESTINO", "COD_DESTINO"],
  },
  solesType: {
    select: [
      "ID_TIPO_SOL AS SOLES_TYPE_ID",
      "DES_TIPO_SOL AS SOLES_TYPE_DESCRIPTION",
    ],
    groupBy: ["ID_TIPO_SOL", "DES_TIPO_SOL"],
    orderBy: ["DES_TIPO_SOL", "ID_TIPO_SOL"],
  },

  category: {
    select: ["COD_RUBRO AS CATEGORY_ID", "DES_RUBRO AS CATEGORY_DESCRIPTION"],
    groupBy: ["COD_RUBRO", "DES_RUBRO"],
    orderBy: ["DES_RUBRO", "COD_RUBRO"],
  },
  day: {
    select: [
      "TRUNC(FECHA_MOVIMIENTO) AS MOVEMENT_DAY",
      "TO_CHAR(TRUNC(FECHA_MOVIMIENTO), 'DD/MM/YYYY') AS DAY_LABEL",
    ],
    groupBy: ["TRUNC(FECHA_MOVIMIENTO)"],
    orderBy: ["TRUNC(FECHA_MOVIMIENTO)"],
  },
  month: {
    select: [
      "TRUNC(FECHA_MOVIMIENTO, 'MM') AS MOVEMENT_MONTH",
      "TO_CHAR(TRUNC(FECHA_MOVIMIENTO, 'MM'), 'MM/YYYY') AS MONTH_LABEL",
    ],
    groupBy: ["TRUNC(FECHA_MOVIMIENTO, 'MM')"],
    orderBy: ["TRUNC(FECHA_MOVIMIENTO, 'MM')"],
  },
  year: {
    select: ["TO_CHAR(FECHA_MOVIMIENTO, 'YYYY') AS YEAR_LABEL"],
    groupBy: ["TO_CHAR(FECHA_MOVIMIENTO, 'YYYY')"],
    orderBy: ["TO_CHAR(FECHA_MOVIMIENTO, 'YYYY')"],
  },
};

const METRIC_CONFIG = {
  totalSolesUsed: "SUM(NVL(SOLES_UTILIZADOS, 0)) AS TOTAL_SOLES_USED",
  movementCount: "COUNT(*) AS MOVEMENT_COUNT",
  transactionCount: `
    COUNT(
      DISTINCT CASE
        WHEN NRO_TRANSACCION IS NOT NULL
        THEN NVL(TIPO_MOVIMIENTO, '?') || ':' || TO_CHAR(NRO_TRANSACCION)
      END
    ) AS TRANSACTION_COUNT
  `,
  averageSolesUsed: "AVG(SOLES_UTILIZADOS) AS AVERAGE_SOLES_USED",
  minSolesUsed: "MIN(SOLES_UTILIZADOS) AS MIN_SOLES_USED",
  maxSolesUsed: "MAX(SOLES_UTILIZADOS) AS MAX_SOLES_USED",
  distinctDestinations: `
    COUNT(
      DISTINCT CASE
        WHEN COD_DESTINO IS NOT NULL
        THEN NVL(TIPO_DESTINO, '?') || ':' || COD_DESTINO
      END
    ) AS DISTINCT_DESTINATIONS
  `,
  distinctMembers: "COUNT(DISTINCT COD_SOCIO) AS DISTINCT_MEMBERS",
  lastUsageDate: "MAX(FECHA_MOVIMIENTO) AS LAST_USAGE_DATE",
};

const ORDER_BY_METRIC_CONFIG = {
  totalSolesUsed: "TOTAL_SOLES_USED",
  movementCount: "MOVEMENT_COUNT",
  transactionCount: "TRANSACTION_COUNT",
  averageSolesUsed: "AVERAGE_SOLES_USED",
  minSolesUsed: "MIN_SOLES_USED",
  maxSolesUsed: "MAX_SOLES_USED",
  distinctDestinations: "DISTINCT_DESTINATIONS",
  distinctMembers: "DISTINCT_MEMBERS",
  lastUsageDate: "LAST_USAGE_DATE",
};

const normalizeArray = (value) => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((item) => item !== null && item !== undefined)),
  ];
};

const addInFilter = ({ conditions, binds, column, values, bindPrefix }) => {
  const normalizedValues = normalizeArray(values);
  if (normalizedValues.length === 0) return;

  const groups = [];
  for (let offset = 0; offset < normalizedValues.length; offset += 1000) {
    const names = normalizedValues.slice(offset, offset + 1000).map((value, index) => {
      const key = `${bindPrefix}${offset + index}`; binds[key] = value; return `:${key}`;
    });
    groups.push(`${column} IN (${names.join(", ")})`);
  }
  conditions.push(`(${groups.join(" OR ")})`);
};

const addDestinationFilter = ({ conditions, binds, destinations }) => {
  if (!Array.isArray(destinations) || destinations.length === 0) return;

  const validDestinations = destinations.filter(
    (destination) =>
      destination &&
      destination.destinationType !== undefined &&
      destination.destinationType !== null &&
      destination.destinationCode !== undefined &&
      destination.destinationCode !== null,
  );

  if (validDestinations.length === 0) return;

  const destinationConditions = validDestinations.map((destination, index) => {
    const typeBind = `destinationType${index}`;
    const codeBind = `destinationCode${index}`;

    binds[typeBind] = destination.destinationType;
    binds[codeBind] = destination.destinationCode;

    return `(TIPO_DESTINO = :${typeBind} AND COD_DESTINO = :${codeBind})`;
  });

  conditions.push(`(${destinationConditions.join(" OR ")})`);
};

const buildWhereClause = (filters = {}) => {
  const conditions = ["1 = 1"];
  const binds = {};

  if (filters.documentNumber) {
    conditions.push("COD_SOCIO = :documentNumber");
    binds.documentNumber = String(filters.documentNumber);
  }

  if (filters.dateFrom) {
    conditions.push("FECHA_MOVIMIENTO >= TO_DATE(:dateFrom, 'DD/MM/YYYY')");
    binds.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    conditions.push("FECHA_MOVIMIENTO < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1");
    binds.dateTo = filters.dateTo;
  }

  addInFilter({
    conditions,
    binds,
    column: "TIPO_MOVIMIENTO",
    values: filters.movementTypes,
    bindPrefix: "movementType",
  });

  addInFilter({
    conditions,
    binds,
    column: "TIPO_DESTINO",
    values: filters.destinationTypes,
    bindPrefix: "destinationTypeFilter",
  });

  addInFilter({
    conditions,
    binds,
    column: "ID_TIPO_SOL",
    values: filters.solesTypeIds,
    bindPrefix: "solesTypeId",
  });

  addInFilter({
    conditions,
    binds,
    column: "COD_RUBRO",
    values: filters.categoryIds,
    bindPrefix: "categoryId",
  });

  addDestinationFilter({
    conditions,
    binds,
    destinations: filters.destinations,
  });

  if (
    filters.transactionNumber !== undefined &&
    filters.transactionNumber !== null
  ) {
    conditions.push("NRO_TRANSACCION = :transactionNumber");
    binds.transactionNumber = String(filters.transactionNumber);
  }

  if (filters.solesMin !== undefined && filters.solesMin !== null) {
    conditions.push("SOLES_UTILIZADOS >= :solesMin");
    binds.solesMin = Number(filters.solesMin);
  }

  if (filters.solesMax !== undefined && filters.solesMax !== null) {
    conditions.push("SOLES_UTILIZADOS <= :solesMax");
    binds.solesMax = Number(filters.solesMax);
  }

  return {
    whereSql: conditions.join("\n    AND "),
    binds,
  };
};

const buildSummaryQuery = ({
  groupBy = [],
  metrics = [],
  filters = {},
  orderBy,
  orderDirection = "desc",
  limit,
}) => {
  const safeGroupBy = normalizeArray(groupBy).filter(
    (item) => Object.hasOwn(GROUP_BY_CONFIG, item),
  );

  const safeMetrics = normalizeArray(metrics).filter(
    (item) => Object.hasOwn(METRIC_CONFIG, item),
  );

  const effectiveMetrics =
    safeMetrics.length > 0 ? safeMetrics : ["totalSolesUsed", "movementCount"];

  if (orderBy && Object.hasOwn(METRIC_CONFIG, orderBy) && !effectiveMetrics.includes(orderBy)) effectiveMetrics.push(orderBy);
  const select = ["COUNT(*) OVER() AS TOTAL_GROUPS"];
  const groupBySql = [];
  const defaultOrderBySql = [];

  for (const dimension of safeGroupBy) {
    const config = GROUP_BY_CONFIG[dimension];
    select.push(...config.select);
    groupBySql.push(...config.groupBy);
    defaultOrderBySql.push(...config.orderBy);
  }

  for (const metric of effectiveMetrics) {
    select.push(METRIC_CONFIG[metric]);
  }

  const { whereSql, binds } = buildWhereClause(filters);

  let sql = `
    SELECT
      ${select.join(",\n      ")}
    FROM VW_BOT_SOLES_UTILIZADOS
    WHERE ${whereSql}
  `;

  if (groupBySql.length > 0) {
    sql += `
    GROUP BY
      ${[...new Set(groupBySql)].join(",\n      ")}
    `;
  }

  const normalizedDirection =
    String(orderDirection).toLowerCase() === "asc" ? "ASC" : "DESC";

  if (orderBy && ORDER_BY_METRIC_CONFIG[orderBy]) {
    sql += `
    ORDER BY ${ORDER_BY_METRIC_CONFIG[orderBy]} ${normalizedDirection}${defaultOrderBySql.length ? ", " + [...new Set(defaultOrderBySql)].join(", ") : ""}
    `;
  } else if (defaultOrderBySql.length > 0) {
    sql += `
    ORDER BY ${[...new Set(defaultOrderBySql)].join(", ")}
    `;
  }

  if (limit !== undefined && limit !== null) {
    binds.resultLimit = Math.max(1, Math.min(Number(limit), 500));

    sql = `
      SELECT *
      FROM (
        ${sql}
      )
      WHERE ROWNUM <= :resultLimit
    `;
  }

  return {
    sql,
    binds,
    groupBy: safeGroupBy,
    metrics: effectiveMetrics,
  };
};

const buildDetailQuery = ({
  filters = {},
  page = 1,
  pageSize = 50,
  orderBy = "movementDate",
  orderDirection = "desc",
}) => {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const normalizedPageSize = Math.max(1, Math.min(Number(pageSize) || 50, 200));

  const rowFrom = (normalizedPage - 1) * normalizedPageSize + 1;
  const rowTo = normalizedPage * normalizedPageSize;

  const detailOrderByConfig = {
    movementDate: "Q.FECHA_MOVIMIENTO",
    solesUsed: "Q.SOLES_UTILIZADOS",
    transactionNumber: "Q.NRO_TRANSACCION",
  };

  const orderColumn =
    detailOrderByConfig[orderBy] ?? detailOrderByConfig.movementDate;

  const direction =
    String(orderDirection).toLowerCase() === "asc" ? "ASC" : "DESC";

  const { whereSql, binds } = buildWhereClause(filters);

  binds.rowFrom = rowFrom;
  binds.rowTo = rowTo;

  const sql = `
    WITH filtered AS (
      SELECT COD_SOCIO, NOM_SOCIO, FECHA_MOVIMIENTO, TIPO_MOVIMIENTO, NRO_TRANSACCION,
             SOLES_UTILIZADOS, COD_DESTINO, DESTINO, TIPO_DESTINO, ID_TIPO_SOL, DES_TIPO_SOL,
             COD_RUBRO, DES_RUBRO
        FROM VW_BOT_SOLES_UTILIZADOS WHERE ${whereSql}
    ), ranked AS (
      SELECT Q.*, ROW_NUMBER() OVER (
        ORDER BY ${orderColumn} ${direction} NULLS LAST, Q.FECHA_MOVIMIENTO DESC NULLS LAST,
                 Q.NRO_TRANSACCION DESC NULLS LAST, Q.COD_SOCIO, Q.TIPO_MOVIMIENTO,
                 Q.ID_TIPO_SOL, Q.TIPO_DESTINO, Q.COD_DESTINO, Q.COD_RUBRO, Q.SOLES_UTILIZADOS
      ) AS RN FROM filtered Q
    )
    SELECT page_rows.*, totals.TOTAL_ROWS
      FROM (SELECT COUNT(*) AS TOTAL_ROWS FROM filtered) totals
      LEFT JOIN (SELECT * FROM ranked WHERE RN BETWEEN :rowFrom AND :rowTo) page_rows ON 1 = 1
     ORDER BY page_rows.RN
  `;

  return {
    sql,
    binds,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
};

export const getSolesUsageSummaryRepository = async ({
  connection,
  filters,
  groupBy,
  metrics,
  orderBy,
  orderDirection,
  limit,
}) => {
  const query = buildSummaryQuery({
    filters,
    groupBy,
    metrics,
    orderBy,
    orderDirection,
    limit,
  });

  const result = await executeOracleQuery(connection, query.sql, query.binds);

  return {
    rows: result,
    totalGroups: Number(result[0]?.TOTAL_GROUPS ?? 0),
    groupBy: query.groupBy,
    metrics: query.metrics,
  };
};

export const getSolesUsageDetailRepository = async ({
  connection,
  filters,
  page,
  pageSize,
  orderBy,
  orderDirection,
}) => {
  const query = buildDetailQuery({
    filters,
    page,
    pageSize,
    orderBy,
    orderDirection,
  });

  const result = await executeOracleQuery(connection, query.sql, query.binds);

  return {
    rows: result.filter((row) => row.RN != null),
    totalRows: Number(result[0]?.TOTAL_ROWS ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
};
