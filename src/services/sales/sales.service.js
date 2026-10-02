import { getSalesRepository } from "../../repositories/sales/sales.repository.js";

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
  { dateFrom, dateTo, dayType, groupBy, metrics },
  connection,
) => {
  const normalizedMetrics = normalizeArray(metrics);

  return getSalesRepository({
    connection,
    dateFrom,
    dateTo,
    dayType,
    groupBy: normalizeArray(groupBy),
    metrics:
      normalizedMetrics.length > 0
        ? normalizedMetrics
        : ["totalAmount", "totalInvoices"],
  });
};
