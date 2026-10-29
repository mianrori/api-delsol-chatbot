const normalize = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");

const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const resolveSalesCategoryRemoval = ({ message, history = [] }) => {
  const request = normalize(message).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/,/g, "").replace(/\s+/g, " ");
  // Match the entire instruction: extra filters, dates or analyses must stay in
  // the normal interpretation flow rather than being silently discarded.
  const match = /^(?:ahora )?(?:todos los rubros|(?:quita|quitar|elimina|eliminar) el filtro de rubro)(?: manteniendo(?: ([a-z]+) de ((?:19|20)\d{2})| el (?:mismo )?periodo)(?: y el desglose por (local|rubro))?)?$/.exec(request);
  if (!match) return null;
  let start = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].role === "user" && history[index].content?.some((block) => typeof block.text === "string")) { start = index; break; }
  }
  if (start < 0) return null;
  const blocks = history.slice(start + 1).flatMap((item) => item.content ?? []);
  const calls = blocks.map((block) => block.toolUse).filter(Boolean);
  if (!calls.length) {
    const previous = history[start].content.filter((block) => typeof block.text === "string").map((block) => block.text).join("\n");
    return normalize(previous) === normalize(message)
      ? resolveSalesCategoryRemoval({ message, history: history.slice(0, start) })
      : null;
  }
  const sales = calls.filter((call) => call.name === "get_sales");
  if (sales.length !== 1 || calls.some((call) => !["get_sales", "search_customers", "search_categories"].includes(call.name))) return null;
  const call = sales[0];
  const response = blocks.map((block) => block.toolResult).find((result) => result?.toolUseId === call.toolUseId);
  const result = response?.content?.find((block) => block.json)?.json;
  if (response?.status !== "success" || !Array.isArray(result?.data)) return null;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(call.input?.dateFrom ?? "") || !/^\d{2}\/\d{2}\/\d{4}$/.test(call.input?.dateTo ?? "")) return null;
  if (match[1]) {
    const month = months.indexOf(match[1]) + 1;
    if (!month) return null;
    const paddedMonth = String(month).padStart(2, "0"), year = Number(match[2]);
    // "Manteniendo" may confirm the current period, never replace it with
    // dates from an older matching result in the conversation.
    if (call.input.dateFrom !== `01/${paddedMonth}/${year}` || call.input.dateTo !== `${new Date(Date.UTC(year, month, 0)).getUTCDate()}/${paddedMonth}/${year}`) return null;
  }
  const input = structuredClone(call.input);
  delete input.categoryIds;
  if (match[3]) input.groupBy = [match[3] === "local" ? "customer" : "category"];
  return input;
};

// Only replay the same explicit question in consecutive turns. Do not infer new
// filters from narrative answers or reuse a sales query across another topic.
export const resolveRepeatedSalesExport = ({ message, history = [] }) => {
  const request = normalize(message);
  if (!request) return null;
  const starts = history.flatMap((item, index) => item.role === "user" && item.content?.some((block) => typeof block.text === "string") ? [index] : []);
  for (let turn = starts.length - 1; turn >= 0; turn--) {
    const start = starts[turn], end = starts[turn + 1] ?? history.length;
    const previous = history[start].content.filter((block) => typeof block.text === "string").map((block) => block.text).join("\n");
    if (normalize(previous) !== request) return null;
    const blocks = history.slice(start + 1, end).flatMap((item) => item.content ?? []);
    const calls = blocks.map((block) => block.toolUse).filter(Boolean);
    // Older repeats may have answered from history without requesting any tool.
    if (!calls.length) continue;
    const sales = calls.filter((call) => call.name === "get_sales");
    if (sales.length !== 1 || calls.some((call) => !["get_sales", "search_customers", "search_categories"].includes(call.name))) return null;
    const call = sales[0];
    const response = blocks.map((block) => block.toolResult).find((result) => result?.toolUseId === call.toolUseId);
    const result = response?.content?.find((block) => block.json)?.json;
    if (response?.status !== "success" || result?.resultSet?.fullResultAvailableInExport !== true || !Array.isArray(result.data)) return null;
    // A relative period must be interpreted again against the current date.
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(call.input?.dateFrom ?? "") || !/^\d{2}\/\d{2}\/\d{4}$/.test(call.input?.dateTo ?? "")) return null;
    if (/\b(hoy|ayer|anteayer|actual|ultimo|último|ultima|última|este|esta|pasado|pasada)\b/i.test(request)) return null;
    return structuredClone(call.input);
  }
  return null;
};
