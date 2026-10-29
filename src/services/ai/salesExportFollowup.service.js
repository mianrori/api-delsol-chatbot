const normalize = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");

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
