const numeric = (value) => typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(value) : "—";
const dimensions = { day: ["Fecha", "date"], month: ["Mes", "month"], year: ["Año", "year"], customer: ["Local", "customerName"], category: ["Rubro", "categoryName"] };
const reasons = { NO_SALES: "Sin registros de ventas", AREA_NOT_AVAILABLE: "Sin superficie contractual válida para las ventas del período",
  AREA_PARTIALLY_AVAILABLE: "Superficie contractual disponible solo parcialmente; no se calcula ventas por m² para el período completo",
  AREA_AMBIGUOUS: "Más de un contrato histórico aplicable; superficie ambigua, sin cálculo de ventas por m²",
  MIXED_CURRENCY: "Monedas diferentes; no se suman importes ni se calcula un indicador conjunto", CURRENCY_NOT_SUPPORTED: "Moneda no identificada o no admitida" };

export const buildSalesPerSqmResponse = (calls = [], { restoreValue = (value) => value } = {}) => {
  const queries = calls.filter((call) => call.name === "get_sales_per_sqm");
  if (queries.length !== 1 || calls.some((call) => !["get_sales_per_sqm", "search_customers", "search_categories"].includes(call.name))) return null;
  const { input = {}, result } = queries[0];
  if (!result || !result.exchange || result.success === false) return null;
  const rows = result.data ?? [result];
  if (!Array.isArray(rows) || rows.some((row) => !row.sales || !row.salesPerSqm || !row.area)) return null;
  const groups = input.groupBy ?? [];
  if (!Array.isArray(groups) || groups.some((key) => !dimensions[key])) return null;
  const cell = (value) => String(restoreValue(value) ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const headers = [...groups.map((key) => dimensions[key][0]), "Superficie (m²)", "Ventas totales (₲)", "Ventas por m² (₲)", "Ventas totales (USD)", "Ventas por m² (USD)"];
  const lines = ["**Ventas por m²**", "", `Período: ${cell(result.dateFrom)} a ${cell(result.dateTo)}.`, "",
    `| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) {
    const area = row.status === "AREA_AMBIGUOUS" ? "Ambigua" : row.area.min == null ? "—"
      : row.area.min === row.area.max ? numeric(row.area.min) : `${numeric(row.area.min)}–${numeric(row.area.max)}`;
    lines.push(`| ${[...groups.map((key) => cell(row[dimensions[key][1]])), area, numeric(row.sales.pyg),
      numeric(row.salesPerSqm.pyg), numeric(row.sales.usd), numeric(row.salesPerSqm.usd)].join(" | ")} |`);
  }
  if (!rows.length) lines.push("", "Sin registros de ventas para los filtros solicitados.");
  for (const reason of new Set(rows.map((row) => reasons[row.status]).filter(Boolean))) lines.push("", reason + ".");
  if (rows.some((row) => row.area.changedWithinPeriod)) lines.push("", "La superficie cambió dentro del período; el indicador suma las ventas divididas por la superficie aplicable a cada fecha, sin reemplazarla por la superficie actual.");
  if (result.exchange.available) lines.push("", `Equivalente en USD con cotización de venta actual de ${cell(result.exchange.source)}: 1 USD = ₲ ${numeric(result.exchange.sellRate)}. No es una cotización histórica.`);
  else if (result.exchange.reason === "EXCHANGE_RATE_UNAVAILABLE") lines.push("", "No fue posible obtener la cotización actual; se conservan los importes en su moneda original y no se inventa el equivalente en USD.");
  return lines.join("\n");
};
