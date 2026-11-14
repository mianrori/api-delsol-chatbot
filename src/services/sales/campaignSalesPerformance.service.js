import { getCampaignForSalesAnalysis, getCampaignPeriodSales } from "../../repositories/sales/campaignSalesPerformance.repository.js";
import { throwIfRequestAborted } from "../requestContext.service.js";
// src/services/sales/campaignSalesPerformance.service.js


/*
|--------------------------------------------------------------------------
| Campaign sales performance
|--------------------------------------------------------------------------
|
| Compara el desempeño de ventas:
|
|   1. antes de la campaña;
|   2. durante la campaña;
|   3. después de la campaña.
|
| Regla predeterminada:
|
| Los períodos "antes" y "después" tienen exactamente la misma cantidad
| de días calendario que la campaña.
|
| Ejemplo:
|
| Campaña:
|   01/05/2023 -> 10/05/2023 = 10 días
|
| Antes:
|   21/04/2023 -> 30/04/2023 = 10 días
|
| Después:
|   11/05/2023 -> 20/05/2023 = 10 días
|
| El servicio:
|
| - no inventa fechas;
| - no resuelve promociones;
| - no infiere causas;
| - no atribuye causalidad;
| - utiliza las fechas exactas recibidas desde la resolución previa
|   de la promoción/campaña;
| - calcula las variaciones de forma determinística en Node.js.
|
|--------------------------------------------------------------------------
*/

const parseDate = (value, fieldName) => {
  if (typeof value !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    throw new Error(`${fieldName} debe tener formato DD/MM/YYYY.`);
  }

  const [day, month, year] = value.split("/").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} contiene una fecha inválida.`);
  }

  return date;
};

const formatDate = (date) => {
  const day = String(date.getUTCDate()).padStart(2, "0");

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
};

const addDays = (date, days) => {
  const result = new Date(date.getTime());

  result.setUTCDate(result.getUTCDate() + days);

  return result;
};

const diffDaysInclusive = (dateFrom, dateTo) => {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  const difference = dateTo.getTime() - dateFrom.getTime();

  return Math.floor(difference / millisecondsPerDay) + 1;
};

const round = (value, decimals = 4) => {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;

  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  return [value];
};

const getDirection = (previousValue, currentValue) => {
  if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) {
    return null;
  }

  if (currentValue > previousValue) {
    return "increase";
  }

  if (currentValue < previousValue) {
    return "decrease";
  }

  return "stable";
};

const compareMetric = (previousValue, currentValue) => {
  const previous = Number(previousValue ?? 0);

  const current = Number(currentValue ?? 0);

  const absoluteChange = current - previous;

  const percentageChange =
    previous === 0 ? null : (absoluteChange / previous) * 100;

  return {
    previousValue: previous,

    currentValue: current,

    absoluteChange,

    percentageChange:
      percentageChange === null ? null : round(percentageChange),

    direction: getDirection(previous, current),
  };
};

const currencyAliases = new Map([
  ["PYG", ["PYG", "GS", "GS.", "₲", "GUARANI", "GUARANIES", "GUARANI PARAGUAYO", "GUARANIES PARAGUAYOS"]],
  ["USD", ["USD", "US$", "U$S", "DOLAR", "DOLARES", "DOLAR AMERICANO", "DOLARES AMERICANOS", "DOLAR ESTADOUNIDENSE", "DOLARES ESTADOUNIDENSES", "US DOLLAR", "US DOLLARS", "UNITED STATES DOLLAR", "UNITED STATES DOLLARS"]],
  ["CAD", ["CAD", "C$", "CA$", "DOLAR CANADIENSE", "DOLARES CANADIENSES", "CANADIAN DOLLAR", "CANADIAN DOLLARS"]],
].flatMap(([code, aliases]) => aliases.map(alias => [alias, code])));

const identifyCurrency = currency => {
  const values = [currency.description, currency.abbreviation].map(value => String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " "));
  const codes = values.map(value => currencyAliases.get(value) ?? null);
  const status = !values.some(Boolean) ? "missing"
    : codes[0] && codes[1] && codes[0] !== codes[1] ? "contradictory"
    : values.some((value, i) => value && value !== "$" && !codes[i]) || !codes.some(Boolean) ? "unrecognized"
    : "identified";
  const code = status === "identified" ? codes.find(Boolean) : null;
  // Raw metadata is retained, but it never grants an inferred display currency.
  return { ...currency, code, status, symbol: code === "PYG" ? "₲" : null, symbolPosition: code === "PYG" ? "prefix" : null };
};

const monetaryReasons = {
  CURRENCY_MISSING: "Hay registros cuya moneda falta; no se comparan sus importes.",
  CURRENCY_UNRECOGNIZED: "Hay registros cuya moneda no se reconoce inequívocamente; no se comparan sus importes.",
  CURRENCY_CONTRADICTORY: "La descripción y la abreviatura indican monedas distintas; no se comparan sus importes.",
  MIXED_CURRENCIES: "Varias monedas en el período; importes separados, total monetario sin calcular.",
  CURRENCY_INCOMPATIBLE: "Los períodos tienen monedas distintas; no se comparan sus importes.",
  NO_RECORDS: "Ambos períodos carecen de registros; no hay moneda identificada para una comparación monetaria.",
};

const normalizeSalesResult = (result, durationDays) => {
  const groups = result.data.map(group => ({ ...group, currency: identifyCurrency(group.currency) }));
  const mixed = groups.length > 1;
  const invalid = groups.find(group => group.currency.status !== "identified");
  const reasonCode = invalid ? `CURRENCY_${invalid.currency.status.toUpperCase()}` : mixed ? "MIXED_CURRENCIES" : null;
  const totalAmount = reasonCode ? null : groups[0]?.totalAmount ?? 0;
  const totalInvoices = groups.reduce((n, row) => n + row.totalInvoices, 0);

  return {
    currency: (!mixed && groups[0]?.currency) || {
      description: null,
      abbreviation: null,
      code: null,
      status: groups.length ? "mixed" : "empty",
    },

    totalAmount,

    totalInvoices,

    averageDailyAmount:
      !reasonCode && durationDays > 0 ? round(totalAmount / durationDays) : null,

    averageDailyInvoices:
      durationDays > 0 ? round(totalInvoices / durationDays) : null,
    sourceRows: groups.reduce((n, row) => n + row.sourceRows, 0),
    currencyGroups: groups,
    reasonCode,
    calculationReason: monetaryReasons[reasonCode] ?? null,
  };
};

const validateCurrencyConsistency = (periods) => {
  const distinct = [...new Set(Object.values(periods).map(period => period.currency.code).filter(Boolean))];

  return {
    consistent: distinct.length <= 1 && Object.values(periods).every(period => !period.reasonCode),

    values: distinct,
  };
};

const buildComparison = (
  previousPeriod,
  currentPeriod,
  { previousLabel, currentLabel },
) => {
  const reasonCode = previousPeriod.reasonCode ?? currentPeriod.reasonCode
    ?? (previousPeriod.sourceRows && currentPeriod.sourceRows && previousPeriod.currency.code !== currentPeriod.currency.code ? "CURRENCY_INCOMPATIBLE" : null)
    ?? (!previousPeriod.sourceRows && !currentPeriod.sourceRows ? "NO_RECORDS" : null);
  const allowAmountComparison = !reasonCode;
  return {
  previousPeriod: previousLabel,

  currentPeriod: currentLabel,
  reasonCode,
  calculationReason: monetaryReasons[reasonCode] ?? null,
  currency: allowAmountComparison ? (currentPeriod.sourceRows ? currentPeriod.currency : previousPeriod.currency) : null,

  totalAmount: allowAmountComparison
    ? compareMetric(previousPeriod.totalAmount, currentPeriod.totalAmount)
    : null,

  totalInvoices: compareMetric(
    previousPeriod.totalInvoices,
    currentPeriod.totalInvoices,
  ),

  averageDailyAmount: allowAmountComparison
    ? compareMetric(
        previousPeriod.averageDailyAmount,
        currentPeriod.averageDailyAmount,
      )
    : null,

  averageDailyInvoices: compareMetric(
    previousPeriod.averageDailyInvoices,
    currentPeriod.averageDailyInvoices,
  ),
  };
};

export const getCampaignSalesPerformance = async (
  {
    promotionId,
    campaignId,

    promotionName,
    campaignName,

    campaignDateFrom,
    campaignDateTo,

    customerIds,
    categoryIds,
  },

  connection,
) => {

  /*
   * -------------------------------------------------------------
   * Validar fechas de campaña
   * -------------------------------------------------------------
   */

  const campaignFromDate = parseDate(campaignDateFrom, "campaignDateFrom");

  const campaignToDate = parseDate(campaignDateTo, "campaignDateTo");

  if (campaignToDate < campaignFromDate) {
    throw new Error("campaignDateTo no puede ser anterior a campaignDateFrom.");
  }

  /*
   * -------------------------------------------------------------
   * Construir períodos equivalentes
   * -------------------------------------------------------------
   */

  const durationDays = diffDaysInclusive(campaignFromDate, campaignToDate);

  const beforeDateTo = addDays(campaignFromDate, -1);

  const beforeDateFrom = addDays(campaignFromDate, -durationDays);

  const afterDateFrom = addDays(campaignToDate, 1);

  const afterDateTo = addDays(campaignToDate, durationDays);

  for (const [key, values] of Object.entries({ customerIds, categoryIds })) {
    if (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim()))) {
      throw new Error(`${key} debe contener identificadores previamente resueltos.`);
    }
  }
  if (promotionId == null || !String(promotionId).trim() || campaignId == null || !String(campaignId).trim()) {
    throw new Error("Resuelve la promoción y la campaña antes de analizar las ventas.");
  }
  throwIfRequestAborted();
  const resolvedCampaign = await getCampaignForSalesAnalysis({ connection, promotionId, campaignId });
  if (resolvedCampaign.FECHA_DESDE !== campaignDateFrom || resolvedCampaign.FECHA_HASTA !== campaignDateTo) {
    throw new Error("Las fechas no coinciden con la vigencia registrada. Resuelve nuevamente la campaña antes de analizar las ventas.");
  }
  throwIfRequestAborted();

  const normalizedCustomerIds = normalizeArray(customerIds);

  const normalizedCategoryIds = normalizeArray(categoryIds);

  const commonArgs = {
    customerIds: normalizedCustomerIds,

    categoryIds: normalizedCategoryIds,

  };

  /*
   * -------------------------------------------------------------
   * Consultar ventas
   * -------------------------------------------------------------
   *
   * Ejecutamos secuencialmente sobre la misma conexión.
   * Cada período utiliza exactamente los mismos filtros.
   * -------------------------------------------------------------
   */

  const beforeResult = await getCampaignPeriodSales({
    connection,

    ...commonArgs,

    dateFrom: formatDate(beforeDateFrom),

    dateTo: formatDate(beforeDateTo),
  });

  const duringResult = await getCampaignPeriodSales({
    connection,

    ...commonArgs,

    dateFrom: formatDate(campaignFromDate),

    dateTo: formatDate(campaignToDate),
  });

  const afterResult = await getCampaignPeriodSales({
    connection,

    ...commonArgs,

    dateFrom: formatDate(afterDateFrom),

    dateTo: formatDate(afterDateTo),
  });

  /*
   * -------------------------------------------------------------
   * Normalizar resultados
   * -------------------------------------------------------------
   */

  const periods = {
    before: {
      dateFrom: formatDate(beforeDateFrom),

      dateTo: formatDate(beforeDateTo),

      durationDays,

      ...normalizeSalesResult(beforeResult, durationDays),
    },

    during: {
      dateFrom: formatDate(campaignFromDate),

      dateTo: formatDate(campaignToDate),

      durationDays,

      ...normalizeSalesResult(duringResult, durationDays),
    },

    after: {
      dateFrom: formatDate(afterDateFrom),

      dateTo: formatDate(afterDateTo),

      durationDays,

      ...normalizeSalesResult(afterResult, durationDays),
    },
  };

  /*
   * -------------------------------------------------------------
   * Validar moneda
   * -------------------------------------------------------------
   */

  const currency = validateCurrencyConsistency(periods);

  /*
   * Solo las parejas con monedas identificadas y compatibles se comparan.
   * Un período vacío no equivale a registros con moneda desconocida.
   *
   * La cantidad de facturas sí puede compararse.
   */

  /*
   * -------------------------------------------------------------
   * Comparaciones
   * -------------------------------------------------------------
   */

  const comparisons = {
    duringVsBefore: buildComparison(periods.before, periods.during, {
      previousLabel: "before",

      currentLabel: "during",

    }),

    afterVsDuring: buildComparison(periods.during, periods.after, {
      previousLabel: "during",

      currentLabel: "after",

    }),

    afterVsBefore: buildComparison(periods.before, periods.after, {
      previousLabel: "before",

      currentLabel: "after",

    }),
  };

  return {
    analysisType: "campaignSalesPerformance",

    comparisonMode: "equivalentPeriod",

    campaign: {
      promotionId: String(resolvedCampaign.COD_PROMOCION),

      campaignId: String(resolvedCampaign.COD_CAMPANIA),

      promotionName: resolvedCampaign.NOMBRE_PROMOCION ?? null,

      campaignName: resolvedCampaign.NOMBRE_CAMPANIA ?? null,

      dateFrom: campaignDateFrom,

      dateTo: campaignDateTo,

      durationDays,
    },

    scope: {
      customerIds: normalizedCustomerIds,

      categoryIds: normalizedCategoryIds,
    },

    currency,

    periods,

    comparisons,

    interpretationRules: {
      causalAttributionAllowed: false,

      equivalentPeriods: true,
    },
  };
};
