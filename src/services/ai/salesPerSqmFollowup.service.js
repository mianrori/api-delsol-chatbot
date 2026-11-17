const keys = new Set(["customerIds", "categoryIds", "dayType", "dateFrom", "dateTo", "groupBy"]);

// Explicit single-filter changes only. Resolved IDs come from the normal tool
// flow, never from parsing a commercial name or an Oracle username.
export const preserveSalesPerSqmFollowup = ({ message, history = [], input }) => {
  const request = String(message ?? "").normalize("NFC").trim();
  const period = /^Ahora cambia el per[ií]odo a (\d{2}\/\d{2}\/\d{4}) al (\d{2}\/\d{2}\/\d{4}); conserva los dem[aá]s filtros[.!]?$/i.exec(request);
  const entity = /^Ahora cambia el (local|rubro) a "[^"\r\n]+"; conserva los dem[aá]s filtros[.!]?$/i.exec(request);
  if ((!period && !entity) || !input || Object.keys(input).some((key) => !keys.has(key))) return null;
  let start = -1;
  for (let i = history.length - 1; i >= 0; i--) if (history[i].role === "user" && history[i].content?.some((b) => typeof b.text === "string")) { start = i; break; }
  if (start < 0) return null;
  const blocks = history.slice(start + 1).flatMap((m) => m.content ?? []);
  const calls = blocks.map((b) => b.toolUse).filter(Boolean);
  const queries = calls.filter((c) => c.name === "get_sales_per_sqm");
  if (queries.length !== 1 || calls.some((c) => !["get_sales_per_sqm", "search_customers", "search_categories"].includes(c.name))) return null;
  const previous = queries[0], resultBlock = blocks.map((b) => b.toolResult).find((r) => r?.toolUseId === previous.toolUseId);
  const result = resultBlock?.content?.find((b) => b.json)?.json;
  if (resultBlock?.status !== "success" || !result || result.success === false || result.error || !previous.input
    || Object.keys(previous.input).some((key) => !keys.has(key)) || result.dateFrom !== previous.input.dateFrom || result.dateTo !== previous.input.dateTo) return null;
  if (period) {
    if (input.dateFrom !== period[1] || input.dateTo !== period[2]) return null;
    return { ...structuredClone(previous.input), dateFrom: period[1], dateTo: period[2] };
  }
  const key = entity[1].toLowerCase() === "local" ? "customerIds" : "categoryIds";
  if (!Array.isArray(input[key]) || !input[key].length || input[key].some((id) => typeof id !== "string" || !id.trim())) return null;
  return { ...structuredClone(previous.input), [key]: [...input[key]] };
};
