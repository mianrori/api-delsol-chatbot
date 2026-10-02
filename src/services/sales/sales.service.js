import { getSalesRepository } from "../../repositories/sales/sales.repository.js";
import { buildSalesInsights } from "./salesInsights.service.js";

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

  const result = await getSalesRepository({
    connection,
    ...args,
  });

  const insights = buildSalesInsights({
    salesResult: result,
    groupBy: args.groupBy,
    metrics: args.metrics,
  });

  if (!insights) {
    return result;
  }

  return {
    ...result,
    insights,
  };
};
