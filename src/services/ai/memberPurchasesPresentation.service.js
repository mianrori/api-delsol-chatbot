const escapeCell = (value) => String(value ?? "Sin datos").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const number = (value) => value == null ? "Sin datos" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 20 }).format(value);
const allowed = new Set(["get_member_purchases", "search_members", "search_customers", "search_categories"]);
const dimensions = { month: ["Mes", "month"], year: ["Año", "year"], customer: ["Local", "customerName"], category: ["Rubro", "categoryName"] };
const metrics = { totalAmount: ["Importe", "totalAmount"], purchaseCount: ["Compras", "purchaseCount"] };
const table = (headers, rows) => [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)];
const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Only reuse the immediately preceding successful detail query. Narrative text
// and a document repeated in presentation instructions never select an identity.
export const resolveMemberPurchasesPage = ({ message, history = [], restoreValue = (value) => value }) => {
  const parts = String(message ?? "").split(/\s+Presenta una tabla con columnas exactas /i);
  if (parts.length > 2) return null;
  const request = normalize(parts[0]).replace(/[.!?]+$/, "");
  if (!/^(?:siguiente pagina(?: de las mismas compras, conserva filtros y tamano de pagina)?|ver mas|mostrar mas|continuar)$/.test(request)) return null;
  let start = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user" && history[i].content?.some((block) => typeof block.text === "string")) { start = i; break; }
  }
  if (start < 0) return null;
  const blocks = history.slice(start + 1).flatMap((item) => item.content ?? []);
  const calls = blocks.map((block) => block.toolUse).filter(Boolean);
  const queries = calls.filter((call) => call.name === "get_member_purchases");
  if (queries.length !== 1 || calls.some((call) => !allowed.has(call.name))) return null;
  const { input, toolUseId } = queries[0];
  if (!input || input.mode !== "detail" || Object.keys(input).some((key) => !["documentNumber", "customerIds", "categoryIds", "dateFrom", "dateTo", "mode", "groupBy", "metrics", "page", "rows", "knownTotalRows"].includes(key))) return null;
  const response = blocks.map((block) => block.toolResult).find((item) => item?.toolUseId === toolUseId);
  const result = response?.content?.find((block) => block.json)?.json;
  if (response?.status !== "success" || result?.mode !== "detail" || typeof input.documentNumber !== "string" || !input.documentNumber
    || typeof result.documentNumber !== "string"
    || String(restoreValue(input.documentNumber)) !== String(restoreValue(result.documentNumber))) return null;
  const { page, rows, totalRows, totalPages, hasMore, nextPage } = result;
  if (![page, rows, totalRows, totalPages].every(Number.isInteger) || page < 1 || rows < 1 || rows > 100 || totalRows < 0
    || totalPages !== Math.ceil(totalRows / rows) || (input.page ?? 1) !== page || (input.rows ?? 20) !== rows
    || typeof hasMore !== "boolean" || hasMore !== (page < totalPages)
    || nextPage !== (hasMore ? page + 1 : null)) return null;
  if (parts.length === 2) {
    const suffix = "Presenta una tabla con columnas exactas " + parts[1];
    const match = /Incluye encabezados Documento: (.+?) y Per[ií]odo: (\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})\./i.exec(suffix);
    if (!match || String(restoreValue(match[1])) !== String(restoreValue(input.documentNumber)) || match[2] !== input.dateFrom || match[3] !== input.dateTo) return null;
    const expected = `Presenta una tabla con columnas exactas Fecha, Local, Rubro, Moneda, Importe. Incluye encabezados Documento: ${match[1]} y Período: ${match[2]} a ${match[3]}. Usa PYG en Moneda y números en formato paraguayo sin símbolos dentro de los importes. Muestra todas las filas, sin muestra ni límite de grupos. Indica la paginación real con formato Página X de Y; N compras en total.`;
    if (normalize(suffix) !== normalize(expected)) return null;
  }
  if (!hasMore) return { answer: "No hay más páginas de compras para los filtros consultados." };
  return { input: { ...structuredClone(input), page: nextPage, rows, knownTotalRows: totalRows } };
};
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
