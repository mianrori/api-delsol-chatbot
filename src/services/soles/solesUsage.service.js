import {
  getSolesUsageDetailRepository,
  getSolesUsageSummaryRepository,
} from "../../repositories/soles/solesUsage.repository.js";

const SUPPORTED_GROUP_BY = new Set([
  "member",
  "movementType",
  "destinationType",
  "destination",
  "solesType",
  "category",
  "day",
  "month",
  "year",
]);

const SUPPORTED_METRICS = new Set([
  "totalSolesUsed",
  "movementCount",
  "transactionCount",
  "averageSolesUsed",
  "minSolesUsed",
  "maxSolesUsed",
  "distinctDestinations",
  "distinctMembers",
  "lastUsageDate",
]);

const SUPPORTED_ORDER_BY = new Set([
  "totalSolesUsed",
  "movementCount",
  "transactionCount",
  "averageSolesUsed",
  "minSolesUsed",
  "maxSolesUsed",
  "distinctDestinations",
  "distinctMembers",
  "lastUsageDate",
]);

const SUPPORTED_DETAIL_ORDER_BY = new Set([
  "movementDate",
  "solesUsed",
  "transactionNumber",
]);

const SUPPORTED_DESTINATION_TYPES = new Set(["LOCAL", "SOCIO"]);

const DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

const normalizeArray = (value) => {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(value.filter((item) => item !== null && item !== undefined)),
  ];
};

const normalizeDate = (value, fieldName) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();

  if (!DATE_REGEX.test(normalized)) {
    throw new Error(`${fieldName} debe utilizar el formato DD/MM/YYYY.`);
  }

  const [day, month, year] = normalized.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${fieldName} contiene una fecha inválida.`);
  return normalized;
};

const normalizeDestinationTypes = (destinationTypes) => {
  return normalizeArray(destinationTypes)
    .map((item) => String(item).trim().toUpperCase())
    .filter((item) => SUPPORTED_DESTINATION_TYPES.has(item));
};

const normalizeDestinations = (destinations) => {
  if (!Array.isArray(destinations)) {
    return [];
  }

  return destinations
    .filter(
      (destination) =>
        destination &&
        destination.destinationType !== undefined &&
        destination.destinationType !== null &&
        destination.destinationCode !== undefined &&
        destination.destinationCode !== null,
    )
    .map((destination) => {
      const destinationType = String(destination.destinationType)
        .trim()
        .toUpperCase();

      if (!SUPPORTED_DESTINATION_TYPES.has(destinationType)) {
        return null;
      }

      return {
        destinationType,
        destinationCode: String(destination.destinationCode),
      };
    })
    .filter(Boolean);
};

const validateArgs = (args) => {
  if (args.mode != null && !["summary", "detail"].includes(args.mode)) throw new Error("Modo de consulta no soportado.");
  for (const key of ["movementTypes", "destinationTypes", "destinations", "solesTypeIds", "categoryIds", "groupBy", "metrics"]) {
    if (args[key] !== undefined && !Array.isArray(args[key])) throw new Error(`${key} debe ser una lista.`);
  }
  for (const key of ["movementTypes", "categoryIds"]) {
    if ((args[key] ?? []).some((value) => typeof value !== "string" || !value.trim())) throw new Error(`${key} debe contener valores previamente resueltos.`);
  }
  if ((args.solesTypeIds ?? []).some((value) => !/^-?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)))) throw new Error("Tipos de soles inválidos.");
  if ((args.destinationTypes ?? []).some((value) => typeof value !== "string" || !SUPPORTED_DESTINATION_TYPES.has(value.trim().toUpperCase()))) throw new Error("Tipo de destino inválido.");
  if ((args.destinations ?? []).some((value) => !value || !SUPPORTED_DESTINATION_TYPES.has(String(value.destinationType).trim().toUpperCase()) || value.destinationCode == null || !String(value.destinationCode).trim())) throw new Error("Resuelve el tipo y código exactos de cada destino.");
  if ((args.groupBy ?? []).some((value) => !SUPPORTED_GROUP_BY.has(value)) || (args.metrics ?? []).some((value) => !SUPPORTED_METRICS.has(value))) throw new Error("Agrupación o métrica no soportada.");
  if (args.documentNumber != null && (typeof args.documentNumber !== "string" || !args.documentNumber.trim())) throw new Error("Número de documento inválido.");
  if (args.transactionNumber != null && (!/^-?\d+$/.test(String(args.transactionNumber)) || (typeof args.transactionNumber === "number" && !Number.isSafeInteger(args.transactionNumber)))) throw new Error("Número de transacción inválido.");
  for (const [key, maximum] of [["limit", 500], ["pageSize", 200], ["rows", 200], ["page", Number.MAX_SAFE_INTEGER]]) {
    if (args[key] != null && (!Number.isSafeInteger(args[key]) || args[key] < 1 || args[key] > maximum)) throw new Error(`${key} debe ser un entero entre 1 y ${maximum}.`);
  }
  if (!Number.isSafeInteger((args.page ?? 1) * (args.pageSize ?? 50))) throw new Error("Página fuera de rango.");
  if (args.orderDirection != null && !["asc", "desc"].includes(args.orderDirection)) throw new Error("Dirección de ordenamiento no soportada.");
  if (args.orderBy != null && !(args.mode === "detail" ? SUPPORTED_DETAIL_ORDER_BY : SUPPORTED_ORDER_BY).has(args.orderBy)) throw new Error("Ordenamiento no soportado.");
};

const normalizeFilters = (args) => {
  const solesMin =
    args.solesMin === undefined || args.solesMin === null
      ? null
      : Number(args.solesMin);

  const solesMax =
    args.solesMax === undefined || args.solesMax === null
      ? null
      : Number(args.solesMax);

  if (solesMin !== null && !Number.isFinite(solesMin)) {
    throw new Error("solesMin debe ser numérico.");
  }

  if (solesMax !== null && !Number.isFinite(solesMax)) {
    throw new Error("solesMax debe ser numérico.");
  }

  if (solesMin !== null && solesMax !== null && solesMin > solesMax) {
    throw new Error("solesMin no puede ser mayor que solesMax.");
  }

  return {
    documentNumber: args.documentNumber ? String(args.documentNumber) : null,

    dateFrom: normalizeDate(args.dateFrom, "dateFrom"),

    dateTo: normalizeDate(args.dateTo, "dateTo"),

    movementTypes: normalizeArray(args.movementTypes).map(String),

    destinationTypes: normalizeDestinationTypes(args.destinationTypes),

    destinations: normalizeDestinations(args.destinations),

    solesTypeIds: normalizeArray(args.solesTypeIds).map(Number),

    categoryIds: normalizeArray(args.categoryIds).map(String),

    transactionNumber:
      args.transactionNumber === undefined || args.transactionNumber === null
        ? null
        : String(args.transactionNumber),

    solesMin,
    solesMax,
  };
};

const mapDetailRow = (row) => ({
  documentNumber: row.COD_SOCIO ?? null,

  memberName: row.NOM_SOCIO ?? null,

  movementDate: row.FECHA_MOVIMIENTO ?? null,

  movementType: row.TIPO_MOVIMIENTO ?? null,

  transactionNumber: row.NRO_TRANSACCION ?? null,

  solesUsed: row.SOLES_UTILIZADOS ?? null,

  destinationCode: row.COD_DESTINO ?? null,

  destinationName: row.DESTINO ?? null,

  destinationType: row.TIPO_DESTINO ?? null,

  solesTypeId: row.ID_TIPO_SOL ?? null,

  solesTypeDescription: row.DES_TIPO_SOL ?? null,

  categoryId: row.COD_RUBRO ?? null,

  categoryDescription: row.DES_RUBRO ?? null,
});

const mapSummaryRow = (row) => ({
  documentNumber: row.MEMBER_DOCUMENT_NUMBER ?? null,

  memberName: row.MEMBER_NAME ?? null,

  movementType: row.MOVEMENT_TYPE ?? null,

  destinationType: row.DESTINATION_TYPE ?? null,

  destinationCode: row.DESTINATION_CODE ?? null,

  destinationName: row.DESTINATION_NAME ?? null,

  solesTypeId: row.SOLES_TYPE_ID ?? null,

  solesTypeDescription: row.SOLES_TYPE_DESCRIPTION ?? null,

  categoryId: row.CATEGORY_ID ?? null,

  categoryDescription: row.CATEGORY_DESCRIPTION ?? null,

  day: row.DAY_LABEL ?? null,

  month: row.MONTH_LABEL ?? null,

  year: row.YEAR_LABEL ?? null,

  totalSolesUsed: row.TOTAL_SOLES_USED ?? null,

  movementCount: row.MOVEMENT_COUNT ?? null,

  transactionCount: row.TRANSACTION_COUNT ?? null,

  averageSolesUsed: row.AVERAGE_SOLES_USED ?? null,

  minSolesUsed: row.MIN_SOLES_USED ?? null,

  maxSolesUsed: row.MAX_SOLES_USED ?? null,

  distinctDestinations: row.DISTINCT_DESTINATIONS ?? null,

  distinctMembers: row.DISTINCT_MEMBERS ?? null,

  lastUsageDate: row.LAST_USAGE_DATE ?? null,
});

const removeNullProperties = (object) =>
  Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== null),
  );

/**
 * Obtiene un ranking real de socios y luego
 * el desglose por tipo de Sol de cada socio.
 *
 * Evita que:
 *
 * groupBy=["member","solesType"]
 * limit=10
 *
 * limite combinaciones socio + tipo de Sol
 * en lugar de devolver 10 socios distintos.
 */
const getMemberRankingWithSolesTypeBreakdown = async ({
  connection,
  filters,
  metrics,
  orderBy,
  orderDirection,
  limit,
}) => {
  const normalizedLimit = Number(limit);

  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
    throw new Error(
      "limit debe ser un número mayor que cero para rankings de socios.",
    );
  }

  /*
   * Primera etapa:
   * obtiene el Top N real de socios.
   */
  const rankingMetrics = [
    "totalSolesUsed",
    ...metrics.filter((metric) => metric !== "totalSolesUsed"),
  ];

  const rankingResult = await getSolesUsageSummaryRepository({
    connection,
    filters,
    groupBy: ["member"],
    metrics: rankingMetrics,
    orderBy: orderBy ?? "totalSolesUsed",
    orderDirection,
    limit: normalizedLimit,
  });

  const members = rankingResult.rows
    .map((row) => removeNullProperties(mapSummaryRow(row)))
    .filter((item) => item.documentNumber);

  /*
   * Segunda etapa:
   * obtiene el desglose por tipo
   * de Sol de cada socio seleccionado.
   */
  const data = [];

  for (const member of members) {
    const memberFilters = {
      ...filters,
      documentNumber: member.documentNumber,
    };

    const breakdownResult = await getSolesUsageSummaryRepository({
      connection,
      filters: memberFilters,

      groupBy: ["solesType"],

      metrics: metrics.length > 0 ? metrics : ["totalSolesUsed"],

      orderBy: "totalSolesUsed",

      orderDirection: "desc",

      limit: null,
    });

    const solesTypes = breakdownResult.rows.map((row) =>
      removeNullProperties(mapSummaryRow(row)),
    );

    data.push({
      documentNumber: member.documentNumber,

      memberName: member.memberName ?? null,

      totalSolesUsed: member.totalSolesUsed ?? null,

      lastUsageDate: member.lastUsageDate ?? null,

      solesTypes,
    });
  }

  return {
    mode: "summary",
    rankingBy: "member",
    queryContext: filters,
    summary: { totalMembers: rankingResult.totalGroups, returnedMembers: data.length, hasMore: data.length < rankingResult.totalGroups },

    metrics: metrics.length > 0 ? metrics : ["totalSolesUsed"],

    data,
  };
};

export const getSolesUsage = async (args = {}, connection) => {
  if (!connection) {
    throw new Error("No existe una conexión Oracle disponible.");
  }

  // Accept the pagination alias used by other tools; canonical pageSize wins.
  args = { ...args, pageSize: args.pageSize ?? args.rows };
  validateArgs(args);
  const mode = args.mode === "detail" ? "detail" : "summary";

  const filters = normalizeFilters(args);
  const dateKey = (value) => value?.split("/").reverse().join("");
  if (filters.dateFrom && filters.dateTo && dateKey(filters.dateFrom) > dateKey(filters.dateTo)) throw new Error("La fecha inicial no puede ser posterior a la final.");

  if (mode === "detail") {
    const result = await getSolesUsageDetailRepository({
      connection,
      filters,
      page: args.page ?? 1,
      pageSize: args.pageSize ?? 50,

      orderBy: SUPPORTED_DETAIL_ORDER_BY.has(args.orderBy)
        ? args.orderBy
        : "movementDate",

      orderDirection:
        String(args.orderDirection).toLowerCase() === "asc" ? "asc" : "desc",
    });

    const data = result.rows.map(mapDetailRow);

    return {
      mode: "detail",
      queryContext: filters,
      data,

      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        returnedRows: data.length,
        totalRows: result.totalRows,
        totalPages: Math.ceil(result.totalRows / result.pageSize),
        hasMore: result.page * result.pageSize < result.totalRows,
        nextPage: result.page * result.pageSize < result.totalRows ? result.page + 1 : null,
      },
    };
  }

  const groupBy = [...new Set(["solesType", ...normalizeArray(args.groupBy)])];

  const metrics = normalizeArray(args.metrics).filter((item) =>
    SUPPORTED_METRICS.has(item),
  );

  const orderBy = SUPPORTED_ORDER_BY.has(args.orderBy) ? args.orderBy : groupBy.includes("member") && args.limit ? "totalSolesUsed" : null;

  const orderDirection =
    String(args.orderDirection).toLowerCase() === "asc" ? "asc" : "desc";

  /*
   * Caso especial:
   * ranking de socios +
   * desglose obligatorio por tipo de Sol.
   */
  const isMemberRankingWithSolesType =
    groupBy.length === 2 &&
    groupBy.includes("member") &&
    groupBy.includes("solesType") &&
    orderBy === "totalSolesUsed" &&
    Number(args.limit) > 0;

  if (isMemberRankingWithSolesType) {
    return getMemberRankingWithSolesTypeBreakdown({
      connection,
      filters,
      metrics,
      orderBy,
      orderDirection,
      limit: args.limit,
    });
  }

  const result = await getSolesUsageSummaryRepository({
    connection,
    filters,
    groupBy,
    metrics,
    orderBy,
    orderDirection,
    limit: args.limit,
  });

  const data = result.rows.map((row) =>
    removeNullProperties(mapSummaryRow(row)),
  );

  if (groupBy.length === 0) {
    return {
      mode: "summary",
      metrics: result.metrics,
      result: data[0] ?? {},
    };
  }

  return {
    mode: "summary",
    groupBy: result.groupBy,
    queryContext: filters,
    summary: { totalGroups: result.totalGroups, returnedGroups: data.length, hasMore: data.length < result.totalGroups },
    metrics: result.metrics,
    data,
  };
};
