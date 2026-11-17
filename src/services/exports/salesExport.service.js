import crypto from "node:crypto";
import ExcelJS from "exceljs";

import { config } from "../../../config.js";
import { getSalesRepository } from "../../repositories/sales/sales.repository.js";
import { getRedisClient } from "../../database/redis.database.js";

const EXPORT_TTL_SECONDS = Number(
  config.salesExportTtlSeconds ?? config.memberAnalysisExportTtlSeconds ?? 600,
);

const EXPORT_KEY_PREFIX = "sales-export:";

const createExportError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

const normalizeUsername = (username) =>
  String(username ?? "")
    .trim()
    .toUpperCase();

const getExportKey = (exportId) => `${EXPORT_KEY_PREFIX}${exportId}`;

const sanitizeFileNamePart = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

const parseDate = (value) => {
  const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  return {
    day: match[1],
    month: match[2],
    year: match[3],
  };
};

const getPeriodFileNamePart = ({ dateFrom, dateTo }) => {
  const from = parseDate(dateFrom);
  const to = parseDate(dateTo);

  if (!from || !to) return null;

  if (
    from.day === "01" &&
    from.month === "01" &&
    to.day === "31" &&
    to.month === "12" &&
    from.year === to.year
  ) {
    return from.year;
  }

  return `${from.year}${from.month}${from.day}_a_${to.year}${to.month}${to.day}`;
};

const getGroupFileNamePart = (groupBy = []) => {
  if (!Array.isArray(groupBy) || groupBy.length === 0) return "resumen";

  const names = {
    customer: "local",
    category: "rubro",
    month: "mes",
    year: "anio",
  };

  return groupBy
    .map((item) => names[item] ?? sanitizeFileNamePart(item))
    .filter(Boolean)
    .join("_");
};

const generateSalesFileName = ({ args, createdAt }) => {
  const parts = ["ventas", `por_${getGroupFileNamePart(args?.groupBy)}`];

  const periodPart = getPeriodFileNamePart({
    dateFrom: args?.dateFrom,
    dateTo: args?.dateTo,
  });

  if (periodPart) parts.push(periodPart);

  if (args?.dayType === "weekend") parts.push("fines_de_semana");
  if (args?.dayType === "weekday") parts.push("dias_habiles");

  parts.push(new Date(createdAt).toISOString().slice(0, 10));

  const baseName = sanitizeFileNamePart(parts.filter(Boolean).join("_"));
  const safeBaseName = baseName.slice(0, 120) || "ventas";

  return `${safeBaseName}.xlsx`;
};

const getStoredExport = async ({ exportId, username }) => {
  const normalizedUsername = normalizeUsername(username);

  if (!exportId) {
    throw createExportError(
      "EXPORT_NOT_FOUND",
      "El identificador de exportación no fue informado.",
    );
  }

  if (!normalizedUsername) {
    throw createExportError(
      "EXPORT_FORBIDDEN",
      "No fue posible identificar al usuario.",
    );
  }

  const redis = await getRedisClient();
  const serialized = await redis.get(getExportKey(exportId));

  if (!serialized) {
    throw createExportError(
      "EXPORT_NOT_FOUND",
      "La exportación no existe o expiró. Vuelve a ejecutar la consulta.",
    );
  }

  let item;

  try {
    item = JSON.parse(serialized);
  } catch (error) {
    console.error(
      "Error interpretando exportación de ventas almacenada en Redis:",
      error,
    );

    throw createExportError(
      "EXPORT_INVALID",
      "La definición de la exportación no es válida.",
    );
  }

  if (item.expiresAt && Number(item.expiresAt) <= Date.now()) {
    await redis.del(getExportKey(exportId));

    throw createExportError(
      "EXPORT_EXPIRED",
      "La exportación expiró. Vuelve a ejecutar la consulta.",
    );
  }

  if (normalizeUsername(item.username) !== normalizedUsername) {
    throw createExportError(
      "EXPORT_FORBIDDEN",
      "La exportación no pertenece a este usuario.",
    );
  }

  return item;
};

export const createSalesExport = async ({ username, args, totalRecords }) => {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    throw new Error(
      "username es obligatorio para crear una exportación de ventas.",
    );
  }

  if (!args || typeof args !== "object") {
    throw new Error(
      "Los argumentos de ventas son obligatorios para crear una exportación.",
    );
  }

  if (!Number.isInteger(EXPORT_TTL_SECONDS) || EXPORT_TTL_SECONDS <= 0) {
    throw new Error(
      "SALES_EXPORT_TTL_SECONDS debe ser un entero mayor que cero.",
    );
  }

  const redis = await getRedisClient();
  const exportId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + EXPORT_TTL_SECONDS * 1000;

  const fileName = generateSalesFileName({
    args,
    createdAt: now,
  });

  const item = {
    exportId,
    username: normalizedUsername,
    args: cloneValue(args),
    fileName,
    totalRecords: Number(totalRecords ?? 0),
    createdAt: now,
    expiresAt,
  };

  await redis.set(getExportKey(exportId), JSON.stringify(item), {
    EX: EXPORT_TTL_SECONDS,
  });

  return {
    exportId,
    fileName,
    expiresAt: new Date(expiresAt).toISOString(),
  };
};

export const getSalesExport = async ({ exportId, username }) => {
  const item = await getStoredExport({ exportId, username });

  return {
    exportId: item.exportId,
    fileName: item.fileName,
    totalRecords: item.totalRecords,
    createdAt: new Date(item.createdAt).toISOString(),
    expiresAt: new Date(item.expiresAt).toISOString(),
  };
};

export const deleteSalesExport = async ({ exportId, username }) => {
  const item = await getStoredExport({ exportId, username });
  const redis = await getRedisClient();
  await redis.del(getExportKey(item.exportId));
  return true;
};

const buildWorksheetColumns = ({ groupBy = [], metrics = [] }) => {
  const columns = [];

  if (groupBy.includes("customer")) {
    columns.push({ header: "Local", key: "customerName", width: 40 });
  }

  if (groupBy.includes("category")) {
    columns.push({ header: "Rubro", key: "categoryName", width: 35 });
  }

  if (groupBy.includes("month")) {
    columns.push({ header: "Mes", key: "month", width: 12 });
  }

  if (groupBy.includes("year")) {
    columns.push({ header: "Año", key: "year", width: 12 });
  }

  if (metrics.includes("totalAmount")) {
    columns.push({ header: "Importe total", key: "totalAmount", width: 22 });
  }

  if (metrics.includes("totalInvoices")) {
    columns.push({
      header: "Cantidad de facturas",
      key: "totalInvoices",
      width: 22,
    });
  }

  columns.push(
    { header: "Moneda", key: "currencyDescription", width: 20 },
    {
      header: "Abreviatura moneda",
      key: "currencyAbbreviation",
      width: 20,
    },
  );

  return columns;
};

const mapSalesRow = (row = {}) => ({
  customerName: row.customerName ?? "",
  categoryName: row.categoryName ?? "",
  month: row.month ?? "",
  year: row.year ?? "",
  totalAmount: Number(row.totalAmount ?? 0),
  totalInvoices: Number(row.totalInvoices ?? 0),
  currencyDescription: row.currency?.description ?? "",
  currencyAbbreviation:
    row.currency?.abbreviation ?? row.currency?.symbol ?? "",
});

export const buildSalesExcel = async ({
  exportId,
  username,
  connection,
}) => {
  const exportDefinition = await getStoredExport({ exportId, username });
  const repositoryResult = await getSalesRepository({
    connection,
    ...exportDefinition.args,
  });

  const rows = Array.isArray(repositoryResult?.data)
    ? repositoryResult.data
    : repositoryResult
      ? [repositoryResult]
      : [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "delSol Shopping";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Ventas");

  worksheet.columns = buildWorksheetColumns({
    groupBy: exportDefinition.args?.groupBy ?? [],
    metrics: exportDefinition.args?.metrics ?? ["totalAmount", "totalInvoices"],
  });

  for (const row of rows) {
    worksheet.addRow(mapSalesRow(row));
  }

  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  if (worksheet.columnCount > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount },
    };
  }

  worksheet.getRow(1).font = { bold: true };

  if (metricsHas(exportDefinition.args?.metrics, "totalAmount")) {
    worksheet.getColumn("totalAmount").numFmt = "#,##0.00";
  }

  if (metricsHas(exportDefinition.args?.metrics, "totalInvoices")) {
    worksheet.getColumn("totalInvoices").numFmt = "#,##0";
  }

  const metadataWorksheet = workbook.addWorksheet("Información");

  metadataWorksheet.columns = [
    { header: "Campo", key: "field", width: 30 },
    { header: "Valor", key: "value", width: 70 },
  ];

  metadataWorksheet.addRows([
    { field: "Export ID", value: exportId },
    { field: "Usuario", value: username },
    { field: "Nombre de archivo", value: exportDefinition.fileName },
    { field: "Fecha desde", value: exportDefinition.args?.dateFrom ?? "" },
    { field: "Fecha hasta", value: exportDefinition.args?.dateTo ?? "" },
    {
      field: "Agrupación",
      value: Array.isArray(exportDefinition.args?.groupBy)
        ? exportDefinition.args.groupBy.join(", ")
        : "",
    },
    { field: "Registros exportados", value: rows.length },
    { field: "Fecha de generación", value: new Date().toISOString() },
  ]);

  metadataWorksheet.getRow(1).font = { bold: true };

  const fileName =
    exportDefinition.fileName ||
    generateSalesFileName({
      args: exportDefinition.args,
      createdAt: exportDefinition.createdAt ?? Date.now(),
    });

  return {
    workbook,
    fileName,
  };
};

const metricsHas = (metrics, metric) => {
  const normalizedMetrics = Array.isArray(metrics)
    ? metrics
    : ["totalAmount", "totalInvoices"];

  return normalizedMetrics.includes(metric);
};
