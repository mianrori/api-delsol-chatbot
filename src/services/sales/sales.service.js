import { getSalesRepository } from "../../repositories/sales/sales.repository.js";
import { createSalesExport } from "../exports/salesExport.service.js";
import { buildSalesInsights } from "./salesInsights.service.js";

const AUTO_EXPORT_THRESHOLD = 20;

const LOCAL_SALES_CURRENCY = {
  description: "GUARANIES",
  abbreviation: "PYG",
  symbol: "₲",
  symbolPosition: "prefix",
};

const ensureSalesCurrency = (result) => {
  if (!result || typeof result !== "object") {
    return result;
  }

  const withCurrency = (row) => ({
    ...row,
    currency: {
      description:
        row?.currency?.description ?? LOCAL_SALES_CURRENCY.description,
      abbreviation:
        row?.currency?.abbreviation ?? LOCAL_SALES_CURRENCY.abbreviation,
      symbol:
        row?.currency?.symbol ?? LOCAL_SALES_CURRENCY.symbol,
      symbolPosition:
        row?.currency?.symbolPosition ??
        LOCAL_SALES_CURRENCY.symbolPosition,
    },
  });

  if (Array.isArray(result.data)) {
    return {
      ...result,
      data: result.data.map(withCurrency),
    };
  }

  return withCurrency(result);
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

export const getSales = async (
  {
    customerIds,
    categoryIds,
    dateFrom,
    dateTo,
    dayType,
    groupBy,
    metrics,
  },
  connection,
  username,
) => {
  const normalizedMetrics = normalizeArray(metrics);

  const args = {
    customerIds: normalizeArray(customerIds),
    categoryIds: normalizeArray(categoryIds),
    dateFrom,
    dateTo,
    dayType,
    groupBy: normalizeArray(groupBy),
    metrics:
      normalizedMetrics.length > 0
        ? normalizedMetrics
        : ["totalAmount", "totalInvoices"],
  };

  const repositoryResult = await getSalesRepository({
    connection,
    ...args,
  });

  const result = ensureSalesCurrency(repositoryResult);

  const insights = buildSalesInsights({
    salesResult: result,
    groupBy: args.groupBy,
    metrics: args.metrics,
  });

  const resultWithInsights = insights
    ? {
        ...result,
        insights,
      }
    : result;

  const rows = Array.isArray(result?.data) ? result.data : [];

  if (rows.length <= AUTO_EXPORT_THRESHOLD) {
    return resultWithInsights;
  }

  try {
    const exportDefinition = await createSalesExport({
      username,
      args,
      totalRecords: rows.length,
    });

    return {
      ...resultWithInsights,
      export: {
        available: true,
        exportId: exportDefinition.exportId,
        fileName: exportDefinition.fileName,
        expiresAt: exportDefinition.expiresAt,
        totalRecords: rows.length,
        format: "xlsx",
      },
    };
  } catch (error) {
    console.error("No fue posible preparar la exportación de ventas:", error);
    return resultWithInsights;
  }
};
