import { contractBusinessConfig } from "../../config/contractBusiness.config.js";
import { getMonthlyBilledAmountsByConceptRepository } from "../../repositories/contracts/contractInvoiceAmounts.repository.js";
import { getSalesRepository } from "../../repositories/sales/sales.repository.js";
import { getContractConditions } from "./contractConditions.service.js";

const parseDate = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? ""));

  if (!match) return null;

  const [, dayText, monthText, yearText] = match;
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );

  if (
    date.getUTCFullYear() !== Number(yearText) ||
    date.getUTCMonth() !== Number(monthText) - 1 ||
    date.getUTCDate() !== Number(dayText)
  ) {
    return null;
  }

  return date;
};

const formatMonth = (date) =>
  `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;

const enumerateMonths = (dateFrom, dateTo) => {
  const start = parseDate(dateFrom);
  const end = parseDate(dateTo);

  if (!start || !end || start > end) {
    throw new Error("Rango de fechas inválido.");
  }

  const months = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1),
  );

  while (cursor <= last) {
    months.push(formatMonth(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
};

const normalizePeriodMonth = (value) => {
  if (!value) return null;

  const text = String(value).trim();
  const directMatch = /^(\d{2})\/(\d{4})$/.exec(text);

  if (directMatch) {
    return text;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatMonth(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
  );
};

const normalizeCurrencyCode = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized === "PYG" ||
    normalized === "GS" ||
    normalized === "GS." ||
    normalized === "₲" ||
    normalized.includes("GUARANI")
  ) {
    return "PYG";
  }

  if (
    normalized === "USD" ||
    normalized === "$" ||
    normalized === "US$" ||
    normalized.includes("DOLAR")
  ) {
    return "USD";
  }

  return normalized || null;
};

const currencySymbol = (code) =>
  code === "PYG" ? "₲" : code === "USD" ? "USD" : code;

const getSalesCurrency = (salesRow) =>
  normalizeCurrencyCode(
    salesRow?.currency?.abbreviation ??
      salesRow?.currency?.description ??
      salesRow?.currency?.symbol,
  );

const getCostCurrencies = (rows) =>
  Array.from(
    new Set(
      rows
        .map((row) => normalizeCurrencyCode(row.currencySymbol))
        .filter(Boolean),
    ),
  );

const mapConcept = (concept) => ({
  conceptCode: String(concept.conceptCode),
  description: concept.description ?? null,
});

const buildPeriodResult = ({
  month,
  salesRow,
  billedRows,
  configuredConcepts,
}) => {
  const salesAmount = Number(salesRow?.totalAmount ?? 0);
  const salesCurrency = getSalesCurrency(salesRow);
  const billedByConcept = new Map(
    billedRows.map((row) => [String(row.conceptCode), row]),
  );

  const missingConcepts = configuredConcepts
    .filter((concept) => !billedByConcept.has(String(concept.conceptCode)))
    .map(mapConcept);

  const costCurrencies = getCostCurrencies(billedRows);
  const costCurrency =
    costCurrencies.length === 1 ? costCurrencies[0] : null;
  const totalCost = billedRows.reduce(
    (sum, row) => sum + Number(row.amountExcludingTax ?? 0),
    0,
  );

  const currencyCompatible =
    costCurrencies.length <= 1 &&
    (!salesCurrency || !costCurrency || salesCurrency === costCurrency);

  let status = "OK";

  if (billedRows.length === 0) {
    status = "COST_NOT_AVAILABLE";
  } else if (!currencyCompatible) {
    status = "CURRENCY_MISMATCH";
  } else if (salesAmount === 0) {
    status = "NO_SALES";
  } else if (missingConcepts.length > 0) {
    status = "PARTIAL_COST";
  }

  const incidencePercentage =
    billedRows.length > 0 &&
    currencyCompatible &&
    salesAmount !== 0
      ? Number(((totalCost / salesAmount) * 100).toFixed(4))
      : null;

  return {
    month,
    status,
    sales: {
      amount: salesAmount,
      currency: {
        code: salesCurrency,
        symbol: currencySymbol(salesCurrency),
      },
    },
    shoppingCost: {
      amount: totalCost,
      currency: {
        code: costCurrency,
        symbol: currencySymbol(costCurrency),
      },
      complete: missingConcepts.length === 0 && billedRows.length > 0,
      missingConcepts,
      concepts: billedRows.map((row) => {
        const concept = configuredConcepts.find(
          (item) => String(item.conceptCode) === String(row.conceptCode),
        );

        return {
          conceptCode: String(row.conceptCode),
          description: concept?.description ?? null,
          amountExcludingTax: Number(row.amountExcludingTax ?? 0),
          currency: {
            code: normalizeCurrencyCode(row.currencySymbol),
            symbol: currencySymbol(normalizeCurrencyCode(row.currencySymbol)),
          },
          invoiceNumber: row.invoiceNumber ?? null,
          invoiceDate: row.invoiceDate ?? null,
          billingPeriod: row.billingPeriod ?? null,
        };
      }),
    },
    incidencePercentage,
    incidenceBasis:
      status === "PARTIAL_COST"
        ? "AVAILABLE_COST_ONLY"
        : incidencePercentage !== null
          ? "COMPLETE_COST"
          : null,
  };
};

const buildSummary = (periods) => {
  const totalSales = periods.reduce(
    (sum, item) => sum + Number(item.sales.amount ?? 0),
    0,
  );
  const totalCost = periods.reduce(
    (sum, item) => sum + Number(item.shoppingCost.amount ?? 0),
    0,
  );

  const salesCurrencies = Array.from(
    new Set(periods.map((item) => item.sales.currency.code).filter(Boolean)),
  );
  const costCurrencies = Array.from(
    new Set(
      periods.map((item) => item.shoppingCost.currency.code).filter(Boolean),
    ),
  );

  const salesCurrency =
    salesCurrencies.length === 1 ? salesCurrencies[0] : null;
  const costCurrency =
    costCurrencies.length === 1 ? costCurrencies[0] : null;
  const currencyCompatible =
    salesCurrencies.length <= 1 &&
    costCurrencies.length <= 1 &&
    (!salesCurrency || !costCurrency || salesCurrency === costCurrency);

  const missingConceptsByPeriod = periods
    .filter((item) => item.shoppingCost.missingConcepts.length > 0)
    .map((item) => ({
      month: item.month,
      concepts: item.shoppingCost.missingConcepts,
    }));

  const hasAnyCost = periods.some(
    (item) => item.shoppingCost.concepts.length > 0,
  );
  const costComplete =
    hasAnyCost &&
    periods.every((item) => item.shoppingCost.complete === true);

  let status = "OK";

  if (!hasAnyCost) {
    status = "COST_NOT_AVAILABLE";
  } else if (!currencyCompatible) {
    status = "CURRENCY_MISMATCH";
  } else if (totalSales === 0) {
    status = "NO_SALES";
  } else if (!costComplete) {
    status = "PARTIAL_COST";
  }

  const incidencePercentage =
    hasAnyCost &&
    currencyCompatible &&
    totalSales !== 0
      ? Number(((totalCost / totalSales) * 100).toFixed(4))
      : null;

  return {
    status,
    sales: {
      amount: totalSales,
      currency: {
        code: salesCurrency,
        symbol: currencySymbol(salesCurrency),
      },
    },
    shoppingCost: {
      amount: totalCost,
      currency: {
        code: costCurrency,
        symbol: currencySymbol(costCurrency),
      },
      complete: costComplete,
      missingConceptsByPeriod,
      conceptBreakdownByPeriod: periods.map((item) => ({
        month: item.month,
        concepts: item.shoppingCost.concepts,
        missingConcepts: item.shoppingCost.missingConcepts,
      })),
      ...(periods.length === 1
        ? {
            concepts: periods[0].shoppingCost.concepts,
            missingConcepts: periods[0].shoppingCost.missingConcepts,
          }
        : {}),
    },
    incidencePercentage,
    incidenceBasis:
      status === "PARTIAL_COST"
        ? "AVAILABLE_COST_ONLY"
        : incidencePercentage !== null
          ? "COMPLETE_COST"
          : null,
  };
};

export const analyzeContractCostIncidence = async (
  {
    customerId,
    dateFrom,
    dateTo,
    groupBy = "summary",
    localNumber,
    contractType,
    contractSeries,
    contractNumber,
  },
  connection,
) => {
  if (!customerId) {
    throw new Error("customerId es obligatorio.");
  }

  if (!dateFrom || !dateTo) {
    throw new Error("dateFrom y dateTo son obligatorios.");
  }

  if (!["summary", "month"].includes(groupBy)) {
    throw new Error(`groupBy no soportado: ${groupBy}`);
  }

  const months = enumerateMonths(dateFrom, dateTo);

  const contractResult = await getContractConditions(
    {
      customerId,
      localNumber,
      contractType,
      contractSeries,
      contractNumber,
      includeConcepts: true,
      includeLastBilledAmounts: false,
    },
    connection,
  );

  if (contractResult.status !== "RESOLVED") {
    return contractResult;
  }

  const incidenceCodes = new Set(
    contractBusinessConfig.incidenceConceptCodes.map(String),
  );
  const configuredConcepts = (contractResult.concepts ?? []).filter((concept) =>
    incidenceCodes.has(String(concept.conceptCode)),
  );

  if (configuredConcepts.length === 0) {
    return {
      status: "COST_CONCEPTS_NOT_CONFIGURED",
      contract: contractResult.contract,
      dateFrom,
      dateTo,
      groupBy,
    };
  }

  const conceptCodes = configuredConcepts.map((concept) =>
    String(concept.conceptCode),
  );

  const [billedRows, salesResult] = await Promise.all([
    getMonthlyBilledAmountsByConceptRepository({
      connection,
      customerId,
      conceptCodes,
      dateFrom,
      dateTo,
    }),
    getSalesRepository({
      connection,
      customerIds: [String(customerId)],
      dateFrom,
      dateTo,
      groupBy: ["year", "month"],
      metrics: ["totalAmount"],
    }),
  ]);

  const salesRows = Array.isArray(salesResult?.data)
    ? salesResult.data
    : [];
  const salesByMonth = new Map(
    salesRows.map((row) => [
      `${String(row.month).padStart(2, "0")}/${row.year}`,
      row,
    ]),
  );

  const billedByMonth = new Map();

  for (const row of billedRows) {
    const month = normalizePeriodMonth(row.periodMonth);

    if (!month) continue;

    if (!billedByMonth.has(month)) {
      billedByMonth.set(month, []);
    }

    billedByMonth.get(month).push(row);
  }

  const periods = months.map((month) =>
    buildPeriodResult({
      month,
      salesRow: salesByMonth.get(month) ?? null,
      billedRows: billedByMonth.get(month) ?? [],
      configuredConcepts,
    }),
  );

  const common = {
    customer: {
      id: String(contractResult.contract.customerId),
      name: contractResult.contract.customerName ?? null,
      businessName: contractResult.contract.businessName ?? null,
    },
    dateFrom,
    dateTo,
    groupBy,
    configuredCostConcepts: configuredConcepts.map(mapConcept),
    queryContext: {
      costDefinition: "officialConfiguredConcepts",
      billedAmountRule: "latestInvoiceByCustomerConceptAndMonthExcludingTax",
      salesRule: "auditedSalesSamePeriod",
    },
  };

  if (groupBy === "month") {
    return {
      status: periods.some((item) => item.status !== "NO_SALES")
        ? "OK"
        : "NO_SALES",
      ...common,
      data: periods,
    };
  }

  return {
    ...common,
    ...buildSummary(periods),
  };
};
