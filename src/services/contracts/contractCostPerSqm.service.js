import { getContractConditions } from "./contractConditions.service.js";
import { getCurrentUsdSellRateFromMaxicambios } from "../exchange/maxicambios.service.js";

const normalizeCurrencyCode = (value) => {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (["PYG", "GS", "GS.", "₲"].includes(normalized)) return "PYG";
  if (["USD", "$", "US$"].includes(normalized)) return "USD";

  return normalized || null;
};

const currencySymbol = (code) =>
  code === "PYG" ? "₲" : code === "USD" ? "USD" : code;

const convertAmount = ({
  amount,
  sourceCurrency,
  targetCurrency,
  sellRate,
}) => {
  if (sourceCurrency === targetCurrency) return amount;

  if (sourceCurrency === "PYG" && targetCurrency === "USD") {
    return amount / sellRate;
  }

  if (sourceCurrency === "USD" && targetCurrency === "PYG") {
    return amount * sellRate;
  }

  throw new Error(
    `Conversión no soportada: ${sourceCurrency} a ${targetCurrency}.`,
  );
};

export const getContractCostPerSqm = async (
  {
    customerId,
    conceptCode,
    localNumber,
    contractType,
    contractSeries,
    contractNumber,
    targetCurrency = "PYG",
  },
  connection,
) => {
  const result = await getContractConditions(
    {
      customerId,
      localNumber,
      contractType,
      contractSeries,
      contractNumber,
      includeConcepts: true,
      includeLastBilledAmounts: true,
    },
    connection,
  );

  if (result.status !== "RESOLVED") {
    return result;
  }

  const { contract, concepts } = result;

  const squareMeters = Number(contract?.totalLocalArea);

  if (!Number.isFinite(squareMeters) || squareMeters <= 0) {
    return {
      status: "AREA_NOT_AVAILABLE",
      contract,
    };
  }

  const concept = (concepts ?? []).find(
    (item) => String(item.conceptCode) === String(conceptCode),
  );

  if (!concept) {
    return {
      status: "CONCEPT_NOT_FOUND",
      contract,
    };
  }

  const lastBilled = concept.lastBilled ?? null;

  if (!lastBilled) {
    return {
      status: "BILLED_AMOUNT_NOT_FOUND",
      contract,
      concept: {
        ...concept,
        lastBilled: undefined,
      },
      queryContext: result.queryContext ?? null,
    };
  }

  const amountExcludingTax = Number(lastBilled.amountExcludingTax);

  if (!Number.isFinite(amountExcludingTax)) {
    return {
      status: "BILLED_AMOUNT_NOT_FOUND",
      contract,
      concept: {
        ...concept,
        lastBilled: undefined,
      },
      queryContext: result.queryContext ?? null,
    };
  }

  const sourceCurrency = normalizeCurrencyCode(
    concept.invoiceCurrency?.code ??
      concept.contractCurrency?.code ??
      lastBilled.currencySymbol,
  );

  const normalizedTarget = normalizeCurrencyCode(targetCurrency);

  if (!["PYG", "USD"].includes(normalizedTarget)) {
    throw new Error(`targetCurrency no soportada: ${targetCurrency}`);
  }

  if (!["PYG", "USD"].includes(sourceCurrency)) {
    return {
      status: "CURRENCY_NOT_SUPPORTED",
      contract,
      concept: {
        ...concept,
        lastBilled: undefined,
      },
      sourceCurrency,
      targetCurrency: normalizedTarget,
    };
  }

  const sourceCostPerSqm = amountExcludingTax / squareMeters;

  let exchangeRate = null;
  let targetAmountExcludingTax = amountExcludingTax;
  let costPerSqm = sourceCostPerSqm;

  if (sourceCurrency !== normalizedTarget) {
    exchangeRate = await getCurrentUsdSellRateFromMaxicambios();

    targetAmountExcludingTax = convertAmount({
      amount: amountExcludingTax,
      sourceCurrency,
      targetCurrency: normalizedTarget,
      sellRate: exchangeRate.sellRate,
    });

    costPerSqm = convertAmount({
      amount: sourceCostPerSqm,
      sourceCurrency,
      targetCurrency: normalizedTarget,
      sellRate: exchangeRate.sellRate,
    });
  }

  return {
    status: "OK",
    contract,
    concept: {
      ...concept,
      lastBilled: undefined,
    },
    squareMeters,
    sourceAmountExcludingTax: amountExcludingTax,
    sourceCurrency: {
      code: sourceCurrency,
      symbol: currencySymbol(sourceCurrency),
    },
    sourceCostPerSqm,
    targetAmountExcludingTax,
    targetCurrency: {
      code: normalizedTarget,
      symbol: currencySymbol(normalizedTarget),
    },
    costPerSqm,
    exchangeRate: exchangeRate
      ? {
          source: exchangeRate.source,
          sellRate: exchangeRate.sellRate,
        }
      : null,
    lastInvoice: {
      invoiceNumber: lastBilled.invoiceNumber,
      invoiceDate: lastBilled.invoiceDate,
      billingPeriod: lastBilled.billingPeriod,
    },
    queryContext: result.queryContext ?? null,
  };
};
