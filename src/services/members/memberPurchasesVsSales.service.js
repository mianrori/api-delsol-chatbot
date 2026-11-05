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
  // The SQL groups by both fields. A symbol alone is not a currency identity
  // (several currencies use "$"), and collapsing those groups loses amounts
  // and distinct-member counts. Preserve the exact source pair; no FX or
  // speculative alias matching is performed by this comparison.
  return JSON.stringify([description ?? null, symbol ?? null]);
};

const currencyAliases = new Map([
  ["PYG", ["PYG", "GS", "GS.", "₲", "GUARANI", "GUARANIES", "GUARANI PARAGUAYO", "GUARANIES PARAGUAYOS"]],
  ["USD", ["USD", "US$", "U$S", "DOLAR", "DOLARES", "DOLAR AMERICANO", "DOLARES AMERICANOS", "DOLAR ESTADOUNIDENSE", "DOLARES ESTADOUNIDENSES", "US DOLLAR", "US DOLLARS", "UNITED STATES DOLLAR", "UNITED STATES DOLLARS"]],
  ["CAD", ["CAD", "C$", "CA$", "DOLAR CANADIENSE", "DOLARES CANADIENSES", "CANADIAN DOLLAR", "CANADIAN DOLLARS"]],
].flatMap(([code, aliases]) => aliases.map(alias => [alias, code])));

const identifyCurrency = ({ description, symbol }) => {
  const values = [description, symbol].map(value => normalizeText(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "));
  const codes = values.map(value => currencyAliases.get(value) ?? null);
  if (codes[0] && codes[1] && codes[0] !== codes[1]) {
    return { code: null, status: "contradictory" };
  }
  // "$" is neutral, never a USD identifier. Every other nonempty field must
  // be recognized; a known symbol cannot override an unknown description.
  if (values.some((value, index) => value && value !== "$" && !codes[index]) || !codes.some(Boolean)) {
    return { code: null, status: "ambiguous" };
  }
  return { code: codes[0] ?? codes[1], status: "identified" };
};

const percentageReasons = {
  CURRENCY_AMBIGUOUS: "La moneda no está identificada de forma inequívoca; no se calcula el porcentaje.",
  CURRENCY_CONTRADICTION: "La descripción y el símbolo indican monedas distintas; no se calcula el porcentaje.",
  CURRENCY_INCOMPATIBLE: "Los canjes y las ventas indican monedas distintas para este grupo; no se comparan sus importes.",
  CURRENCY_METADATA_MISMATCH: "No hay contraparte con la misma descripción y símbolo de moneda; no se unen alias ni se convierten importes.",
  SALES_NOT_POSITIVE: "No hay ventas positivas en esta moneda para calcular el porcentaje.",
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
  const salesCurrencies = new Map();
  const purchaseCurrencies = new Map();
  const rememberCurrency = (map, dimensions, currency) => {
    const dimensionKey = getDimensionKey(dimensions);
    if (!map.has(dimensionKey)) map.set(dimensionKey, new Map());
    map.get(dimensionKey).set(getCurrencyKey(currency), identifyCurrency(currency));
  };

  for (const row of repositoryResult.salesRows) {
    const dimensions = buildDimensions({
      row,
      breakdownBy: normalizedBreakdownBy,
    });

    const currencyDescription = row.CURRENCY_DESCRIPTION ?? null;

    const currencySymbol = row.CURRENCY_SYMBOL ?? null;
    rememberCurrency(salesCurrencies, dimensions, { description: currencyDescription, symbol: currencySymbol });

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
    rememberCurrency(purchaseCurrencies, dimensions, { description: currencyDescription, symbol: currencySymbol });

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

  const calculatedResults = Array.from(resultMap.values()).map(item => {
    const identity = identifyCurrency(item.currency);
    let reasonCode = identity.status === "contradictory" ? "CURRENCY_CONTRADICTION"
      : identity.status !== "identified" ? "CURRENCY_AMBIGUOUS" : null;
    const dimensionKey = getDimensionKey(item.dimensions), currencyKey = getCurrencyKey(item.currency);
    const sales = salesCurrencies.get(dimensionKey), purchases = purchaseCurrencies.get(dimensionKey);
    // A missing counterpart must not become a calculated zero when the other
    // source has a different/unknown currency for this same dimension. Genuine
    // absence of all purchases still represents zero purchases in a known unit.
    if (!reasonCode) {
      const counterparts = !sales?.has(currencyKey) ? sales : !purchases?.has(currencyKey) ? purchases : null;
      if (counterparts?.size) {
        const identities = [...counterparts.values()];
        reasonCode = identities.some(other => other.status !== "identified") ? "CURRENCY_AMBIGUOUS"
          : identities.some(other => other.code === identity.code) ? "CURRENCY_METADATA_MISMATCH"
            : "CURRENCY_INCOMPATIBLE";
      }
    }
    if (!reasonCode && item.auditedSalesAmount <= 0) reasonCode = "SALES_NOT_POSITIVE";
    return {
      ...item,
      currency: { ...item.currency, ...identity },
      percentage: reasonCode ? null : roundPercentage((item.exchangeAmount / item.auditedSalesAmount) * 100),
      percentageReasonCode: reasonCode,
      percentageReason: reasonCode ? percentageReasons[reasonCode] : null,
    };
  });

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
