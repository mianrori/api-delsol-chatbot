const normalize = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");

const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const resolveSalesBreakdown = ({ message, history = [] }) => {
  const match = /^ahora por (local|rubro)$/.exec(normalize(message));
  if (!match) return null;
  let start = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].role === "user" && history[index].content?.some((block) => typeof block.text === "string")) { start = index; break; }
  }
  if (start < 0) return null;
  const blocks = history.slice(start + 1).flatMap((item) => item.content ?? []);
  const calls = blocks.map((block) => block.toolUse).filter(Boolean);
  const sales = calls.filter((call) => call.name === "get_sales");
  if (sales.length !== 1 || calls.some((call) => !["get_sales", "search_customers", "search_categories"].includes(call.name))) return null;
  const call = sales[0];
  const response = blocks.map((block) => block.toolResult).find((result) => result?.toolUseId === call.toolUseId);
  const result = response?.content?.find((block) => block.json)?.json;
  if (response?.status !== "success" || !result || result.success === false || result.error) return null;
  if (!Array.isArray(result.data) && typeof result.totalAmount !== "number" && typeof result.totalInvoices !== "number") return null;
  if (Object.keys(call.input ?? {}).some((key) => !["dateFrom", "dateTo", "customerIds", "categoryIds", "dayType", "groupBy", "metrics"].includes(key))) return null;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(call.input?.dateFrom ?? "") || !/^\d{2}\/\d{2}\/\d{4}$/.test(call.input?.dateTo ?? "")) return null;
  return { ...structuredClone(call.input), groupBy: [match[1] === "local" ? "customer" : "category"] };
};

const explicitMonthlySales = (message) => {
  const request = normalize(message).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/,/g, "").replace(/\s+/g, " ")
    .replace(/^(?:muestrame|mostrame|mostrar|dame|consulta|consultar|ver) (?:las )?/, "");
  const periodFirst = /^ventas (?:de|del) ([a-z]+) (?:de )?((?:19|20)\d{2}) por (local|rubro)(?: (?:con|incluyendo) (.+))?$/.exec(request);
  const groupFirst = /^ventas por (local|rubro) (?:de|del) ([a-z]+) (?:de )?((?:19|20)\d{2})(?: (?:con|incluyendo) (.+))?$/.exec(request);
  if (!periodFirst && !groupFirst) return null;
  const [, monthName, year, group, metricText] = periodFirst ?? [null, groupFirst[2], groupFirst[3], groupFirst[1], groupFirst[4]];
  const month = months.indexOf(monthName === "setiembre" ? "septiembre" : monthName) + 1;
  if (!month) return null;
  let metrics = ["totalAmount", "totalInvoices"];
  if (metricText) {
    const amount = "(?:montos?(?: total(?:es)?)?|importes?(?: total(?:es)?)?)";
    const invoices = "(?:(?:cantidad|numero) de )?facturas";
    if (new RegExp(`^${amount} y ${invoices}$`).test(metricText)) metrics = ["totalAmount", "totalInvoices"];
    else if (new RegExp(`^${amount}$`).test(metricText)) metrics = ["totalAmount"];
    else if (new RegExp(`^${invoices}$`).test(metricText)) metrics = ["totalInvoices"];
    else return null;
  }
  const padded = String(month).padStart(2, "0");
  return { dateFrom: `01/${padded}/${year}`, dateTo: `${new Date(Date.UTC(Number(year), month, 0)).getUTCDate()}/${padded}/${year}`, groupBy: [group === "local" ? "customer" : "category"], metrics };
};

export const resolveEquivalentSalesExport = ({ message, history = [] }) => {
  const requested = explicitMonthlySales(message);
  if (!requested) return null;
  const starts = history.flatMap((item, index) => item.role === "user" && item.content?.some((block) => typeof block.text === "string") ? [index] : []);
  for (let turn = starts.length - 1; turn >= 0; turn--) {
    const blocks = history.slice(starts[turn] + 1, starts[turn + 1] ?? history.length).flatMap((item) => item.content ?? []);
    const calls = blocks.map((block) => block.toolUse).filter(Boolean);
    if (!calls.length) {
      const previous = history[starts[turn]].content.filter((block) => typeof block.text === "string").map((block) => block.text).join("\n");
      if (JSON.stringify(explicitMonthlySales(previous)) !== JSON.stringify(requested)) return null;
      continue;
    }
    const sales = calls.filter((call) => call.name === "get_sales");
    if (sales.length !== 1 || calls.some((call) => !["get_sales", "search_customers", "search_categories"].includes(call.name))) return null;
    const call = sales[0], input = call.input;
    const response = blocks.map((block) => block.toolResult).find((result) => result?.toolUseId === call.toolUseId);
    const result = response?.content?.find((block) => block.json)?.json;
    if (response?.status !== "success" || result?.resultSet?.fullResultAvailableInExport !== true || !Array.isArray(result.data)) return null;
    // This grammar describes an unfiltered monthly breakdown. Do not replay a
    // named/local/category/day filter that the new wording cannot confirm.
    if (!input || Object.keys(input).some((key) => !["dateFrom", "dateTo", "groupBy", "metrics", "customerIds", "categoryIds", "dayType"].includes(key))) return null;
    if ([input.customerIds, input.categoryIds].some((ids) => ids != null && (!Array.isArray(ids) || ids.length)) || input.dayType != null) return null;
    if (input.dateFrom !== requested.dateFrom || input.dateTo !== requested.dateTo || JSON.stringify(input.groupBy) !== JSON.stringify(requested.groupBy)) return null;
    const priorMetrics = input.metrics ?? ["totalAmount", "totalInvoices"];
    if (!Array.isArray(priorMetrics) || JSON.stringify([...priorMetrics].sort()) !== JSON.stringify([...requested.metrics].sort())) return null;
    return structuredClone(input);
  }
  return null;
};

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
