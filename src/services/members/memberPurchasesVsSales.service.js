import { getMemberPurchasesVsSalesRepository } from "../../repositories/members/memberPurchasesVsSales.repository.js";

const VALID_ORDER_BY = [
  "percentage",
  "auditedSalesAmount",
  "exchangeAmount",
  "invoiceCount",
  "memberCount",
  "dimension",
];

const normalizeText = (value) => {
  return String(value ?? "")
    .trim()
    .toUpperCase();
};

const getCurrencyKey = ({ description, symbol }) => {
  const normalizedSymbol = normalizeText(symbol);

  if (normalizedSymbol) {
    return `SYMBOL:${normalizedSymbol}`;
  }

  return `DESCRIPTION:${normalizeText(description)}`;
};

const buildDimensions = ({ row, breakdownBy }) => {
  return breakdownBy.map((type, index) => {
    const position = index + 1;

    const rawId = row[`DIMENSION_${position}_ID`];

    const rawName = row[`DIMENSION_${position}_NAME`];

    return {
      type,

      id: rawId != null ? String(rawId) : null,

      name: rawName != null ? String(rawName) : null,
    };
  });
};

const getDimensionKey = (dimensions = []) => {
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    return "NO_DIMENSION";
  }

  return dimensions
    .map((dimension) => {
      const id = normalizeText(dimension.id);
      const name = normalizeText(dimension.name);

      return [normalizeText(dimension.type), id || name].join(":");
    })
    .join("|");
};

const buildCompositeKey = ({
  dimensions,
  currencyDescription,
  currencySymbol,
}) => {
  return [
    getDimensionKey(dimensions),

    getCurrencyKey({
      description: currencyDescription,
      symbol: currencySymbol,
    }),
  ].join("|");
};

const roundPercentage = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const getDimensionSortValue = (item) => {
  return (item.dimensions ?? [])
    .map((dimension) => dimension.name ?? dimension.id ?? "")
    .join(" | ");
};

const sortResults = ({ results, orderBy, orderDirection }) => {
  const effectiveOrderBy = VALID_ORDER_BY.includes(orderBy)
    ? orderBy
    : "dimension";

  const effectiveDirection =
    orderDirection === "asc" || orderDirection === "desc"
      ? orderDirection
      : effectiveOrderBy === "dimension"
        ? "asc"
        : "desc";

  const directionFactor = effectiveDirection === "asc" ? 1 : -1;

  const sorted = [...results].sort((a, b) => {
    if (effectiveOrderBy === "dimension") {
      return (
        getDimensionSortValue(a).localeCompare(getDimensionSortValue(b)) *
        directionFactor
      );
    }

    const aValue = Number(a[effectiveOrderBy] ?? 0);

    const bValue = Number(b[effectiveOrderBy] ?? 0);

    if (aValue === bValue) {
      return getDimensionSortValue(a).localeCompare(getDimensionSortValue(b));
    }

    return (aValue - bValue) * directionFactor;
  });

  return {
    results: sorted,

    orderBy: effectiveOrderBy,

    orderDirection: effectiveDirection,
  };
};

const validateArguments = (args) => {
  const parseDate = (value) => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? ""));
    if (!match) throw new Error("Indica fechas válidas en formato DD/MM/YYYY.");
    const [, day, month, year] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error("Indica fechas válidas en formato DD/MM/YYYY.");
    }
    return date;
  };
  if (parseDate(args.dateFrom) > parseDate(args.dateTo)) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  for (const key of ["customerIds", "categoryIds"]) {
    if (args[key] !== undefined && (!Array.isArray(args[key]) || args[key].some((id) => typeof id !== "string" || !id.trim()))) {
      throw new Error(`${key} debe contener identificadores previamente resueltos.`);
    }
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100)) throw new Error("El límite debe ser un entero entre 1 y 100.");
  if (args.orderBy !== undefined && !VALID_ORDER_BY.includes(args.orderBy)) throw new Error("Ordenamiento no soportado.");
  if (args.orderDirection !== undefined && !["asc", "desc"].includes(args.orderDirection)) throw new Error("Dirección de ordenamiento no soportada.");
};

export const compareMemberPurchasesVsSales = async (args, connection) => {
  validateArguments(args);
  const {
    dateFrom,
    dateTo,

    customerIds = [],
    categoryIds = [],

    breakdownBy = [],

    orderBy,
    orderDirection,

    limit,
  } = args;

  const repositoryResult = await getMemberPurchasesVsSalesRepository({
    connection,

    dateFrom,
    dateTo,

    customerIds,
    categoryIds,

    breakdownBy,
  });

  const normalizedBreakdownBy = repositoryResult.breakdownBy;

  /*
   * Partimos de ventas porque representan el denominador.
   */
  const resultMap = new Map();

  for (const row of repositoryResult.salesRows) {
    const dimensions = buildDimensions({
      row,
      breakdownBy: normalizedBreakdownBy,
    });

    const currencyDescription = row.CURRENCY_DESCRIPTION ?? null;

    const currencySymbol = row.CURRENCY_SYMBOL ?? null;

    const key = buildCompositeKey({
      dimensions,
      currencyDescription,
      currencySymbol,
    });

    resultMap.set(key, {
      dimensions,

      currency: {
        description: currencyDescription,
        symbol: currencySymbol,
      },

      auditedSalesAmount: Number(row.SALES_AMOUNT ?? 0),

      exchangeAmount: 0,

      invoiceCount: 0,

      memberCount: 0,
    });
  }

  /*
   * Incorporamos los canjes.
   *
   * Si existe canje sin un grupo equivalente de ventas,
   * lo conservamos. Su porcentaje será null cuando
   * el importe de ventas sea 0.
   */
  for (const row of repositoryResult.purchaseRows) {
    const dimensions = buildDimensions({
      row,
      breakdownBy: normalizedBreakdownBy,
    });

    const currencyDescription = row.CURRENCY_DESCRIPTION ?? null;

    const currencySymbol = row.CURRENCY_SYMBOL ?? null;

    const key = buildCompositeKey({
      dimensions,
      currencyDescription,
      currencySymbol,
    });

    if (!resultMap.has(key)) {
      resultMap.set(key, {
        dimensions,

        currency: {
          description: currencyDescription,
          symbol: currencySymbol,
        },

        auditedSalesAmount: 0,

        exchangeAmount: 0,

        invoiceCount: 0,

        memberCount: 0,
      });
    }

    const item = resultMap.get(key);

    item.exchangeAmount = Number(row.EXCHANGE_AMOUNT ?? 0);

    item.invoiceCount = Number(row.INVOICE_COUNT ?? 0);

    item.memberCount = Number(row.MEMBER_COUNT ?? 0);
  }

  const calculatedResults = Array.from(resultMap.values()).map((item) => ({
    ...item,

    percentage:
      item.auditedSalesAmount > 0
        ? roundPercentage((item.exchangeAmount / item.auditedSalesAmount) * 100)
        : null,
  }));

  const sortedResult = sortResults({
    results: calculatedResults,

    orderBy,

    orderDirection,
  });

  const requestedLimit =
    limit != null ? Math.max(1, Math.min(Number(limit), 100)) : null;

  const finalResults =
    requestedLimit != null
      ? sortedResult.results.slice(0, requestedLimit)
      : sortedResult.results;

  /*
   * IMPORTANTE:
   *
   * El resultado enviado a Bedrock contiene únicamente datos de negocio.
   * No se exponen nombres de vistas, SQL, campos de base de datos ni
   * fórmulas técnicas internas.
   */
  return {
    status: calculatedResults.length > 0 ? "FOUND" : "NOT_FOUND",

    period: {
      dateFrom,
      dateTo,
    },

    filters: {
      customerIds,
      categoryIds,
    },

    breakdownBy: normalizedBreakdownBy,

    ordering: {
      orderBy: sortedResult.orderBy,

      orderDirection: sortedResult.orderDirection,

      limit: requestedLimit,
    },

    summary: {
      totalGroups: calculatedResults.length,

      returnedGroups: finalResults.length,

      hasMore: finalResults.length < calculatedResults.length,
    },

    results: finalResults,
  };
};
