import { getSalesPerSqmRepository } from "../../repositories/sales/salesPerSqm.repository.js";
import { getCurrentUsdSellRateFromMaxicambios } from "../exchange/maxicambios.service.js";

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
};

const normalizeCurrencyCode = (currency) => {
  const values = [
    currency?.abbreviation,
    currency?.description,
  ]
    .filter(Boolean)
    .map((value) =>
      String(value)
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    );

  if (
    values.some(
      (value) =>
        value === "PYG" ||
        value === "GS" ||
        value === "GS." ||
        value.includes("GUARANI"),
    )
  ) {
    return "PYG";
  }

  if (
    values.some(
      (value) =>
        value === "USD" ||
        value === "$" ||
        value.includes("DOLAR"),
    )
  ) {
    return "USD";
  }

  return null;
};

const hasSales = (row) =>
  Number(row?.totalSales ?? 0) !== 0 ||
  Number(row?.totalInvoices ?? 0) !== 0;

const rowNeedsUsdConversion = (row) =>
  hasSales(row) &&
  normalizeCurrencyCode(row?.currency) === "PYG";

const enrichRow = (row, exchangeRate) => {
  const currencyCode = normalizeCurrencyCode(row.currency);

  let status = "OK";

  if (!hasSales(row)) {
    status = "NO_SALES";
  } else if (Number(row.currency?.distinctCurrencyCount ?? 0) > 1) {
    status = "MIXED_CURRENCY";
  } else if (!row.area?.complete || row.sourceSalesPerSqm === null) {
    status = "AREA_NOT_AVAILABLE";
  } else if (!currencyCode) {
    status = "CURRENCY_NOT_SUPPORTED";
  }

  const result = {
    ...row,
    status,
    sourceCurrency: currencyCode,
    salesPerSqm: {
      pyg: null,
      usd: null,
    },
    sales: {
      pyg: null,
      usd: null,
    },
  };

  /*
   * Las ventas totales siguen siendo válidas aunque no exista una
   * superficie contractual aplicable. AREA_NOT_AVAILABLE limita
   * únicamente el cálculo de ventas por m².
   *
   * En cambio, si no hay ventas, existen monedas mezcladas o la moneda
   * no puede identificarse, no exponemos importes convertidos.
   */
  if (
    status === "NO_SALES" ||
    status === "MIXED_CURRENCY" ||
    status === "CURRENCY_NOT_SUPPORTED"
  ) {
    return result;
  }

  if (currencyCode === "PYG") {
    result.sales.pyg = row.totalSales;

    if (exchangeRate?.sellRate) {
      result.sales.usd = row.totalSales / exchangeRate.sellRate;
    }

    if (status === "OK") {
      result.salesPerSqm.pyg = row.sourceSalesPerSqm;

      if (exchangeRate?.sellRate) {
        result.salesPerSqm.usd =
          row.sourceSalesPerSqm / exchangeRate.sellRate;
      }
    }

    return result;
  }

  if (currencyCode === "USD") {
    result.sales.usd = row.totalSales;

    if (status === "OK") {
      result.salesPerSqm.usd = row.sourceSalesPerSqm;
    }
  }

  return result;
};

export const getSalesPerSqm = async (
  {
    customerIds,
    dateFrom,
    dateTo,
    groupBy,
  },
  connection,
) => {
  const normalizedCustomerIds = normalizeArray(customerIds);
  const normalizedGroupBy = normalizeArray(groupBy);

  if (
    normalizedCustomerIds.length === 0 &&
    !normalizedGroupBy.includes("customer")
  ) {
    throw new Error(
      "Debe indicarse al menos un cliente o agrupar por cliente.",
    );
  }

  const repositoryResult = await getSalesPerSqmRepository({
    connection,
    customerIds: normalizedCustomerIds,
    dateFrom,
    dateTo,
    groupBy: normalizedGroupBy,
  });

  const rows = Array.isArray(repositoryResult?.data)
    ? repositoryResult.data
    : [repositoryResult];

  let exchangeRate = null;
  let exchangeRateError = null;

  if (rows.some(rowNeedsUsdConversion)) {
    try {
      exchangeRate = await getCurrentUsdSellRateFromMaxicambios();
    } catch (error) {
      exchangeRateError = error;
    }
  }

  const enrichedRows = rows.map((row) =>
    enrichRow(row, exchangeRate),
  );

  const exchange = exchangeRate
    ? {
        available: true,
        source: exchangeRate.source,
        rateType: "sell",
        sellRate: exchangeRate.sellRate,
        currentRate: true,
      }
    : rows.some(rowNeedsUsdConversion)
      ? {
          available: false,
          source: "Maxicambios",
          rateType: "sell",
          currentRate: true,
          reason: exchangeRateError
            ? "EXCHANGE_RATE_UNAVAILABLE"
            : "EXCHANGE_RATE_NOT_REQUIRED",
        }
      : {
          available: false,
          source: null,
          rateType: null,
          currentRate: null,
          reason: "EXCHANGE_RATE_NOT_REQUIRED",
        };

  if (Array.isArray(repositoryResult?.data)) {
    return {
      status: enrichedRows.length > 0 ? "OK" : "NO_SALES",
      dateFrom,
      dateTo,
      exchange,
      data: enrichedRows,
    };
  }

  return {
    ...enrichedRows[0],
    dateFrom,
    dateTo,
    exchange,
  };
};
