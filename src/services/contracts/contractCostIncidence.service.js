import { contractBusinessConfig } from "../../config/contractBusiness.config.js";
import { getMonthlyBilledAmountsByConceptRepository } from "../../repositories/contracts/contractInvoiceAmounts.repository.js";
import { getHistoricalContractByMonthRepository } from "../../repositories/contracts/contractHistoryByPeriod.repository.js";
import { getContractConceptsRepository } from "../../repositories/contracts/contractConcepts.repository.js";
import { getSalesRepository } from "../../repositories/sales/sales.repository.js";

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
  contractRow,
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
  const costCurrenciesKnown = billedRows.every((row) => normalizeCurrencyCode(row.currencySymbol) !== null);
  const costCurrency =
    costCurrencies.length === 1 ? costCurrencies[0] : null;
  const totalCost = billedRows.reduce(
    (sum, row) => sum + Number(row.amountExcludingTax ?? 0),
    0,
  );

  const currencyCompatible =
    costCurrenciesKnown &&
    costCurrencies.length <= 1 &&
    (!salesRow || Boolean(salesCurrency && costCurrency && salesCurrency === costCurrency));

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
    contract: contractRow?.contract
      ? {
          type: contractRow.contract.type,
          series: contractRow.contract.series,
          number: contractRow.contract.number,
          contractDate: contractRow.contractDate ?? null,
          expirationDate: contractRow.expirationDate ?? null,
          localNumber: contractRow.localNumber ?? null,
          resolution: contractRow.resolution ?? null,
          applicable: contractRow.applicable === true,
        }
      : null,
    area: {
      min: contractRow?.totalLocalArea ?? null,
      max: contractRow?.totalLocalArea ?? null,
      distinctValues:
        contractRow?.totalLocalArea === null ||
        contractRow?.totalLocalArea === undefined
          ? 0
          : 1,
      changedWithinPeriod: false,
      available:
        contractRow?.totalLocalArea !== null &&
        contractRow?.totalLocalArea !== undefined,
      unit: "m2",
    },
    shoppingCost: {
      amount: !costCurrenciesKnown || costCurrencies.length > 1 ? null : totalCost,
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
    periods.every((item) => item.status !== "CURRENCY_MISMATCH") &&
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
      amount: salesCurrencies.length > 1 ? null : totalSales,
      currency: {
        code: salesCurrency,
        symbol: currencySymbol(salesCurrency),
      },
    },
    shoppingCost: {
      amount: costCurrencies.length > 1 || periods.some((item) => item.shoppingCost.amount === null) ? null : totalCost,
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
  const incidenceCodes = new Set(
    contractBusinessConfig.incidenceConceptCodes.map(String),
  );

  const historicalContracts = await getHistoricalContractByMonthRepository({
    connection,
    customerId,
    dateFrom,
    dateTo,
    localNumber,
    contractType,
    contractSeries,
    contractNumber,
  });

  const contractByMonth = new Map(
    (historicalContracts ?? []).map((row) => [
      normalizePeriodMonth(row.periodMonth),
      row,
    ]),
  );

  const contractIdentityKey = (contract) =>
    contract
      ? `${contract.type}|${contract.series}|${contract.number}`
      : null;

  const uniqueContracts = Array.from(
    new Map(
      (historicalContracts ?? [])
        .filter((row) => row?.contract)
        .map((row) => [contractIdentityKey(row.contract), row.contract]),
    ).values(),
  );

  const conceptsByContract = new Map();

  await Promise.all(
    uniqueContracts.map(async (contract) => {
      const concepts = await getContractConceptsRepository({
        connection,
        contractType: contract.type,
        contractSeries: contract.series,
        contractNumber: contract.number,
        conceptCodes: contractBusinessConfig.incidenceConceptCodes,
      });

      conceptsByContract.set(
        contractIdentityKey(contract),
        (concepts ?? []).filter((concept) =>
          incidenceCodes.has(String(concept.conceptCode)),
        ),
      );
    }),
  );

  const allConfiguredConcepts = Array.from(
    new Map(
      Array.from(conceptsByContract.values())
        .flat()
        .map((concept) => [String(concept.conceptCode), concept]),
    ).values(),
  );

  const conceptCodes =
    allConfiguredConcepts.length > 0
      ? allConfiguredConcepts.map((concept) => String(concept.conceptCode))
      : contractBusinessConfig.incidenceConceptCodes.map(String);

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

  const periods = months.map((month) => {
    const resolvedContractRow = contractByMonth.get(month) ?? null;
    const configuredConcepts = resolvedContractRow?.contract
      ? conceptsByContract.get(
          contractIdentityKey(resolvedContractRow.contract),
        ) ?? []
      : [];
    const configuredCodes = new Set(
      configuredConcepts.map((concept) => String(concept.conceptCode)),
    );
    const monthlyBilledRows = (billedByMonth.get(month) ?? []).filter((row) =>
      configuredCodes.has(String(row.conceptCode)),
    );

    const useNearestContractFallback =
      resolvedContractRow?.resolution === "NEAREST" &&
      monthlyBilledRows.length > 0;

    const contractRow =
      resolvedContractRow?.applicable === true ||
      useNearestContractFallback
        ? {
            ...resolvedContractRow,
            resolution: useNearestContractFallback
              ? "NEAREST_BILLED_FALLBACK"
              : "APPLICABLE",
          }
        : null;

    return buildPeriodResult({
      month,
      salesRow: salesByMonth.get(month) ?? null,
      billedRows: contractRow ? monthlyBilledRows : [],
      configuredConcepts: contractRow ? configuredConcepts : [],
      contractRow,
    });
  });

  const identitySource =
    (historicalContracts ?? []).find((row) => row?.customerId) ?? null;

  const common = {
    customer: {
      id: String(customerId),
      name: identitySource?.customerName ?? null,
      businessName: identitySource?.businessName ?? null,
    },
    dateFrom,
    dateTo,
    groupBy,
    configuredCostConcepts: allConfiguredConcepts.map(mapConcept),
    queryContext: {
      costDefinition: "officialConfiguredConceptsByHistoricalContract",
      contractRule: "applicableContractByMonthOrNearestWhenOfficialConceptsWereBilled",
      billedAmountRule:
        "latestInvoiceByCustomerConfiguredConceptAndInvoiceMonthExcludingTax",
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
