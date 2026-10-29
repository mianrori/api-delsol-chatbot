const escapeCell = (value) => String(value ?? "Sin datos").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const number = (value) => value == null ? "Sin datos" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 20 }).format(value);
const allowed = new Set(["get_member_purchases", "search_members", "search_customers", "search_categories"]);
const dimensions = { month: ["Mes", "month"], year: ["Año", "year"], customer: ["Local", "customerName"], category: ["Rubro", "categoryName"] };
const metrics = { totalAmount: ["Importe", "totalAmount"], purchaseCount: ["Compras", "purchaseCount"] };
const table = (headers, rows) => [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)];
export const buildMemberPurchasesResponse = (calls = [], { restoreValue = (value) => value } = {}) => {
  const cell = (value) => escapeCell(restoreValue(value));
  const queries = calls.filter((call) => call.name === "get_member_purchases");
  if (queries.length !== 1 || calls.some((call) => !allowed.has(call.name))) return null;
  const { input = {}, result } = queries[0];
  if (!result || !Array.isArray(result.data) || !["summary", "detail"].includes(result.mode)) return null;
  const lines = ["**Compras del socio**", "", `Documento: ${cell(result.documentNumber)}.`];
  if (input.dateFrom && input.dateTo) lines.push(`Período: ${cell(input.dateFrom)} a ${cell(input.dateTo)}.`);
  const currency = (row) => cell(row.currency?.symbol || row.currency?.description);
  if (result.mode === "detail") {
    lines.push("", `Página ${result.page} de ${result.totalPages}; ${result.totalRows} compras en total.`);
    if (result.data.length) lines.push("", ...table(["Fecha", "Local", "Rubro", "Moneda", "Importe"], result.data.map((row) => [cell(row.purchaseDate), cell(row.customer?.name), cell(row.category?.name), currency(row), number(row.amount)])));
    else lines.push("No hay compras en esta página.");
    if (result.hasMore) lines.push("", "Puedes pedir «siguiente página» para ver más compras.");
  } else {
    const groups = (input.groupBy ?? []).map((key) => dimensions[key]);
    const values = (input.metrics ?? ["totalAmount", "purchaseCount"]).map((key) => metrics[key]);
    if (groups.some((item) => !item) || values.some((item) => !item)) return null;
    if (!result.data.length) lines.push("", "No se encontraron compras para los filtros consultados.");
    else lines.push("", ...table([...groups.map(([label]) => label), "Moneda", ...values.map(([label]) => label)],
      result.data.map((row) => [...groups.map(([, key]) => cell(row[key])), currency(row), ...values.map(([, key]) => number(row[key]))])));
  }
  return lines.join("\n");
};
